import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AccessEventModel } from './model/access-event.model';
import { AccessScanRequestModel } from './model/access-scan-request.model';
import { OfflineSyncBatchModel } from './model/offline-sync-batch.model';
import { AttendanceEventController } from './attendance-event.controller';
import { AccessScanService } from './access-scan.service';
import { AttendanceQueryService } from './attendance-query.service';
import { OfflineSyncService } from './offline-sync.service';
import { LegacyOfflineSyncService } from './legacy-offline-sync.service';
import { HrExportService } from './hr-export.service';
import { AuthModule } from '../auth/auth.module';
import { UserQRModule } from '../user-qr/user-qr.module';
import { GateStationModule } from '../gate-station/gate-station.module';
import { TurnstileModule } from '../../adapters/turnstile/turnstile.module';

@Module({
  imports: [
    AuthModule,
    UserQRModule,
    GateStationModule,
    TurnstileModule,
    SequelizeModule.forFeature([
      AccessEventModel,
      AccessScanRequestModel,
      OfflineSyncBatchModel,
    ]),
  ],
  controllers: [AttendanceEventController],
  providers: [
    AccessScanService,
    AttendanceQueryService,
    OfflineSyncService,
    LegacyOfflineSyncService,
    HrExportService,
  ],
})
export class AttendanceEventModule {}
