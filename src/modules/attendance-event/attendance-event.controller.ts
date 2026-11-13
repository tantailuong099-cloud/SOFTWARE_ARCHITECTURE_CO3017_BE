import { Controller, Post, Get, Body, Query, Param } from '@nestjs/common';
import { AccessScanService } from './access-scan.service';
import { AttendanceQueryService } from './attendance-query.service';
import { AttendanceEventService } from './attendance-event.service';
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
    private readonly attendanceService: AttendanceEventService,
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
    return this.attendanceService.exportHRBatch(dto);
  }

  @Post('sync-offline-scans')
  async syncOfflineScans(@Body() dto: SyncOfflineScansDto) {
    return this.attendanceService.syncOfflineScans(dto);
  }
}
