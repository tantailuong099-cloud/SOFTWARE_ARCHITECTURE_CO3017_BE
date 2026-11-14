import {
  BadRequestException,
  ConflictException,
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
  CreateGateStationDto,
  GateStationContext,
  GateStationResponseDto,
  UpdateGateStationDto,
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

  async create(dto: CreateGateStationDto): Promise<GateStationResponseDto> {
    const existing = await this.gateStationModel.findOne({
      where: { stationCode: dto.stationCode.trim() },
    });
    if (existing) {
      throw new ConflictException(`Mã trạm ${dto.stationCode} đã tồn tại trong hệ thống.`);
    }

    const station = await this.gateStationModel.create({
      stationCode: dto.stationCode.trim(),
      name: dto.name.trim(),
      factoryId: dto.factoryId,
      direction: dto.direction,
      location: dto.location.trim(),
      status: this.persistedStatus(dto.status ?? GateStationStatus.ACTIVE),
    });

    return this.toResponse(station);
  }

  async update(
    stationCode: string,
    dto: UpdateGateStationDto,
  ): Promise<GateStationResponseDto> {
    const station = await this.findByStationCode(stationCode);

    if (dto.name !== undefined) station.name = dto.name.trim();
    if (dto.factoryId !== undefined) station.factoryId = dto.factoryId;
    if (dto.direction !== undefined) station.direction = dto.direction;
    if (dto.location !== undefined) station.location = dto.location.trim();
    if (dto.status !== undefined) station.status = this.persistedStatus(dto.status);

    await station.save();
    return this.toResponse(station);
  }

  async updateStatus(
    stationCode: string,
    status: GateStationStatus,
  ): Promise<GateStationResponseDto> {
    const station = await this.findByStationCode(stationCode);
    station.status = this.persistedStatus(status);
    await station.save();
    return this.toResponse(station);
  }

  async delete(stationCode: string): Promise<{ success: boolean; message: string }> {
    const station = await this.findByStationCode(stationCode);
    await station.destroy();
    return {
      success: true,
      message: `Đã xóa trạm kiosk ${stationCode} thành công.`,
    };
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

  private persistedStatus(status: GateStationStatus): GateStationStatus {
    // PostgreSQL stores INACTIVE; DISABLED is a wire alias.
    return status === GateStationStatus.DISABLED ? GateStationStatus.INACTIVE : status;
  }

  private async findByStationCode(
    stationCode: string,
  ): Promise<GateStationModel> {
    const station = await this.gateStationModel.findOne({
      where: { stationCode },
    });
    if (!station) {
      throw new NotFoundException(`Không tìm thấy trạm kiosk: ${stationCode}`);
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
