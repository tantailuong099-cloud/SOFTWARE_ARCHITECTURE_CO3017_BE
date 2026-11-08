import {
  Injectable,
  UnauthorizedException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SignOptions } from 'jsonwebtoken';
import {
  UserAttributes,
  UserModel,
  UserStatus,
} from '../users/model/user.model';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { JwtService } from './jwt.service';
import { TokenModel, TokenType } from './model/token.model';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly jwtService: JwtService) {}

  private async findUserByEmail(email: string): Promise<UserAttributes | null> {
    try {
      const user = await UserModel.findOne({ where: { email } });
      if (user) return user.get({ plain: true });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Database query failed: ${errorMsg}`);
    }
    return null;
  }

  private async findUserById(id: string): Promise<UserAttributes | null> {
    try {
      const user = await UserModel.findByPk(id);
      if (user) return user.get({ plain: true });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Database query failed: ${errorMsg}`);
    }
    return null;
  }

  private tokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async revokeUserTokens(userId: string, type?: TokenType) {
    await TokenModel.update(
      { revoked: true },
      { where: { userId, ...(type ? { type } : {}) } },
    );
  }

  private async storeTokens(
    userId: string,
    accessToken: string,
    refreshToken: string,
  ): Promise<void> {
    const now = Date.now();
    await TokenModel.bulkCreate([
      {
        userId,
        tokenHash: this.tokenHash(accessToken),
        type: TokenType.ACCESS,
        revoked: false,
        expiresAt: new Date(now + 60 * 60 * 1000),
      },
      {
        userId,
        tokenHash: this.tokenHash(refreshToken),
        type: TokenType.REFRESH,
        revoked: false,
        expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
      },
    ]);
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

    const accessSecret =
      process.env.JWT_SECRET || 'tmc_jwt_access_secret_token_key_2026';
    const accessExpiresIn = (process.env.JWT_EXPIRES_IN ||
      '1h') as SignOptions['expiresIn'];

    const refreshSecret =
      process.env.JWT_REFRESH_SECRET || 'tmc_jwt_refresh_secret_token_key_2026';
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
    const user = await this.findUserByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    // Check account status
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'Tài khoản của bạn đã bị vô hiệu hóa hoặc tạm khóa',
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Hash refresh token and persist
    await this.revokeUserTokens(user.id);
    await this.storeTokens(user.id, tokens.accessToken, tokens.refreshToken);

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
    const refreshSecret =
      process.env.JWT_REFRESH_SECRET || 'tmc_jwt_refresh_secret_token_key_2026';

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

    const user = await this.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy tài khoản người dùng');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Tài khoản đã bị tạm khóa');
    }

    const refreshToken = await TokenModel.findOne({
      where: {
        userId: user.id,
        tokenHash: this.tokenHash(dto.refreshToken),
        type: TokenType.REFRESH,
        revoked: false,
      },
    });
    if (!refreshToken || refreshToken.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException(
        'Refresh token đã bị thu hồi hoặc đã đăng xuất',
      );
    }

    // Token is valid: Rotate tokens
    const tokens = await this.generateTokens(user);
    await refreshToken.update({ revoked: true });
    await this.storeTokens(user.id, tokens.accessToken, tokens.refreshToken);

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
    await this.revokeUserTokens(userId);
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
    const user = await this.findUserById(userId);
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
