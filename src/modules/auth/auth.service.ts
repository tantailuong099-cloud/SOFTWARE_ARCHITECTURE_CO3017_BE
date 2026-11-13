import { requireSigningKey } from '../../config/signing-keys';
import {
  Inject,
  Injectable,
  UnauthorizedException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SignOptions } from 'jsonwebtoken';
import { UserStatus } from '../users/model/user.model';
import {
  TOKEN_SESSION_STORE,
  USER_IDENTITY_READER,
} from './auth-persistence.port';
import type {
  IssuedSession,
  TokenSessionStore,
  UserIdentityReader,
} from './auth-persistence.port';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { JwtService } from './jwt.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject(USER_IDENTITY_READER)
    private readonly identities: UserIdentityReader,
    @Inject(TOKEN_SESSION_STORE) private readonly sessions: TokenSessionStore,
  ) {}

  private requireUserId(id: string | undefined): string {
    if (!id) {
      throw new UnauthorizedException('Thông tin người dùng không hợp lệ');
    }
    return id;
  }

  private tokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private describeSession(
    accessToken: string,
    refreshToken: string,
  ): IssuedSession {
    const now = Date.now();
    return {
      accessHash: this.tokenHash(accessToken),
      refreshHash: this.tokenHash(refreshToken),
      accessExpiresAt: new Date(now + 60 * 60 * 1000),
      refreshExpiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Generate access and refresh tokens
   */
  private async generateTokens(user: {
    id: string;
    role: string;
    employeeCode: string;
    fullName: string;
  }) {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      employeeCode: user.employeeCode,
      fullName: user.fullName,
      jti: crypto.randomUUID(),
    };

    const refreshPayload = {
      sub: user.id,
      jti: crypto.randomUUID(),
      type: 'refresh',
    };

    const accessSecret = requireSigningKey('JWT_SECRET');
    const accessExpiresIn = (process.env.JWT_EXPIRES_IN ||
      '1h') as SignOptions['expiresIn'];

    const refreshSecret = requireSigningKey('JWT_REFRESH_SECRET');
    const refreshExpiresIn = (process.env.JWT_REFRESH_EXPIRES_IN ||
      '7d') as SignOptions['expiresIn'];

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * User Login: Validates credentials and returns tokens
   */
  async login(loginDto: LoginDto) {
    const user = await this.identities.findByEmail(
      loginDto.email.trim().toLowerCase(),
    );

    if (!user) {
      this.logger.warn(
        `[Auth Failed] Login rejected for "${loginDto.email}": user not found.`,
      );
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    // Check account status
    if (user.status !== UserStatus.ACTIVE) {
      this.logger.warn(
        `[Auth Failed] Login rejected for "${loginDto.email}": account status is ${user.status}.`,
      );
      throw new UnauthorizedException(
        'Tài khoản của bạn đã bị vô hiệu hóa hoặc tạm khóa',
      );
    }

    // Verify password
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(
        loginDto.password,
        user.passwordHash,
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[Database] Password verification failed for "${loginDto.email}": ${errorMessage}`,
      );
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    if (!isPasswordValid) {
      this.logger.warn(
        `[Auth Failed] Login rejected for "${loginDto.email}": password is incorrect.`,
      );
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    // Generate tokens
    const userId = this.requireUserId(user.id);
    const tokens = await this.generateTokens({ ...user, id: userId });

    // Hash refresh token and persist
    await this.sessions.replaceForUser(
      userId,
      this.describeSession(tokens.accessToken, tokens.refreshToken),
    );
    this.logger.log(
      `[Database] Authentication tokens stored for user "${user.email}".`,
    );

    this.logger.log(
      `[Auth Success] User "${user.email}" (${user.role}) logged in successfully.`,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        employeeCode: user.employeeCode,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    };
  }

  /**
   * Refresh Token: Rotates access and refresh tokens
   */
  async refreshTokens(dto: RefreshTokenDto) {
    const refreshSecret = requireSigningKey('JWT_REFRESH_SECRET');

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(
        dto.refreshToken,
        { secret: refreshSecret },
      );
    } catch {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }

    const user = await this.identities.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy tài khoản người dùng');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Tài khoản đã bị tạm khóa');
    }

    const userId = this.requireUserId(user.id);
    const tokens = await this.generateTokens({ ...user, id: userId });
    const rotated = await this.sessions.rotateRefresh(
      userId,
      this.tokenHash(dto.refreshToken),
      this.describeSession(tokens.accessToken, tokens.refreshToken),
    );
    if (!rotated) {
      throw new UnauthorizedException(
        'Refresh token đã bị thu hồi hoặc đã đăng xuất',
      );
    }

    this.logger.log(
      `[Token Rotated] Refreshed tokens for user "${user.email}"`,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  /**
   * Logout: Clears refresh token in database
   */
  async logout(userId: string) {
    await this.sessions.revokeForUser(userId);
    this.logger.log(`[Logout] User ${userId} logged out successfully.`);
    return {
      success: true,
      message: 'Đăng xuất thành công',
    };
  }

  /**
   * Get current authenticated user profile
   */
  async getProfile(userId: string) {
    const user = await this.identities.findById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy thông tin người dùng');
    }

    return {
      id: user.id,
      employeeCode: user.employeeCode,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
