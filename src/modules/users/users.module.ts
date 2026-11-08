import 'dotenv/config';
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UserModel } from './model/user.model';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthModule } from '../auth/auth.module';

const isDbEnabled = process.env.ENABLE_DB === 'true';

@Module({
  imports: [
    AuthModule,
    ...(isDbEnabled ? [SequelizeModule.forFeature([UserModel])] : []),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
