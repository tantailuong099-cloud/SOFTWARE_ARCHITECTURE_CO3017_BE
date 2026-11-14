import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { scanRequestFingerprint } from './scan-request-fingerprint';
import { SubmitAccessScanDto, LegacyOfflineBatchDto } from './dto/access-event.dto';
import { AccessEventModel } from './model/access-event.model';
import { AccessScanRequestModel, ScanResultType } from './model/access-scan-request.model';

type LegacyScanAcknowledgement = {
  requestId: string;
  status: 'ACCEPTED' | 'DENIED' | 'DUPLICATE' | 'ERROR' | 'PENDING';
  reasonCode?: string;
};

@Injectable()
export class LegacyOfflineSyncService {
  constructor(
    @InjectModel(AccessScanRequestModel)
    private readonly requests: typeof AccessScanRequestModel,
    @InjectModel(AccessEventModel)
    private readonly events: typeof AccessEventModel,
  ) {}

  async reconcile(batch: LegacyOfflineBatchDto) {
    const results: LegacyScanAcknowledgement[] = [];
    for (const scan of batch.scans) {
      results.push(await this.reconcileScan(scan));
    }
    const count = (status: LegacyScanAcknowledgement['status']) =>
      results.filter((result) => result.status === status).length;
    const acceptedCount = count('ACCEPTED');
    const deniedCount = count('DENIED');
    const duplicateCount = count('DUPLICATE');
    const errorCount = count('ERROR') + count('PENDING');
    return {
      stationId: batch.stationId,
      status: errorCount === 0 ? 'COMPLETE' : 'PARTIAL',
      totalReceived: results.length,
      processedCount: acceptedCount + deniedCount + duplicateCount,
      acceptedCount,
      deniedCount,
      duplicateCount,
      errorCount,
      results,
    };
  }

  private async reconcileScan(scan: SubmitAccessScanDto): Promise<LegacyScanAcknowledgement> {
    const { requestId } = scan;
    // Unsigned raw scans can only reconcile a matching committed live request.
    const previous = await this.requests.findByPk(requestId);
    if (!previous || previous.resultType === ScanResultType.LEGACY) {
      return { requestId, status: 'PENDING', reasonCode: 'SIGNED_EVIDENCE_REQUIRED' };
    }
    if (previous.stationId !== scan.stationId ||
        previous.requestFingerprint !== scanRequestFingerprint(scan)) {
      return { requestId, status: 'ERROR', reasonCode: 'REQUEST_ID_CONFLICT' };
    }
    if (previous.resultType === ScanResultType.REJECTED_NO_EVENT ||
        (previous.resultType === ScanResultType.EVENT_RECORDED && previous.eventId &&
          await this.events.findByPk(previous.eventId))) {
      return { requestId, status: 'DUPLICATE' };
    }
    return { requestId, status: 'PENDING', reasonCode: 'COMMITTED_RESULT_UNAVAILABLE' };
  }
}
