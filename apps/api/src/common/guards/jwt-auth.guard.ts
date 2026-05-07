import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import type { SafeUser } from '../../users/interfaces/safe-user.interface';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = SafeUser>(
    err: unknown,
    user: TUser | false | null,
  ): TUser {
    if (err) {
      if (err instanceof Error) {
        throw err;
      }

      throw new UnauthorizedException('Authentication failed');
    }

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    return user;
  }
}
