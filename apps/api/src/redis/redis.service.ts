import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { AppEnvironment } from '../config/env.validation';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType;

  constructor(
    private readonly configService: ConfigService<AppEnvironment, true>,
  ) {
    this.client = createClient({
      disableOfflineQueue: true,
      url: this.configService.get('REDIS_URL', { infer: true }),
    });

    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis error: ${error.message}`, error.stack);
    });
  }

  async onModuleInit() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async onModuleDestroy() {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async hashIncrementBy(
    key: string,
    field: string,
    increment: number,
  ): Promise<number> {
    return this.client.hIncrBy(key, field, increment);
  }

  async hashGetAll(key: string): Promise<Record<string, string>> {
    return this.client.hGetAll(key);
  }

  async hashDelete(key: string, fields: string[]): Promise<number> {
    if (fields.length === 0) {
      return 0;
    }

    return this.client.hDel(key, fields);
  }

  async delete(key: string): Promise<number> {
    return this.client.del(key);
  }

  async hashMultiGet(
    key: string,
    fields: string[],
  ): Promise<Array<string | null>> {
    if (fields.length === 0) {
      return [];
    }

    return this.client.hmGet(key, fields);
  }

  async increment(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  async setAdd(key: string, member: string): Promise<number> {
    return this.client.sAdd(key, member);
  }

  async setCardinality(key: string): Promise<number> {
    return this.client.sCard(key);
  }

  async sortedSetAdd(
    key: string,
    score: number,
    member: string,
  ): Promise<number> {
    return this.client.zAdd(key, [{ score, value: member }]);
  }

  async sortedSetRemove(key: string, member: string): Promise<number> {
    return this.client.zRem(key, member);
  }

  async sortedSetRemoveByScore(
    key: string,
    min: number,
    max: number,
  ): Promise<number> {
    return this.client.zRemRangeByScore(key, min, max);
  }

  async sortedSetCardinality(key: string): Promise<number> {
    return this.client.zCard(key);
  }

  async sortedSetIncrementBy(
    key: string,
    increment: number,
    member: string,
  ): Promise<number> {
    return this.client.zIncrBy(key, increment, member);
  }

  async sortedSetRangeWithScoresDesc(key: string, start: number, stop: number) {
    return this.client.zRangeWithScores(key, start, stop, {
      REV: true,
    });
  }

  async evalNumber(
    script: string,
    keys: string[],
    argumentsList: string[] = [],
  ): Promise<number> {
    const result = await this.client.eval(script, {
      keys,
      arguments: argumentsList,
    });

    return typeof result === 'number' ? result : Number(result ?? 0);
  }
}
