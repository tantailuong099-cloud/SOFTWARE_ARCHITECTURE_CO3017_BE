import 'dotenv/config';
import { Module } from '@nestjs/common';
import { UserQRController } from './user-qr.controller';
import { UserQRService } from './user-qr.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { UserModel } from '../users/model/user.model';
import { QRCredentialModel } from './model/qr-credential.model';
import { QRPresentationModel } from './model/qr-presentation.model';
import { AuthModule } from '../auth/auth.module';

const isDbEnabled = process.env.ENABLE_DB === 'true';

@Module({
  imports: [
    AuthModule,
    ...(isDbEnabled
      ? [
        SequelizeModule.forFeature([
          UserModel,
          QRCredentialModel,
          QRPresentationModel,
        ]),
      ]
      : []),
  ],
  controllers: [UserQRController],
  providers: [UserQRService],
  exports: [UserQRService],
})
export class UserQRModule {}
