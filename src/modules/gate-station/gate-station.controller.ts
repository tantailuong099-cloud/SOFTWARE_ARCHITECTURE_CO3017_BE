import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/model/user.model';
import { GateStationService } from './gate-station.service';

@Controller('api/gate-stations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class GateStationController {
  constructor(private readonly gateStationService: GateStationService) {}

  @Get()
  listStations() {
    return this.gateStationService.listStations();
  }

  @Get(':stationCode')
  getStation(@Param('stationCode') stationCode: string) {
    return this.gateStationService.getStationContext(stationCode);
  }
}
