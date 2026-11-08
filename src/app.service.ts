import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getSystemStatus() {
    return {
      system: 'TMC Attendance and Access Control System',
      architecture: 'Modular Monolith (ADR-001)',
      version: 'M2-Baseline',
      status: 'OPERATIONAL',
      modules: {
        userQRManagement: 'LOADED',
        gateStationManagement: 'LOADED',
        attendanceEventRecording: 'LOADED',
        turnstileAdapter: 'LOADED',
      },
      supportedFactories: [
        'BINH_DUONG (~800 employees)',
        'LONG_AN (~600 employees)',
      ],
      kpiRequirement:
        'Kiosk response time <= 2.0s under peak workload (NFR-PERF-01)',
    };
  }
}
