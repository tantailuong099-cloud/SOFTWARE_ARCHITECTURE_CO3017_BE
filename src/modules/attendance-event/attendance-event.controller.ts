import { HrExportService } from './hr-export.service';
import { Controller, Post, Get, Body, Query, Param } from '@nestjs/common';
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
  async queryEvents(@Query() dto: QueryRawEventsDto) {
    return this.queryService.queryEvents(dto);
  }

  @Get('recent-events/:stationId')
  async getRecentEvents(@Param('stationId') stationId: string) {
    return this.queryService.getRecentEvents(stationId);
  }

  @Post('export-hr')
  async exportHRBatch(@Body() dto: ExportHRBatchDto) {
    return this.exportService.exportHRBatch(dto);
  }

  @Post('sync-offline-scans')
  async syncOfflineScans(@Body() dto: SyncOfflineScansDto) {
    return this.offlineService.syncOfflineScans(dto);
  }
}
