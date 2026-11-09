import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FactoryId } from '../users/model/user.model';
import {
  GateDirection,
  GateStationModel,
  GateStationStatus,
} from './model/gate-station.model';
import {
  GateStationContext,
  GateStationResponseDto,
} from './dto/gate-station.dto';

export const GATE_STATION_MODEL = 'GATE_STATION_MODEL';

@Injectable()
export class GateStationService {
  constructor(
    @Inject(GATE_STATION_MODEL)
    private readonly gateStationModel: typeof GateStationModel,
  ) {}

  async listStations(): Promise<GateStationResponseDto[]> {
    const stations = await this.gateStationModel.findAll({
      order: [['stationCode', 'ASC']],
    });
    return stations.map((station) => this.toResponse(station));
  }

  async getStationContext(stationCode: string): Promise<GateStationContext> {
    const station = await this.findByStationCode(stationCode);
    return this.toResponse(station);
  }

  async validateActiveStation(
    stationCode: string,
  ): Promise<GateStationContext> {
    const station = await this.findByStationCode(stationCode);
    const context = this.toResponse(station);

    if (
      !context.stationCode.trim() ||
      !context.name.trim() ||
      !context.location.trim() ||
      !Object.values(FactoryId).includes(context.factoryId) ||
      !Object.values(GateDirection).includes(context.direction)
    ) {
      throw new BadRequestException('INVALID_STATION_CONFIGURATION');
    }

    if (context.status !== GateStationStatus.ACTIVE) {
      throw new ForbiddenException('STATION_INACTIVE');
    }

    return context;
  }

  private async findByStationCode(
    stationCode: string,
  ): Promise<GateStationModel> {
    const station = await this.gateStationModel.findOne({
      where: { stationCode },
    });
    if (!station) {
      throw new NotFoundException('STATION_NOT_FOUND');
    }
    return station;
  }

  private toResponse(station: GateStationModel): GateStationResponseDto {
    return {
      id: station.id,
      stationCode: station.stationCode,
      name: station.name,
      factoryId: station.factoryId,
      direction: station.direction,
      location: station.location,
      status: station.status,
      createdAt: station.createdAt,
      updatedAt: station.updatedAt,
      stationId: station.stationCode,
      gateIdentifier: station.name,
    };
  }
}
