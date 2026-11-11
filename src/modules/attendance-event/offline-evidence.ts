import * as crypto from 'crypto';
import type { OfflineAccessEventDto, SyncOfflineScansDto } from './dto/access-event.dto';

// Fixed array positions form the signed v1 protocol. The batch ID is deliberately not part of event identity.
export function canonicalOfflineEvent(event : OfflineAccessEventDto) : string {
  return JSON.stringify([
    1, event.eventId, event.requestId, event.stationId, event.employeeId,
    new Date(event.deviceTimestamp).toISOString(), event.accessDecision,
    event.denialReason ?? null, event.controllerOutcome, event.policyVersion,
    event.policySnapshotId, event.journalSequence,
  ]);
}

export function canonicalOfflineBatch(batch : SyncOfflineScansDto) : string {
  return JSON.stringify([
    batch.schemaVersion, batch.batchId, batch.stationId, batch.eventCount,
    batch.events.map((event) => [JSON.parse(canonicalOfflineEvent(event)), event.evidenceSignature]),
  ]);
}

export function sha256Hex(content : string) : string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function verifyOfflineSignature(content : string, signature : string, publicKeyPem : string) : boolean {
  try {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    if (publicKey.asymmetricKeyType !== 'ed25519') return false;
    return crypto.verify(null, Buffer.from(content, 'utf8'), publicKey, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}
