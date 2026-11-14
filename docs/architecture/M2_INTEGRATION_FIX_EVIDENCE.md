# CO3017 M2 integration hardening evidence

## Revisions

- Frontend branch `fix/m2-frontend-integration-hardening` at `45ad820902f132861393bfab62e93c3275949e51`, based on `e964d98`.
- Backend branch `fix/m2-backend-integration-hardening` at implementation tip `7e11affd04202e816e3d116a98e9091fc9d2f848`, based on `6f16348`. The documentation commit containing this file sits directly above that tip.

| Commit | Behavior | Evidence |
|---|---|---|
| FE `2a23cb1` | Canonical issuer equality for bearer attachment, session restoration and logout | `test/features/auth/dio_endpoint_scope_test.dart`, `auth_endpoint_scope_test.dart`, `test/widget_test.dart` |
| FE `9a41e76` | Queue isolation by endpoint and station, with reconciliation by request ID | `test/features/gate_station/offline_queue_reconciliation_test.dart` |
| FE `14fd87b` | Keep inactive stations disabled when opening the configuration draft | `test/features/gate_station/station_configuration_test.dart` |
| FE `45ad820` | Replace the obsolete Flutter asset-mock calls in existing tests | `test/core/config/api_config_test.dart` |
| BE `722029e` | Validate legacy batches and acknowledge matching committed requests through a read-only path | `test/attendance-postgres.e2e-spec.ts`, “reconciles raw sync without creating claims, consuming QR or unlocking the gate” |
| BE `81ec135` | Normalize DISABLED to INACTIVE for PostgreSQL writes | `src/modules/gate-station/gate-station-status.spec.ts`, “stores either inactive station status as INACTIVE and denies a live scan” |
| BE `e896319` | Label the generated HR receipt as a simulation and filter a half-open UTC month | `src/modules/attendance-event/hr-export.service.spec.ts` |
| BE `7e11aff` | Label the scan benchmark synthetic and compute nearest-rank quantiles | `src/modules/attendance-event/kiosk-performance.spec.ts` |

## Before and after

`AttendanceEventController.syncOfflineScans` previously sent raw scans to the live scan service, counted denials as accepted, and declared completion despite item errors. It now validates at most 25 items, requires matching station IDs, rejects duplicate request IDs, and dispatches to the appropriate application service. `LegacyOfflineSyncService.reconcile` can read committed claims and associated events. It has no turnstile or credential validator dependency. `scanRequestFingerprint` preserves the live request fingerprint algorithm for comparison.

Mode 1 raw sync acknowledges a matching committed result as `DUPLICATE`. New raw scans and backfilled records without trustworthy fingerprints return `PENDING`; conflicting identities return `ERROR`. Missing committed results stay pending. Database failures propagate as HTTP failures. This endpoint accepts no unsigned historical event and returns no employee or decision details for a matching record. The compatibility endpoint is callable without a device session. The match requires the original request ID, station and payload fingerprint.

Mode 2 still validates the versioned Ed25519 batch and event signatures, policy evidence, station identity, journal sequence, and batch/request idempotency in `OfflineSyncService`. Its acknowledgement keys are event IDs. Live `AccessScanService.submitAccessScan` retains the original transaction and controller dispatch claim.

The legacy response includes station ID, `COMPLETE` or `PARTIAL`, counts, and per-request status. `processedCount = acceptedCount + deniedCount + duplicateCount`; `errorCount` includes `ERROR` and `PENDING`. Current raw sync never creates approvals or denials, so the first two decision counts are zero. A definitive denial returned by a compatible server is terminal for queue reconciliation. `GateStationNotifier.syncOfflineQueue` removes only matching terminal outcomes for the sent items. Missing, contradictory or retryable acknowledgements retain those items. Each queue item keeps the original backend and station in memory. The repository omits the obsolete station API key from the raw batch.

