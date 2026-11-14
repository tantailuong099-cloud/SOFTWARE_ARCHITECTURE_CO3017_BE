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
  BadRequestException,
  ValidationPipe,
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
import { LegacyOfflineSyncService } from './legacy-offline-sync.service';
import {
  ExportHRBatchDto,
  LegacyOfflineBatchDto,
  QueryRawEventsDto,
  SubmitAccessScanDto,
  SyncOfflineScansDto,
} from './dto/access-event.dto';

@Controller('api/access')
export class AttendanceEventController {
  private readonly offlineBatchPipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  constructor(
    private readonly scanService: AccessScanService,
    private readonly queryService: AttendanceQueryService,
    private readonly offlineService: OfflineSyncService,
    private readonly legacyOfflineService: LegacyOfflineSyncService,
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
  async syncOfflineScans(@Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('INVALID_OFFLINE_BATCH');
    }
    if ('scans' in body) {
      if (!Array.isArray(body.scans) || body.scans.length > 25 ||
          body.scans.some(scan => !scan || typeof scan !== 'object' || Array.isArray(scan))) {
        throw new BadRequestException('INVALID_LEGACY_BATCH');
      }
      const batch = await this.offlineBatchPipe.transform(body, {
        type: 'body', metatype: LegacyOfflineBatchDto,
      }) as LegacyOfflineBatchDto;
      if (batch.scans.some(scan => scan.stationId !== batch.stationId) ||
          new Set(batch.scans.map(scan => scan.requestId)).size !== batch.scans.length) {
        throw new BadRequestException('INCONSISTENT_LEGACY_BATCH_IDENTITIES');
      }
      return this.legacyOfflineService.reconcile(batch);
    }

    if (!('events' in body) || !Array.isArray(body.events) ||
        body.events.length > 25 ||
        body.events.some(event => !event || typeof event !== 'object' || Array.isArray(event))) {
      throw new BadRequestException('INVALID_OFFLINE_BATCH');
    }
    const batch = await this.offlineBatchPipe.transform(body, {
      type: 'body', metatype: SyncOfflineScansDto,
    }) as SyncOfflineScansDto;
    return this.offlineService.syncOfflineScans(batch);
  }
}
