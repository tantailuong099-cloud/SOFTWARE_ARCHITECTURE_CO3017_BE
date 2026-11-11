import { Controller, Post, Get, Body, Query, Param } from '@nestjs/common';
import { AttendanceEventService } from './attendance-event.service';
import {
  ExportHRBatchDto,
  QueryRawEventsDto,
  SubmitAccessScanDto,
  SyncOfflineScansDto,
} from './dto/access-event.dto';

@Controller('api/access')
export class AttendanceEventController {
  constructor(private readonly attendanceService: AttendanceEventService) {}

  @Post('scan')
  async submitScan(@Body() dto: SubmitAccessScanDto) {
    return this.attendanceService.submitAccessScan(dto);
  }

  @Get('events')
  async queryEvents(@Query() dto: QueryRawEventsDto) {
    return this.attendanceService.queryEvents(dto);
  }

  @Get('recent-events/:stationId')
  async getRecentEvents(@Param('stationId') stationId: string) {
    return this.attendanceService.getRecentEvents(stationId);
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
