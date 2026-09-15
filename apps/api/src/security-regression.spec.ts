import { validateEnvironment } from './config/env.validation';
import { AuthRateLimitGuard } from './auth/auth-rate-limit.guard';
import { DashboardGateway } from './dashboard/dashboard.gateway';
import { ExecutionContext } from '@nestjs/common';
import { RedisService } from './redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from './users/users.service';
import { DashboardService } from './dashboard/dashboard.service';
import { Socket } from 'socket.io';

describe('security regression', () => {
  it.each([
    undefined,
    '',
    '   ',
    'please-change-me',
    'x'.repeat(31),
    'please-change-me'.repeat(3),
  ])('rejects unsafe JWT secret %s', (JWT_SECRET) => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'test',
        REDIS_URL: 'test',
        JWT_SECRET,
      }),
    ).toThrow();
  });
  it('accepts an explicit sufficiently long secret', () => {
    expect(
      validateEnvironment({
        DATABASE_URL: 'test',
        REDIS_URL: 'test',
        JWT_SECRET: 'a8c09d2f6e7b04153cba876509d4ef21',
      }).JWT_SECRET,
    ).toHaveLength(32);
  });
  const context = (forwarded: string) =>
    ({
      getHandler: () => function login() {},
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '127.0.0.1',
          socket: {},
          headers: { 'x-forwarded-for': forwarded },
          body: { account: ' User ' },
        }),
      }),
    }) as unknown as ExecutionContext;
  it('uses the same limiter key despite spoofed forwarded headers', async () => {
    const evalNumber = jest.fn().mockResolvedValue(1);
    const guard = new AuthRateLimitGuard({
      evalNumber,
    } as unknown as RedisService);
    await guard.canActivate(context('1.1.1.1'));
    await guard.canActivate(context('2.2.2.2'));
    expect(evalNumber.mock.calls[0]).toEqual(evalNumber.mock.calls[1]);
  });
  it('rejects rate-limited and Redis-unavailable authentication', async () => {
    const evalNumber = jest.fn().mockResolvedValue(0);
    const guard = new AuthRateLimitGuard({
      evalNumber,
    } as unknown as RedisService);
    await expect(guard.canActivate(context(''))).rejects.toMatchObject({
      status: 429,
    });
    evalNumber.mockRejectedValue(new Error('offline'));
    await expect(guard.canActivate(context(''))).rejects.toMatchObject({
      status: 503,
    });
  });
  const setup = () => {
    const updateVisitorPresence = jest.fn().mockResolvedValue(1);
    const gateway = new DashboardGateway(
      { get: () => '30' } as unknown as ConfigService,
      {} as JwtService,
      {} as UsersService,
      { updateVisitorPresence } as unknown as DashboardService,
    );
    const client = {
      id: 'abc',
      handshake: { query: { visitorId: 'original' } },
      data: {},
      disconnect: jest.fn(),
      emit: jest.fn(),
    } as unknown as Socket;
    return { gateway, client, updateVisitorPresence };
  };
  it.each([[], {}, 1, 'x'.repeat(129), ''])(
    'rejects invalid handshake visitor IDs',
    async (value) => {
      const { gateway, client, updateVisitorPresence } = setup();
      client.handshake.query.visitorId = value as string;
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
      expect(updateVisitorPresence).not.toHaveBeenCalled();
    },
  );
  it('fixes identity and prevents concurrent heartbeat writes', async () => {
    const { gateway, client, updateVisitorPresence } = setup();
    await gateway.handleConnection(client);
    expect(
      await gateway.handlePresenceHeartbeat(client, { visitorId: 'different' }),
    ).toEqual({ ok: false });
    client.data.nextHeartbeatAt = 0;
    expect(
      await gateway.handlePresenceHeartbeat(client, { visitorId: 'different' }),
    ).toEqual({ ok: false });
    let finish!: (value: number) => void;
    updateVisitorPresence.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = gateway.handlePresenceHeartbeat(client);
    expect(await gateway.handlePresenceHeartbeat(client)).toEqual({
      ok: false,
    });
    finish(1);
    await pending;
    expect(updateVisitorPresence).toHaveBeenCalledTimes(2);
    expect(updateVisitorPresence).toHaveBeenLastCalledWith(
      'visitor:original',
      30,
    );
  });
});
