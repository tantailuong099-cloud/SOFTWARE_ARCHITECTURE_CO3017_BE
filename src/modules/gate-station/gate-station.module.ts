import 'dotenv/config';
import { Module } from '@nestjs/common';
import { getModelToken, SequelizeModule } from '@nestjs/sequelize';
import { AuthModule } from '../auth/auth.module';
import { GateStationController } from './gate-station.controller';
import { GateStationService, GATE_STATION_MODEL } from './gate-station.service';
import { GateStationModel } from './model/gate-station.model';

@Module({
  imports: [
    AuthModule,
    ...(process.env.ENABLE_DB === 'true'
      ? [SequelizeModule.forFeature([GateStationModel])]
      : []),
  ],
  controllers: [GateStationController],
  providers: [
    GateStationService,
    ...(process.env.ENABLE_DB === 'true'
      ? [
          {
            provide: GATE_STATION_MODEL,
            useExisting: getModelToken(GateStationModel),
          },
        ]
      : []),
  ],
  exports: [GateStationService],
})
export class GateStationModule {}
