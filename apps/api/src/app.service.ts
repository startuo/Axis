import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getAppInfo() {
    return {
      name: "STAR's Blog API",
      status: 'ok',
      phase: 'phase-4-dashboard-realtime',
      timestamp: new Date().toISOString(),
    };
  }

  async getHealth() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      database: 'up',
      timestamp: new Date().toISOString(),
    };
  }
}
