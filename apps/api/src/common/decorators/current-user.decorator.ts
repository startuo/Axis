import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SafeUser } from '../../users/interfaces/safe-user.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SafeUser => {
    const request = context.switchToHttp().getRequest<{ user: SafeUser }>();
    return request.user;
  },
);
