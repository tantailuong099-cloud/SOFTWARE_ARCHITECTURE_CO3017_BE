import { Module } from '@nestjs/common';
import { GateStationController } from './gate-station.controller';
import { GateStationService } from './gate-station.service';

@Module({
  controllers: [GateStationController],
  providers: [GateStationService],
  exports: [GateStationService],
})
export class GateStationModule {}
