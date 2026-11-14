import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/model/user.model';
import { GateStationService } from './gate-station.service';
import {
  CreateGateStationDto,
  UpdateGateStationDto,
  UpdateGateStationStatusDto,
} from './dto/gate-station.dto';

@Controller('api/gate-stations')
@UseGuards(JwtAuthGuard, RolesGuard)
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

  @Post()
  @Roles(UserRole.ADMIN)
  createStation(@Body() dto: CreateGateStationDto) {
    return this.gateStationService.create(dto);
  }

  @Patch(':stationCode')
  @Roles(UserRole.ADMIN)
  updateStation(
    @Param('stationCode') stationCode: string,
    @Body() dto: UpdateGateStationDto,
  ) {
    return this.gateStationService.update(stationCode, dto);
  }

  @Patch(':stationCode/status')
  @Roles(UserRole.ADMIN)
  updateStatus(
    @Param('stationCode') stationCode: string,
    @Body() dto: UpdateGateStationStatusDto,
  ) {
    return this.gateStationService.updateStatus(stationCode, dto.status);
  }

  @Delete(':stationCode')
  @Roles(UserRole.ADMIN)
  deleteStation(@Param('stationCode') stationCode: string) {
    return this.gateStationService.delete(stationCode);
  }
}
