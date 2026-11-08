import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UserModel } from '../users/model/user.model';
import { TokenModel } from './model/token.model';
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
  providers: [AuthService, JwtService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
