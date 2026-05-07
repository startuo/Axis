import { Injectable } from '@nestjs/common';
import { ArticleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  DashboardSnapshot,
  DashboardSnapshotHotArticle,
} from './interfaces/dashboard-snapshot.interface';

interface TrackArticleViewInput {
  articleId: string;
  visitorId: string;
}

@Injectable()
export class DashboardService {
  private readonly timezone = 'Asia/Shanghai';
  private readonly metricsTtlSeconds = 60 * 60 * 24 * 7;
  private readonly onlinePresenceKey = 'dashboard:presence:visitors';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async trackArticleView(input: TrackArticleViewInput) {
    const dateKey = this.getDateKey();
    const pageViewKey = this.getPageViewKey(dateKey);
    const uniqueVisitorKey = this.getUniqueVisitorKey(dateKey);
    const hotArticlesKey = this.getHotArticlesKey(dateKey);

    await Promise.all([
      this.redisService.increment(pageViewKey),
      this.redisService.setAdd(uniqueVisitorKey, input.visitorId),
      this.redisService.sortedSetIncrementBy(
        hotArticlesKey,
        1,
        input.articleId,
      ),
    ]);

    await Promise.all([
      this.redisService.expire(pageViewKey, this.metricsTtlSeconds),
      this.redisService.expire(uniqueVisitorKey, this.metricsTtlSeconds),
      this.redisService.expire(hotArticlesKey, this.metricsTtlSeconds),
    ]);
  }

  async updateVisitorPresence(
    presenceMember: string,
    ttlSeconds: number,
  ): Promise<number> {
    const now = Date.now();
    await this.redisService.sortedSetAdd(
      this.onlinePresenceKey,
      now,
      presenceMember,
    );
    return this.getOnlineVisitorCount(ttlSeconds);
  }

  async removeVisitorPresence(presenceMember: string): Promise<void> {
    await this.redisService.sortedSetRemove(
      this.onlinePresenceKey,
      presenceMember,
    );
  }

  async getDashboardSnapshot(ttlSeconds: number): Promise<DashboardSnapshot> {
    const dateKey = this.getDateKey();
    const [onlineVisitors, todayPageViews, todayUniqueVisitors, hotArticles] =
      await Promise.all([
        this.getOnlineVisitorCount(ttlSeconds),
        this.getPageViewCount(dateKey),
        this.getUniqueVisitorCount(dateKey),
        this.getHotArticles(dateKey),
      ]);

    return {
      onlineVisitors,
      todayPageViews,
      todayUniqueVisitors,
      todayNewReadCount: todayPageViews,
      hotArticles,
      generatedAt: new Date().toISOString(),
    };
  }

  private async getOnlineVisitorCount(ttlSeconds: number): Promise<number> {
    await this.cleanupExpiredVisitors(ttlSeconds);
    return this.redisService.sortedSetCardinality(this.onlinePresenceKey);
  }

  private async cleanupExpiredVisitors(ttlSeconds: number) {
    const cutoffTimestamp = Date.now() - ttlSeconds * 1000;
    await this.redisService.sortedSetRemoveByScore(
      this.onlinePresenceKey,
      0,
      cutoffTimestamp,
    );
  }

  private async getPageViewCount(dateKey: string): Promise<number> {
    const value = await this.redisService.get(this.getPageViewKey(dateKey));
    return this.parseNumber(value);
  }

  private async getUniqueVisitorCount(dateKey: string): Promise<number> {
    return this.redisService.setCardinality(this.getUniqueVisitorKey(dateKey));
  }

  private async getHotArticles(
    dateKey: string,
  ): Promise<DashboardSnapshotHotArticle[]> {
    const ranked = await this.redisService.sortedSetRangeWithScoresDesc(
      this.getHotArticlesKey(dateKey),
      0,
      19,
    );

    if (ranked.length === 0) {
      return [];
    }

    const articleIds = ranked.map((entry) => entry.value);
    const articles = await this.prisma.article.findMany({
      where: {
        id: {
          in: articleIds,
        },
        status: ArticleStatus.PUBLISHED,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        viewCount: true,
      },
    });

    const articleMap = new Map(
      articles.map((article) => [article.id, article]),
    );

    return ranked
      .map((entry) => {
        const article = articleMap.get(entry.value);
        if (!article) {
          return null;
        }

        return {
          articleId: article.id,
          slug: article.slug,
          title: article.title,
          todayViewCount: entry.score,
          totalViewCount: article.viewCount,
        };
      })
      .filter(
        (article): article is DashboardSnapshotHotArticle => article !== null,
      )
      .slice(0, 5);
  }

  private getDateKey(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private getPageViewKey(dateKey: string): string {
    return `dashboard:metrics:pv:${dateKey}`;
  }

  private getUniqueVisitorKey(dateKey: string): string {
    return `dashboard:metrics:uv:${dateKey}`;
  }

  private getHotArticlesKey(dateKey: string): string {
    return `dashboard:metrics:hot:${dateKey}`;
  }

  private parseNumber(value: string | null | undefined): number {
    if (!value) {
      return 0;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}
