import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from '../../users/model/user.model';
import { ROLES_KEY } from '../decorators/roles.decorator';

interface RequestWithRoleUser extends Request {
  user?: {
    role?: string;
  };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithRoleUser>();
    const user = request.user;
    if (!user || !user.role) {
      throw new ForbiddenException(
        'Bạn không có quyền thực hiện hành động này (Thiếu thông tin vai trò)',
      );
    }

    const hasRole = requiredRoles.includes(user.role as UserRole);
    if (!hasRole) {
      throw new ForbiddenException(
        `Từ chối truy cập: Yêu cầu quyền [${requiredRoles.join(', ')}]`,
      );
    }

    return true;
  }
}
