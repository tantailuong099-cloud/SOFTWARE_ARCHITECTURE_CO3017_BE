import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { UserQRService } from './user-qr.service';
import {
  IssueQRCredentialDto,
  SyncEmployeeDto,
  UpdateCredentialStatusDto,
} from './dto/user-qr.dto';

@Controller('api/user-qr')
export class UserQRController {
  constructor(private readonly userQRService: UserQRService) {}

  @Get('employees')
  async listEmployees() {
    return this.userQRService.listEmployees();
  }

  @Get('credentials')
  async listCredentials() {
    return this.userQRService.listCredentials();
  }

  @Get('employees/:id/qr')
  async getEmployeeQR(@Param('id') id: string) {
    return this.userQRService.getCurrentCredential(id);
  }

  @Get('employees/:id/dynamic-qr')
  async getEmployeeDynamicQR(@Param('id') id: string) {
    return this.userQRService.generateDynamicQR(id);
  }

  @Post('credentials/issue')
  async issueCredential(@Body() dto: IssueQRCredentialDto) {
    return this.userQRService.issueCredential(dto);
  }

  @Post('credentials/status')
  async updateStatus(@Body() dto: UpdateCredentialStatusDto) {
    return this.userQRService.updateCredentialStatus(dto);
  }

  @Post('employees/sync')
  async syncEmployee(@Body() dto: SyncEmployeeDto) {
    return this.userQRService.applyEmployeeUpdates(dto);
  }
}
