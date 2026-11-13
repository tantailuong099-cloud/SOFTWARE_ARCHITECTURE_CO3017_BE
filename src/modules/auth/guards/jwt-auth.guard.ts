import {
  Inject,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtService } from '../jwt.service';
import { JwtPayload } from '../strategies/jwt.strategy';
import { ACCESS_SESSION_READER } from '../auth-persistence.port';
import type { AccessSessionReader } from '../auth-persistence.port';
import * as crypto from 'crypto';

interface RequestWithUser extends Request {
  user?: {
    id: string;
    role: string;
    employeeCode?: string;
    fullName?: string;
  };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(ACCESS_SESSION_READER)
    private readonly sessions: AccessSessionReader,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (
      !authHeader ||
      typeof authHeader !== 'string' ||
      !authHeader.startsWith('Bearer ')
    ) {
      throw new UnauthorizedException(
        'Thiếu Authorization Bearer token hoặc sai định dạng',
      );
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException('Token xác thực không được để trống');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      if (!(await this.sessions.hasActiveAccess(payload.sub, tokenHash))) {
        throw new UnauthorizedException('Phiên đăng nhập đã bị thu hồi');
      }
      request.user = {
        id: payload.sub,
        role: payload.role,
        employeeCode: payload.employeeCode,
        fullName: payload.fullName,
      };
      return true;
    } catch {
      throw new UnauthorizedException(
        'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
      );
    }
  }
}
