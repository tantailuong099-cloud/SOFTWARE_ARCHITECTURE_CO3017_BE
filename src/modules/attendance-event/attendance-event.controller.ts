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
  async syncOfflineScans(@Body() dto: SyncOfflineScansDto) {
    return this.offlineService.syncOfflineScans(dto);
  }
}
