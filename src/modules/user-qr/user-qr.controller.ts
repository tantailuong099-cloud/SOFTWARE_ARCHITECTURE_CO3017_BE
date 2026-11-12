import { Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserQRService } from './user-qr.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/model/user.model';

@Controller(['api/qr', 'api/user-qr'])
export class UserQRController {
  constructor(private readonly userQRService: UserQRService) {}

  @Get('employees/:employeeId/dynamic-qr')
  getEmployeeDynamicQR(@Param('employeeId') employeeId: string) {
    return this.userQRService.generateDynamicQR(employeeId);
  }

  @Post('employees/:employeeId/dynamic-qr')
  generateEmployeeDynamicQR(@Param('employeeId') employeeId: string) {
    return this.userQRService.generateDynamicQR(employeeId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMyCredential(@CurrentUser('id') userId: string) {
    return this.userQRService.getMyCredential(userId);
  }

  @Post('me/presentations')
  @UseGuards(JwtAuthGuard)
  generatePresentation(@CurrentUser('id') userId: string) {
    return this.userQRService.generatePresentation(userId);
  }

  @Get('credentials')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listDbCredentials() {
    return this.userQRService.listCredentials();
  }

  @Post('credentials/:userId/issue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  issueDbCredential(@Param('userId') userId: string) {
    return this.userQRService.issueCredential(userId);
  }

  @Patch('credentials/:id/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  revokeDbCredential(@Param('id') id: string) {
    return this.userQRService.revokeCredential(id);
  }
}
