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

    const startDate = new Date(`${dto.reportingPeriod}-01T00:00:00.000Z`);
    const endDate = new Date(startDate);
    endDate.setUTCMonth(endDate.getUTCMonth() + 1);

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
      status: 'MOCK_ACKNOWLEDGED',
      preparedAt: new Date(),
      deliveryMode: 'SIMULATED',
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
      mockAcknowledgementReceipt: `HR-MOCK-${randomBytes(8).toString('hex').toUpperCase()}`,
    };

    this.logger.log(
      `Prepared HR/Payroll batch ${batchId} for simulated delivery with ${rawEvents.length} events`,
    );
    return batch;
  }
}
