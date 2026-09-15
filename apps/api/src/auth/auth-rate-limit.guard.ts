import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { RedisService } from '../redis/redis.service';

// One atomic operation sets counters and expiry across all API instances.
export const AUTH_LIMIT_SCRIPT = `
for i, key in ipairs(KEYS) do
  if tonumber(redis.call('GET', key) or '0') >= tonumber(ARGV[i]) then return 0 end
end
for i, key in ipairs(KEYS) do
  local n = redis.call('INCR', key)
  if n == 1 then redis.call('EXPIRE', key, ARGV[#KEYS + i]) end
end
return 1`;

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const register = context.getHandler().name === 'register';
    const kind = register ? 'register' : 'login';
    const body = req.body as Record<string, unknown> | undefined;
    const raw = register ? body?.email : body?.account;
    const account =
      typeof raw === 'string'
        ? raw.slice(0, 256).trim().toLowerCase()
        : 'invalid';
    const hash = (value: string) =>
      createHash('sha256').update(value).digest('hex');
    // Express defaults to trust proxy=false. Never consume X-Forwarded-For here.
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const keys = [
      `auth:{limits}:${kind}:ip:${hash(ip)}`,
      `auth:{limits}:${kind}:account:${hash(account)}`,
    ];
    const limits = register ? ['5', '3'] : ['30', '10'];
    const ttl = register ? '3600' : '900';
    if (register) {
      keys.push('auth:{limits}:register:global');
      limits.push('100');
    }
    let allowed: number;
    try {
      allowed = await this.redis.evalNumber(AUTH_LIMIT_SCRIPT, keys, [
        ...limits,
        ...keys.map(() => ttl),
      ]);
    } catch {
      throw new ServiceUnavailableException(
        'Authentication temporarily unavailable',
      );
    }
    if (allowed !== 1)
      throw new HttpException('Too many authentication attempts', 429);
    return true;
  }
}
