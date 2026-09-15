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

    // Atomic budgets cap writes and UV/hot-set memory even with rotating IDs.
    await this.redisService.evalNumber(
      `
      local n = tonumber(redis.call('GET', KEYS[4]) or '0')
      if n >= 600 then return 0 end
      redis.call('INCR', KEYS[4]); if n == 0 then redis.call('EXPIRE', KEYS[4], 60) end
      redis.call('INCR', KEYS[1])
      if redis.call('SCARD', KEYS[2]) < 100000 then redis.call('SADD', KEYS[2], ARGV[1]) end
      if redis.call('ZSCORE', KEYS[3], ARGV[2]) or redis.call('ZCARD', KEYS[3]) < 10000 then
        redis.call('ZINCRBY', KEYS[3], 1, ARGV[2])
      end
      for i=1,3 do redis.call('EXPIRE', KEYS[i], ARGV[3]) end
      return 1`,
      [pageViewKey, uniqueVisitorKey, hotArticlesKey, 'dashboard:budget:views'],
      [
        input.visitorId.slice(0, 160),
        input.articleId.slice(0, 128),
        String(this.metricsTtlSeconds),
      ],
    );
  }

  async updateVisitorPresence(
    presenceMember: string,
    ttlSeconds: number,
  ): Promise<number> {
    const ttl = Math.min(300, Math.max(10, ttlSeconds));
    return this.redisService.evalNumber(
      `
      local count = tonumber(redis.call('GET', KEYS[2]) or '0')
      if count >= 1200 then return redis.call('ZCARD', KEYS[1]) end
      redis.call('INCR', KEYS[2]); if count == 0 then redis.call('EXPIRE', KEYS[2], 60) end
      redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, tonumber(ARGV[1])-tonumber(ARGV[3])*1000)
      if redis.call('ZSCORE', KEYS[1], ARGV[2]) or redis.call('ZCARD', KEYS[1]) < 10000 then
        redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
      end
      redis.call('EXPIRE', KEYS[1], ARGV[3])
      return redis.call('ZCARD', KEYS[1])`,
      [this.onlinePresenceKey, 'dashboard:budget:presence'],
      [String(Date.now()), presenceMember.slice(0, 160), String(ttl)],
    );
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
