import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AppEnvironment } from '../config/env.validation';

@Injectable()
export class ArticleViewsService {
  private readonly logger = new Logger(ArticleViewsService.name);
  private readonly activeKey = 'article:view:deltas';
  private readonly flushingKey = 'article:view:deltas:flushing';
  private readonly flushIntervalMs: number;
  private lastFlushAt = 0;

  constructor(
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    configService: ConfigService<AppEnvironment, true>,
  ) {
    this.flushIntervalMs = Number(
      configService.get('ARTICLE_VIEW_FLUSH_INTERVAL_MS', { infer: true }),
    );
  }

  async incrementAndGetLiveViewCount(
    articleId: string,
    persistedViewCount: number,
  ): Promise<number> {
    const pendingDelta = await this.redisService.hashIncrementBy(
      this.activeKey,
      articleId,
      1,
    );
    const flushingDelta = await this.getHashFieldNumber(
      this.flushingKey,
      articleId,
    );

    return persistedViewCount + pendingDelta + flushingDelta;
  }

  async mergeLiveViewCounts<
    TArticle extends {
      id: string;
      viewCount: number;
    },
  >(articles: TArticle[]): Promise<TArticle[]> {
    if (articles.length === 0) {
      return articles;
    }

    const ids = articles.map((article) => article.id);
    const [activeValues, flushingValues] = await Promise.all([
      this.redisService.hashMultiGet(this.activeKey, ids),
      this.redisService.hashMultiGet(this.flushingKey, ids),
    ]);

    return articles.map((article, index) => ({
      ...article,
      viewCount:
        article.viewCount +
        this.parseNumber(activeValues[index]) +
        this.parseNumber(flushingValues[index]),
    }));
  }

  @Interval(1000)
  async flushArticleViewCounts() {
    if (this.flushIntervalMs <= 0) {
      return;
    }

    if (Date.now() - this.lastFlushAt < this.flushIntervalMs) {
      return;
    }

    this.lastFlushAt = Date.now();
    await this.flushViewCountDeltaKeys();
  }

  private async flushViewCountDeltaKeys() {
    await this.flushDeltaKey(this.flushingKey);

    const moved = await this.moveActiveKeyToFlushingKey();
    if (!moved) {
      return;
    }

    await this.flushDeltaKey(this.flushingKey);
  }

  private async flushDeltaKey(key: string) {
    const entries = await this.redisService.hashGetAll(key);
    const articleIds = Object.keys(entries);

    if (articleIds.length === 0) {
      return;
    }

    await this.prisma.$transaction(
      articleIds.map((articleId) =>
        this.prisma.article.updateMany({
          where: { id: articleId },
          data: {
            viewCount: {
              increment: this.parseNumber(entries[articleId]),
            },
          },
        }),
      ),
    );

    await this.redisService.delete(key);
    this.logger.log(
      `Flushed view count deltas for ${articleIds.length} articles`,
    );
  }

  private async moveActiveKeyToFlushingKey(): Promise<boolean> {
    const script = `
      if redis.call('EXISTS', KEYS[2]) == 1 then
        return 0
      end

      if redis.call('EXISTS', KEYS[1]) == 0 then
        return 0
      end

      redis.call('RENAME', KEYS[1], KEYS[2])
      return 1
    `;

    const result = await this.redisService.evalNumber(script, [
      this.activeKey,
      this.flushingKey,
    ]);

    return result === 1;
  }

  private async getHashFieldNumber(
    key: string,
    field: string,
  ): Promise<number> {
    const [value] = await this.redisService.hashMultiGet(key, [field]);
    return this.parseNumber(value);
  }

  private parseNumber(value: string | null | undefined): number {
    if (!value) {
      return 0;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}
