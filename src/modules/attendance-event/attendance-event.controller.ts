import { HrExportService } from './hr-export.service';
import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/model/user.model';
import { AccessScanService } from './access-scan.service';
import { AttendanceQueryService } from './attendance-query.service';
import { OfflineSyncService } from './offline-sync.service';
import {
  ExportHRBatchDto,
  QueryRawEventsDto,
  SubmitAccessScanDto,
  SyncOfflineScansDto,
} from './dto/access-event.dto';

@Controller('api/access')
export class AttendanceEventController {
  constructor(
    private readonly scanService: AccessScanService,
    private readonly queryService: AttendanceQueryService,
    private readonly offlineService: OfflineSyncService,
    private readonly exportService: HrExportService,
  ) {}

  @Post('scan')
  async submitScan(@Body() dto: SubmitAccessScanDto) {
    return this.scanService.submitAccessScan(dto);
  }

  @Get('events')
  @UseGuards(JwtAuthGuard)
  async queryEvents(
    @Query() dto: QueryRawEventsDto,
    @CurrentUser() actor: CurrentUserData,
  ) {
    if (actor.role === UserRole.ADMIN || actor.role === UserRole.HR_STAFF) {
      return this.queryService.queryEvents(dto);
    }
    if (
      !dto.employeeId ||
      (dto.employeeId !== actor.id && dto.employeeId !== actor.employeeCode)
    ) {
      throw new ForbiddenException(
        'Cannot query attendance events for another employee',
      );
    }
    return this.queryService.queryEvents(dto, [
      actor.id,
      ...(actor.employeeCode ? [actor.employeeCode] : []),
    ]);
  }

  @Get('recent-events/:stationId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.ADMIN,
    UserRole.SECURITY_GUARD,
    UserRole.SUPERVISOR,
    UserRole.HR_STAFF,
  )
  async getRecentEvents(@Param('stationId') stationId: string) {
    return this.queryService.getRecentEvents(stationId);
  }

  @Post('export-hr')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.HR_STAFF)
  async exportHRBatch(@Body() dto: ExportHRBatchDto) {
    return this.exportService.exportHRBatch(dto);
  }

  @Post('sync-offline-scans')
  async syncOfflineScans(@Body() body: any) {
    // 1. Nếu là định dạng Kiosk gửi danh sách scans trực tiếp
    if (body && Array.isArray(body.scans)) {
      const stationId = body.stationId || 'BD-GATE-01';
      let processedCount = 0;
      let duplicateCount = 0;
      const results: any[] = [];

      for (const scan of body.scans) {
        try {
          const res = await this.scanService.submitAccessScan({
            requestId: scan.requestId,
            stationId: scan.stationId || stationId,
            qrPayload: scan.qrPayload,
            deviceTimestamp: scan.deviceTimestamp,
          });
          if (res.isCachedDuplicate) {
            duplicateCount++;
          } else {
            processedCount++;
          }
          results.push({
            requestId: scan.requestId,
            status: res.accessDecision === 'APPROVED' ? 'ACCEPTED' : 'DENIED',
            decision: res.accessDecision,
            reasonCode: res.reasonCode,
          });
        } catch (err: any) {
          results.push({
            requestId: scan.requestId,
            status: 'ERROR',
            reasonCode: err.message || 'SCAN_PROCESSING_ERROR',
          });
        }
      }

      return {
        stationId,
        status: 'COMPLETE',
        totalReceived: body.scans.length,
        processedCount,
        acceptedCount: processedCount,
        duplicateCount,
        results,
      };
    }

    // 2. Nếu là định dạng Batch ký số Ed25519 theo chuẩn ADR-008
    return this.offlineService.syncOfflineScans(body as SyncOfflineScansDto);
  }
}
