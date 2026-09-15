import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { AppEnvironment } from '../config/env.validation';
import { UsersService } from '../users/users.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DashboardService } from './dashboard.service';

interface DashboardSocketData {
  clientType?: 'admin' | 'visitor';
  presenceMember?: string;
  userId?: string;
  nextHeartbeatAt?: number;
  heartbeatPending?: boolean;
}

@WebSocketGateway({
  namespace: '/dashboard',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class DashboardGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server;

  private readonly adminRoom = 'dashboard:admins';
  private readonly pushIntervalMs: number;
  private readonly visitorTtlSeconds: number;
  private broadcastTimer?: NodeJS.Timeout;
  private broadcastPending = false;

  constructor(
    private readonly configService: ConfigService<AppEnvironment, true>,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly dashboardService: DashboardService,
  ) {
    this.pushIntervalMs = Number(
      this.configService.get('DASHBOARD_PUSH_INTERVAL_MS', { infer: true }),
    );
    this.visitorTtlSeconds = Number(
      this.configService.get('ONLINE_VISITOR_TTL_SECONDS', { infer: true }),
    );
  }

  afterInit() {
    if (this.pushIntervalMs <= 0) {
      return;
    }

    this.broadcastTimer = setInterval(() => {
      void this.broadcastDashboardSnapshot('scheduled').catch(() => undefined);
    }, this.pushIntervalMs);
  }

  async handleConnection(client: Socket) {
    const clientType = this.getClientType(client);

    if (clientType === 'admin') {
      const isAdmin = await this.authenticateAdminClient(client);
      if (!isAdmin) {
        client.emit('dashboard:error', {
          message: 'Admin authentication required',
        });
        client.disconnect(true);
        return;
      }

      await client.join(this.adminRoom);
      await this.emitSnapshotToClient(client, 'connected');
      return;
    }

    const rawId = client.handshake.query.visitorId;
    if (
      rawId !== undefined &&
      (typeof rawId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(rawId))
    ) {
      client.disconnect(true);
      return;
    }
    const presenceMember = this.resolvePresenceMember(client);
    const state = this.getSocketState(client);
    state.clientType = 'visitor';
    state.presenceMember = presenceMember;
    state.nextHeartbeatAt = Date.now() + 5000;
    state.heartbeatPending = true;
    try {
      await this.dashboardService.updateVisitorPresence(
        presenceMember,
        this.visitorTtlSeconds,
      );
    } catch {
      client.disconnect(true);
      return;
    } finally {
      state.heartbeatPending = false;
    }
    client.emit('presence:ack', { visitorId: presenceMember });
  }

  async handleDisconnect(client: Socket) {
    const state = this.getSocketState(client);
    if (state.clientType !== 'visitor') {
      return;
    }

    const presenceMember = state.presenceMember;
    if (presenceMember?.startsWith('socket:')) {
      await this.dashboardService.removeVisitorPresence(presenceMember);
    }
  }

  @SubscribeMessage('presence:heartbeat')
  async handlePresenceHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { visitorId?: string },
  ) {
    const state = this.getSocketState(client);
    if (
      state.clientType !== 'visitor' ||
      !state.presenceMember ||
      state.heartbeatPending ||
      Date.now() < (state.nextHeartbeatAt ?? 0)
    ) {
      return { ok: false };
    }
    // Identity is fixed at handshake; event payloads cannot add Redis members.
    if (
      payload !== undefined &&
      (typeof payload !== 'object' ||
        payload === null ||
        Array.isArray(payload) ||
        (payload.visitorId !== undefined &&
          (typeof payload.visitorId !== 'string' ||
            payload.visitorId.length > 160 ||
            (payload.visitorId !== state.presenceMember &&
              `visitor:${payload.visitorId}` !== state.presenceMember))))
    ) {
      return { ok: false };
    }
    state.nextHeartbeatAt = Date.now() + 5000;
    state.heartbeatPending = true;
    try {
      const onlineVisitors = await this.dashboardService.updateVisitorPresence(
        state.presenceMember,
        this.visitorTtlSeconds,
      );
      return { ok: true, onlineVisitors, visitorId: state.presenceMember };
    } catch {
      return { ok: false };
    } finally {
      state.heartbeatPending = false;
    }
  }

  async broadcastDashboardSnapshot(reason: string) {
    if (this.broadcastPending) return;
    this.broadcastPending = true;
    try {
      const snapshot = await this.dashboardService.getDashboardSnapshot(
        this.visitorTtlSeconds,
      );

      this.server.to(this.adminRoom).emit('dashboard:snapshot', {
        reason,
        data: snapshot,
      });
    } finally {
      this.broadcastPending = false;
    }
  }

  async onArticleDetailViewed() {
    // Scheduled snapshots coalesce public traffic into a bounded query rate.
  }

  onModuleDestroy() {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
    }
  }

  private async emitSnapshotToClient(client: Socket, reason: string) {
    const snapshot = await this.dashboardService.getDashboardSnapshot(
      this.visitorTtlSeconds,
    );
    client.emit('dashboard:snapshot', {
      reason,
      data: snapshot,
    });
  }

  private getClientType(client: Socket): 'admin' | 'visitor' {
    const rawValue = client.handshake.query.clientType;
    return rawValue === 'admin' ? 'admin' : 'visitor';
  }

  private resolvePresenceMember(client: Socket, visitorId?: string): string {
    const handshakeVisitorId = client.handshake.query.visitorId;
    const normalizedVisitorId =
      visitorId ??
      (typeof handshakeVisitorId === 'string' ? handshakeVisitorId : undefined);

    if (normalizedVisitorId && normalizedVisitorId.trim().length > 0) {
      return `visitor:${normalizedVisitorId.trim()}`;
    }

    return `socket:${client.id}`;
  }

  private async authenticateAdminClient(client: Socket): Promise<boolean> {
    const token = this.extractToken(client);
    if (!token) {
      return false;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get('JWT_SECRET', { infer: true }),
      });
      const user = await this.usersService.findById(payload.sub);

      if (!user || user.role !== Role.ADMIN) {
        return false;
      }

      const state = this.getSocketState(client);
      state.clientType = 'admin';
      state.userId = user.id;
      return true;
    } catch {
      return false;
    }
  }

  private getSocketState(client: Socket): DashboardSocketData {
    return client.data as DashboardSocketData;
  }

  private extractToken(client: Socket): string | null {
    const handshakeAuth = client.handshake.auth as { token?: unknown };
    const authToken = handshakeAuth.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken.startsWith('Bearer ')
        ? authToken.slice('Bearer '.length)
        : authToken;
    }

    const authorizationHeader = client.handshake.headers.authorization;
    if (
      typeof authorizationHeader === 'string' &&
      authorizationHeader.startsWith('Bearer ')
    ) {
      return authorizationHeader.slice('Bearer '.length);
    }

    return null;
  }
}
