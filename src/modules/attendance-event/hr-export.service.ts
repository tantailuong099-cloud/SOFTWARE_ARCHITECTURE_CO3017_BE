import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { randomBytes } from 'crypto';
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
    const rawEvents = await this.accessEventModel.findAll();

    const batch = {
      batchId,
      reportingPeriod: dto.reportingPeriod,
      eventCount: rawEvents.length,
      status: 'EXPORT_SIMULATED',
      exportedAt: new Date(),
      sampleEvents: rawEvents.slice(0, 5),
    };

    this.logger.log(
      `Prepared simulated HR/Payroll Batch ${batchId} with ${rawEvents.length} raw events`,
    );
    return batch;
  }
}
