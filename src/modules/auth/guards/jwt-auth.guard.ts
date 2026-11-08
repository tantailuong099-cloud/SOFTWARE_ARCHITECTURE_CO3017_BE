import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtService } from '../jwt.service';
import { JwtPayload } from '../strategies/jwt.strategy';
import { TokenModel, TokenType } from '../model/token.model';
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
  constructor(private readonly jwtService: JwtService) {}

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
      const storedToken = await TokenModel.findOne({
        where: {
          userId: payload.sub,
          tokenHash,
          type: TokenType.ACCESS,
          revoked: false,
        },
      });
      if (!storedToken || storedToken.expiresAt.getTime() <= Date.now()) {
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
