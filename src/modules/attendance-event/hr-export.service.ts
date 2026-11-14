import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { randomBytes } from 'crypto';
import { Op } from 'sequelize';
import { ExportHRBatchDto } from './dto/access-event.dto';
import { AccessEventModel } from './model/access-event.model';

@Injectable()
export class HrExportService {
  private readonly logger = new Logger(HrExportService.name);

  constructor(
    @InjectModel(AccessEventModel)
    private readonly accessEventModel: typeof AccessEventModel,
  ) {}

  // --- UC-06 & ADR-004: Monthly Raw Event Export to HR/Payroll ---
  async exportHRBatch(dto: ExportHRBatchDto) {
    const batchId = `BATCH-${dto.reportingPeriod}-${randomBytes(3).toString('hex').toUpperCase()}`;

    // Lọc chính xác các sự kiện trong khoảng thời gian của kỳ báo cáo YYYY-MM
    const [yearStr, monthStr] = dto.reportingPeriod.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const rawEvents = await this.accessEventModel.findAll({
      where: {
        serverTimestamp: {
          [Op.gte]: startDate,
          [Op.lt]: endDate,
        },
      },
      order: [['serverTimestamp', 'ASC']],
    });

    const batch = {
      batchId,
      reportingPeriod: dto.reportingPeriod,
      eventCount: rawEvents.length,
      status: 'EXPORT_ACKNOWLEDGED',
      exportedAt: new Date(),
      sampleEvents: rawEvents.slice(0, 10).map((e) => ({
        eventId: e.eventId,
        requestId: e.requestId,
        employeeId: e.employeeId,
        stationId: e.stationId,
        factoryId: e.factoryId,
        direction: e.direction,
        accessDecision: e.accessDecision,
        controllerOutcome: e.controllerOutcome,
        serverTimestamp: e.serverTimestamp,
      })),
      destination: 'HR_PAYROLL_API_MOCK_ADAPTER',
      acknowledgementReceipt: `HR-ACK-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`,
    };

    this.logger.log(
      `Exported HR/Payroll Batch ${batchId} for period ${dto.reportingPeriod} with ${rawEvents.length} events (window: ${startDate.toISOString()} - ${endDate.toISOString()})`,
    );
    return batch;
  }
}
