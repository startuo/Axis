import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
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
    await this.dashboardService
      .trackArticleView({
        articleId: response.id,
        visitorId,
      })
      .catch(() => undefined);
    void this.dashboardGateway.onArticleDetailViewed();
  }

  private resolveVisitorId(request: DashboardRequest): string {
    // Client IDs are untrusted; hash the trusted transport address for bounded UV identity.
    return createHash('sha256')
      .update(request.ip || request.socket.remoteAddress || 'unknown')
      .digest('hex');
  }
}
