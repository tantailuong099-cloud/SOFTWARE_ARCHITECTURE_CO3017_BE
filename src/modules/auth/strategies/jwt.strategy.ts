import { requireSigningKey } from '../../../config/signing-keys';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  role: string;
  employeeCode?: string;
  fullName?: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireSigningKey('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload) {
    if (!payload.sub || !payload.role) {
      throw new UnauthorizedException(
        'Token không hợp lệ hoặc thiếu thông tin định danh',
      );
    }
    return {
      id: payload.sub,
      role: payload.role,
      employeeCode: payload.employeeCode,
      fullName: payload.fullName,
    };
  }
}