`readScopedAccessToken` and `dioProvider` require canonical scheme, hostname, effective port and API base path. The interceptor checks the request and current client endpoint after the async storage read. Unscoped legacy tokens cannot restore a session or become bearer headers. Login/refresh requests receive no bearer. Dio disables redirects for requests carrying bearer credentials on native platforms. The browser adapter delegates redirects to browser Fetch semantics, which remove Authorization on origin changes. Browser runtime verification remains outstanding. [Fetch standard](https://fetch.spec.whatwg.org/#http-redirect-fetch)

## API contract and guards

| Endpoint | Boundary and evidence |
|---|---|
| GET `/api/qr/employees/:employeeId/dynamic-qr` | JWT and existing ownership rules. PostgreSQL e2e checks self-issued QR payload, expiry and TTL. The alternate `/api/user-qr` prefix still works. |
| GET `/api/access/recent-events/:stationId` | JWT and Admin, Security Guard, Supervisor or HR Staff role. HTTP e2e checks unauthenticated 401, employee 403 and administrator 200. Station assignment is not checked in this controller. |
| GET `/api/gate-stations` | JWT. HTTP e2e checks unauthenticated 401 and authenticated employee 200. Admin station writes use existing role guards. Both inactive aliases yield `INACTIVE` when stored and scanned. |
| POST `/api/access/scan` | No JWT or device guard on the existing live endpoint. The backend checks the active station and scan credential. E2e verifies transaction, replay and dispatch behavior with a fake turnstile port. |
| POST `/api/access/sync-offline-scans` | Raw mode reconciles committed results without dispatch. Signed mode requires trusted Ed25519 evidence. E2e verifies both modes against PostgreSQL. |
| POST `/api/access/export-hr` | JWT and Admin or HR Staff role. Returns `MOCK_ACKNOWLEDGED`, `SIMULATED` and a mock receipt. Unit tests check leap February and year rollover. E2e verifies role access. |

## Verification

| Check | Result |
|---|---|
| Backend `yarn install --frozen-lockfile` | Passed. |
| Backend `npm run build` and `npx --no-install tsc --noEmit` | Both passed. |
| Backend `npm test -- --runInBand` | 67 passed in 10 suites. |
| Backend `npm run test:e2e -- --runInBand` | 16 passed in 2 suites with `NODE_OPTIONS=--experimental-vm-modules` for NestJS ESM dependencies. PostgreSQL 17 ran on loopback in a disposable migrated database. The turnstile port was mocked. |
| Flutter `pub get` | Passed with the installed Flutter 3.47.9 SDK. SDK-induced lockfile changes were omitted from the branch. |
| Flutter `analyze` | 0 errors, 4 existing warnings, 45 infos, exit 1. The obsolete asset test API caused 3 errors before correction. |
| Flutter `test --no-pub` | Windows Application Control blocked `flutter_tester.exe` for all 18 test files. Chrome launched but did not report test results before cancellation. The Flutter regressions have static analysis and build evidence only. |
| Flutter `build windows --no-pub` | Passed. Built `build/windows/x64/runner/Release/daily_crew.exe`. |
| Synthetic benchmark | 50 sequential service calls from entry to response, mocked persistence and 120 ms simulated controller delay. Observed p50 125.76 ms, p95 135.74 ms and p99 138.42 ms. Database, HTTP network and physical turnstile timing were outside this measurement. |

## Architecture and remaining limits

SRP remains separated across scan, query, raw reconciliation, signed import and export. Turnstile and credential ports remain substitutable (OCP and DIP), and the turnstile behavior contract and authentication persistence tests still pass (LSP). Scan and persistence interfaces remain focused (ISP). The existing frontend Dio instance and Gate Station notifier are retained on endpoint changes.

Raw queue entries survive retry and endpoint changes during the running session. The queue remains in-memory. The Flutter kiosk still submits Mode 1 raw scans and does not produce the signed Mode 2 evidence format. The live kiosk route has no device identity guard, and recent-event reads remain role-scoped. HR delivery and physical hardware remain simulated. PostgreSQL e2e exercised the local database only. End-to-end Flutter runtime verification remains outstanding.
