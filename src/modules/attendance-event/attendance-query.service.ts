import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryRawEventsDto } from './dto/access-event.dto';
import { AccessDecision, AccessEventModel } from './model/access-event.model';

@Injectable()
export class AttendanceQueryService {
  constructor(
    @InjectModel(AccessEventModel)
    private readonly accessEventModel: typeof AccessEventModel,
  ) {}

  // --- UC-04: View Recent Gate Events (for Guards) ---
  async getRecentEvents(stationId : string, limit = 20) {
    return this.accessEventModel.findAll({
      where : { stationId },
      order : [['serverTimestamp', 'DESC']],
      limit,
    });
  }

  // --- UC-07: Query Raw Access Events ---
  async queryEvents(dto : QueryRawEventsDto) {
    const where : Record<string, string> = {};
    if (dto.stationId) where.stationId = dto.stationId;
    if (dto.factoryId) where.factoryId = dto.factoryId;
    if (dto.employeeId) where.employeeId = dto.employeeId;
    if (dto.accessDecision) where.accessDecision = dto.accessDecision;

    const result = await this.accessEventModel.findAll({
      where,
      order : [['serverTimestamp', 'DESC']],
      ...(dto.limit ? { limit : dto.limit } : {}),
    });

    return {
      total    : result.length,
      approved : result.filter((event) => event.accessDecision === AccessDecision.APPROVED).length,
      denied   : result.filter((event) => event.accessDecision === AccessDecision.DENIED).length,
      events   : result,
    };
  }
}
