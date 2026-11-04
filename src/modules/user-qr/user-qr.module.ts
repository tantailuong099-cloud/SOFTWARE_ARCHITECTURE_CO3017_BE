import { Module } from '@nestjs/common';
import { UserQRController } from './user-qr.controller';
import { UserQRService } from './user-qr.service';

@Module({
  controllers: [UserQRController],
  providers: [UserQRService],
  exports: [UserQRService],
})
export class UserQRModule {}
