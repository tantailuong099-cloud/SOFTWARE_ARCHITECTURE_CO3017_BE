import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AccessEventModel } from './model/access-event.model';
import { AccessScanRequestModel } from './model/access-scan-request.model';
import { OfflineSyncBatchModel } from './model/offline-sync-batch.model';
import { AttendanceEventController } from './attendance-event.controller';
import { AttendanceEventService } from './attendance-event.service';
import { UserQRModule } from '../user-qr/user-qr.module';
import { GateStationModule } from '../gate-station/gate-station.module';
import { TurnstileModule } from '../../adapters/turnstile/turnstile.module';

@Module({
  imports: [UserQRModule, GateStationModule, TurnstileModule, SequelizeModule.forFeature([AccessEventModel, AccessScanRequestModel, OfflineSyncBatchModel])],
  controllers: [AttendanceEventController],
  providers: [AttendanceEventService],
  exports: [AttendanceEventService],
})
export class AttendanceEventModule {}
