import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { from } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import { DashboardGateway } from '../dashboard.gateway';
import { DashboardService } from '../dashboard.service';

interface ArticleDetailResponse {
  id: string;
}

type DashboardRequest = Request & {
  headers: Request['headers'] & {
    'x-visitor-id'?: string;
    'x-forwarded-for'?: string;
  };
  query: Request['query'] & {
    visitorId?: string;
  };
};

@Injectable()
export class ArticleViewDashboardInterceptor implements NestInterceptor {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly dashboardGateway: DashboardGateway,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<DashboardRequest>();

    return next
      .handle()
      .pipe(
        mergeMap((response: ArticleDetailResponse) =>
          from(this.afterArticleViewed(request, response)).pipe(
            map(() => response),
          ),
        ),
      );
  }

  private async afterArticleViewed(
    request: DashboardRequest,
    response: ArticleDetailResponse,
  ) {
    const visitorId = this.resolveVisitorId(request);
    await this.dashboardService.trackArticleView({
      articleId: response.id,
      visitorId,
    });
    void this.dashboardGateway.onArticleDetailViewed();
  }

  private resolveVisitorId(request: DashboardRequest): string {
    const headerVisitorId = request.headers['x-visitor-id'];
    if (
      typeof headerVisitorId === 'string' &&
      headerVisitorId.trim().length > 0
    ) {
      return `visitor:${headerVisitorId.trim()}`;
    }

    const queryVisitorId = request.query.visitorId;
    if (
      typeof queryVisitorId === 'string' &&
      queryVisitorId.trim().length > 0
    ) {
      return `visitor:${queryVisitorId.trim()}`;
    }

    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
      const firstIp = forwardedFor.split(',')[0]?.trim();
      if (firstIp) {
        return `ip:${firstIp}`;
      }
    }

    return `ip:${request.ip}`;
  }
}
