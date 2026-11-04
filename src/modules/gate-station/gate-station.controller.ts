import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { GateStationService } from './gate-station.service';
import { RegisterGateStationDto, UpdateGateStationDto } from './dto/gate-station.dto';

@Controller('api/gate-stations')
export class GateStationController {
  constructor(private readonly gateStationService: GateStationService) {}

  @Get()
  async listStations() {
    return this.gateStationService.listStations();
  }

  @Get(':id')
  async getStationContext(@Param('id') id: string) {
    return this.gateStationService.getStationContext(id);
  }

  @Post()
  async registerStation(@Body() dto: RegisterGateStationDto) {
    return this.gateStationService.registerStation(dto);
  }

  @Put(':id')
  async updateStation(@Param('id') id: string, @Body() dto: UpdateGateStationDto) {
    return this.gateStationService.updateStation(id, dto);
  }

  @Post('authenticate')
  async authenticate(@Body() body: { stationId: string; apiKey?: string }) {
    return this.gateStationService.authenticateStation(body.stationId, body.apiKey);
  }
}
