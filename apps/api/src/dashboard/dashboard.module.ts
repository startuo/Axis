import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { DashboardGateway } from './dashboard.gateway';
import { DashboardService } from './dashboard.service';
import { ArticleViewDashboardInterceptor } from './interceptors/article-view-dashboard.interceptor';

@Module({
  imports: [AuthModule, UsersModule],
  providers: [
    DashboardService,
    DashboardGateway,
    ArticleViewDashboardInterceptor,
  ],
  exports: [
    DashboardService,
    DashboardGateway,
    ArticleViewDashboardInterceptor,
  ],
})
export class DashboardModule {}
