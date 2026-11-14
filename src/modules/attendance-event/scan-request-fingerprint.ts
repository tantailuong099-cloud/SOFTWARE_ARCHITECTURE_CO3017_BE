import { createHash } from 'node:crypto';
import type { SubmitAccessScanDto } from './dto/access-event.dto';

export function scanRequestFingerprint(scan: SubmitAccessScanDto): string {
  const data = JSON.stringify([scan.stationId, scan.qrPayload, scan.deviceTimestamp ?? null]);
  return createHash('sha256').update(data).digest('hex');
}
