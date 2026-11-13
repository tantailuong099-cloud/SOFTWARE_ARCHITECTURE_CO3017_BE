import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UserModel } from '../users/model/user.model';
import { TokenModel } from './model/token.model';
import {
  ACCESS_SESSION_READER,
  TOKEN_SESSION_STORE,
  USER_IDENTITY_READER,
} from './auth-persistence.port';
import {
  SequelizeTokenSessionStore,
  SequelizeUserIdentityReader,
} from './sequelize-auth-persistence';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from './jwt.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

const isDbEnabled = process.env.ENABLE_DB === 'true';

@Module({
  imports: [
    ...(isDbEnabled
      ? [SequelizeModule.forFeature([UserModel, TokenModel])]
      : []),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtService,
    JwtAuthGuard,
    RolesGuard,
    SequelizeTokenSessionStore,
    SequelizeUserIdentityReader,
    { provide: USER_IDENTITY_READER, useExisting: SequelizeUserIdentityReader },
    { provide: TOKEN_SESSION_STORE, useExisting: SequelizeTokenSessionStore },
    { provide: ACCESS_SESSION_READER, useExisting: SequelizeTokenSessionStore },
  ],
  exports: [
    AuthService,
    JwtService,
    JwtAuthGuard,
    RolesGuard,
    ACCESS_SESSION_READER,
  ],
})
export class AuthModule {}
