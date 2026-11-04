import { Module } from '@nestjs/common';
import { AttendanceEventController } from './attendance-event.controller';
import { AttendanceEventService } from './attendance-event.service';
import { UserQRModule } from '../user-qr/user-qr.module';
import { GateStationModule } from '../gate-station/gate-station.module';
import { TurnstileModule } from '../../adapters/turnstile/turnstile.module';

@Module({
  imports: [UserQRModule, GateStationModule, TurnstileModule],
  controllers: [AttendanceEventController],
  providers: [AttendanceEventService],
  exports: [AttendanceEventService],
})
export class AttendanceEventModule {}
