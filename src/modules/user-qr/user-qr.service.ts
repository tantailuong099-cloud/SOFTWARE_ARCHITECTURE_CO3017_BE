import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EmployeeModel, EmployeeRole, EmployeeStatus, FactoryId } from './model/employee.model';
import { CredentialStatus, QRCredentialModel } from './model/qr-credential.model';
import {
  CredentialValidationResult,
  IssueQRCredentialDto,
  SyncEmployeeDto,
  UpdateCredentialStatusDto,
} from './dto/user-qr.dto';
import * as crypto from 'crypto';

@Injectable()
export class UserQRService {
  private readonly logger = new Logger(UserQRService.name);

  // In-memory fallback stores for immediate standalone operation / resilience
  private readonly employeesStore = new Map<string, any>();
  private readonly credentialsStore = new Map<string, any>();
  private readonly HMAC_SECRET = 'TMC_DYNAMIC_QR_SECRET_KEY_2026';
  private readonly usedDynamicNonces = new Set<string>(); // M2 Anti-replay protection (ADR-007)

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    const initialEmployees = [
      {
        id: 'EMP-BD-001',
        fullName: 'Nguyen Van An',
        factoryId: FactoryId.BINH_DUONG,
        status: EmployeeStatus.ACTIVE,
        department: 'Assembly Line 1',
        role: EmployeeRole.EMPLOYEE,
      },
      {
        id: 'EMP-BD-002',
        fullName: 'Tran Thi Bich',
        factoryId: FactoryId.BINH_DUONG,
        status: EmployeeStatus.ACTIVE,
        department: 'Quality Assurance',
        role: EmployeeRole.SUPERVISOR,
      },
      {
        id: 'EMP-BD-003',
        fullName: 'Le Hoang Nam',
        factoryId: FactoryId.BINH_DUONG,
        status: EmployeeStatus.INACTIVE, // Inactive employee test case
        department: 'Packaging',
        role: EmployeeRole.EMPLOYEE,
      },
      {
        id: 'EMP-LA-001',
        fullName: 'Pham Minh Duc',
        factoryId: FactoryId.LONG_AN,
        status: EmployeeStatus.ACTIVE,
        department: 'Machining',
        role: EmployeeRole.EMPLOYEE,
      },
      {
        id: 'EMP-LA-002',
        fullName: 'Vo Thi Mai',
        factoryId: FactoryId.LONG_AN,
        status: EmployeeStatus.ACTIVE,
        department: 'Human Resources',
        role: EmployeeRole.HR_STAFF,
      },
    ];

    for (const emp of initialEmployees) {
      this.employeesStore.set(emp.id, emp);
    }

    const now = new Date();
    const oneDayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const initialCredentials = [
      // 1. Valid Active QR for Nguyen Van An (Binh Duong)
      {
        credentialId: 'CRED-BD-001',
        employeeId: 'EMP-BD-001',
        qrPayload: 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
        status: CredentialStatus.ACTIVE,
        version: 1,
        issuedAt: now,
        expiresAt: oneDayLater,
      },
      // 2. Suspended QR for Tran Thi Bich
      {
        credentialId: 'CRED-BD-002',
        employeeId: 'EMP-BD-002',
        qrPayload: 'TMC:QR:EMP-BD-002:V1:SEC_SUSPENDED_KEY_002',
        status: CredentialStatus.SUSPENDED,
        version: 1,
        issuedAt: now,
        expiresAt: oneDayLater,
      },
      // 3. Expired QR for Le Hoang Nam
      {
        credentialId: 'CRED-BD-003',
        employeeId: 'EMP-BD-003',
        qrPayload: 'TMC:QR:EMP-BD-003:V1:SEC_EXPIRED_KEY_003',
        status: CredentialStatus.ACTIVE,
        version: 1,
        issuedAt: new Date(now.getTime() - 48 * 60 * 60 * 1000),
        expiresAt: yesterday,
      },
      // 4. Valid Active QR for Pham Minh Duc (Long An)
      {
        credentialId: 'CRED-LA-001',
        employeeId: 'EMP-LA-001',
        qrPayload: 'TMC:QR:EMP-LA-001:V1:SEC_VALID_KEY_LA01',
        status: CredentialStatus.ACTIVE,
        version: 1,
        issuedAt: now,
        expiresAt: oneDayLater,
      },
    ];

    for (const cred of initialCredentials) {
      this.credentialsStore.set(cred.credentialId, cred);
    }
  }

  // --- Contract: ValidateCredential (Table 32, ADR-002 & M2 Dynamic QR ADR-007) ---
  async validateCredential(qrPayload: string): Promise<CredentialValidationResult> {
    if (!qrPayload) {
      return {
        isRecognized: false,
        isValid: false,
        denialReason: 'EMPTY_QR_PAYLOAD',
      };
    }

    // --- M2 Enhancement: Dynamic Time-based Rotating QR (ADR-007) ---
    if (qrPayload.startsWith('TMC:DYN:')) {
      const parts = qrPayload.split(':');
      if (parts.length < 6) {
        return {
          isRecognized: false,
          isValid: false,
          denialReason: 'MALFORMED_DYNAMIC_QR',
        };
      }
      const [, , employeeId, timestampStr, nonce, signature] = parts;
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();

      const employee = this.employeesStore.get(employeeId);
      if (!employee) {
        return {
          isRecognized: true,
          isValid: false,
          denialReason: 'EMPLOYEE_RECORD_MISSING',
        };
      }

      // 1. Expiration check: strictly valid for 60 seconds (prevents screenshot/photo sharing)
      const ageMs = Math.abs(now - timestamp);
      if (ageMs > 60 * 1000) {
        return {
          isRecognized: true,
          isValid: false,
          denialReason: 'DYNAMIC_QR_EXPIRED',
          employeeId: employee.id,
          employeeName: employee.fullName,
          factoryId: employee.factoryId,
          employeeStatus: employee.status,
          credentialId: `DYN-${employee.id}`,
          credentialStatus: CredentialStatus.ACTIVE,
          version: 2,
          isDynamic: true,
        };
      }

      // 2. Replay attack check: nonce cannot be reused within the validity window
      if (this.usedDynamicNonces.has(nonce)) {
        return {
          isRecognized: true,
          isValid: false,
          denialReason: 'DYNAMIC_QR_REPLAY_ATTACK',
          employeeId: employee.id,
          employeeName: employee.fullName,
          factoryId: employee.factoryId,
          employeeStatus: employee.status,
          credentialId: `DYN-${employee.id}`,
          credentialStatus: CredentialStatus.ACTIVE,
          version: 2,
          isDynamic: true,
        };
      }

      // 3. HMAC signature verification
      const expectedSig = crypto
        .createHmac('sha256', this.HMAC_SECRET)
        .update(`${employeeId}:${timestampStr}:${nonce}`)
        .digest('hex')
        .substring(0, 16);

      if (signature !== expectedSig) {
        return {
          isRecognized: true,
          isValid: false,
          denialReason: 'DYNAMIC_QR_SIGNATURE_INVALID',
          employeeId: employee.id,
          employeeName: employee.fullName,
          factoryId: employee.factoryId,
          employeeStatus: employee.status,
          credentialId: `DYN-${employee.id}`,
          version: 2,
          isDynamic: true,
        };
      }

      // Mark nonce as used
      this.usedDynamicNonces.add(nonce);

      return {
        isRecognized: true,
        isValid: true,
        employeeId: employee.id,
        employeeName: employee.fullName,
        factoryId: employee.factoryId,
        employeeStatus: employee.status,
        credentialId: `DYN-${employee.id}`,
        credentialStatus: CredentialStatus.ACTIVE,
        version: 2,
        isDynamic: true,
      };
    }

    // --- Standard Static QR Credential (M1 Baseline) ---
    if (!qrPayload.startsWith('TMC:QR:')) {
      return {
        isRecognized: false,
        isValid: false,
        denialReason: 'UNRECOGNIZED_CREDENTIAL',
      };
    }

    // Find credential by payload
    let matchedCred: any = null;
    for (const cred of this.credentialsStore.values()) {
      if (cred.qrPayload === qrPayload) {
        matchedCred = cred;
        break;
      }
    }

    if (!matchedCred) {
      return {
        isRecognized: false,
        isValid: false,
        denialReason: 'CREDENTIAL_NOT_FOUND',
      };
    }

    const employee = this.employeesStore.get(matchedCred.employeeId);
    if (!employee) {
      return {
        isRecognized: true,
        isValid: false,
        denialReason: 'EMPLOYEE_RECORD_MISSING',
      };
    }

    const now = new Date();
    // Check expiry
    if (new Date(matchedCred.expiresAt) < now) {
      return {
        isRecognized: true,
        isValid: false,
        denialReason: 'CREDENTIAL_EXPIRED',
        employeeId: employee.id,
        employeeName: employee.fullName,
        factoryId: employee.factoryId,
        employeeStatus: employee.status,
        credentialId: matchedCred.credentialId,
        credentialStatus: matchedCred.status,
        version: matchedCred.version,
      };
    }

    // Check credential status (ACTIVE, SUSPENDED, REVOKED)
    if (matchedCred.status === CredentialStatus.SUSPENDED) {
      return {
        isRecognized: true,
        isValid: false,
        denialReason: 'CREDENTIAL_SUSPENDED',
        employeeId: employee.id,
        employeeName: employee.fullName,
        factoryId: employee.factoryId,
        employeeStatus: employee.status,
        credentialId: matchedCred.credentialId,
        credentialStatus: matchedCred.status,
        version: matchedCred.version,
      };
    }

    if (matchedCred.status === CredentialStatus.REVOKED) {
      return {
        isRecognized: true,
        isValid: false,
        denialReason: 'CREDENTIAL_REVOKED',
        employeeId: employee.id,
        employeeName: employee.fullName,
        factoryId: employee.factoryId,
        employeeStatus: employee.status,
        credentialId: matchedCred.credentialId,
        credentialStatus: matchedCred.status,
        version: matchedCred.version,
      };
    }

    return {
      isRecognized: true,
      isValid: true,
      employeeId: employee.id,
      employeeName: employee.fullName,
      factoryId: employee.factoryId,
      employeeStatus: employee.status,
      credentialId: matchedCred.credentialId,
      credentialStatus: matchedCred.status,
      version: matchedCred.version,
    };
  }

  // --- Contract: GetEmployeeAccessState (Table 32) ---
  async getEmployeeAccessState(employeeId: string) {
    const employee = this.employeesStore.get(employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }
    return {
      employeeId: employee.id,
      fullName: employee.fullName,
      factoryId: employee.factoryId,
      status: employee.status,
      department: employee.department,
      role: employee.role,
    };
  }

  // --- Contract: GetCurrentCredential (Table 32 & UC-01) ---
  async getCurrentCredential(employeeId: string) {
    const employee = await this.getEmployeeAccessState(employeeId);
    // Find active credential for employee
    let activeCred: any = null;
    for (const cred of this.credentialsStore.values()) {
      if (cred.employeeId === employeeId && cred.status === CredentialStatus.ACTIVE) {
        if (!activeCred || cred.version > activeCred.version) {
          activeCred = cred;
        }
      }
    }

    if (!activeCred) {
      // Auto-issue standard credential if none exists
      return this.issueCredential({ employeeId });
    }

    return {
      employee,
      credential: activeCred,
    };
  }

  // --- M2 Contract: GenerateDynamicQR (ADR-007 Rotating QR Anti-Spoofing) ---
  async generateDynamicQR(employeeId: string) {
    const employee = await this.getEmployeeAccessState(employeeId);
    if (employee.status !== EmployeeStatus.ACTIVE) {
      throw new BadRequestException(`Employee ${employeeId} is inactive, cannot issue dynamic QR`);
    }

    const now = Date.now();
    const nonce = crypto.randomBytes(4).toString('hex');
    const signature = crypto
      .createHmac('sha256', this.HMAC_SECRET)
      .update(`${employeeId}:${now}:${nonce}`)
      .digest('hex')
      .substring(0, 16);

    const qrPayload = `TMC:DYN:${employeeId}:${now}:${nonce}:${signature}`;
    const validDurationSeconds = 60;
    const expiresAt = new Date(now + validDurationSeconds * 1000);

    return {
      employeeId: employee.employeeId,
      employeeName: employee.fullName,
      factoryId: employee.factoryId,
      qrPayload,
      generatedAt: new Date(now).toISOString(),
      expiresAt: expiresAt.toISOString(),
      validDurationSeconds,
    };
  }

  // --- Contract: ApplyEmployeeUpdates (Table 32 & FR-UM-01) ---
  async applyEmployeeUpdates(dto: SyncEmployeeDto) {
    const existing = this.employeesStore.get(dto.id) || {};
    const updated = {
      ...existing,
      ...dto,
      updatedAt: new Date(),
    };
    this.employeesStore.set(dto.id, updated);
    this.logger.log(`Synchronized employee record: ${dto.id} - ${dto.fullName} (${dto.status})`);
    return updated;
  }

  // --- UC-02: Issue QR Credential (FR-UM-02) ---
  async issueCredential(dto: IssueQRCredentialDto) {
    const employee = this.employeesStore.get(dto.employeeId);
    if (!employee) {
      throw new NotFoundException(`Employee ${dto.employeeId} not found`);
    }

    const now = new Date();
    const days = dto.validDays || 1;
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const credentialId = `CRED-${dto.employeeId.replace('EMP-', '')}-${Date.now().toString().slice(-4)}`;
    const randomSecret = crypto.randomBytes(6).toString('hex').toUpperCase();
    const qrPayload = `TMC:QR:${dto.employeeId}:V1:${randomSecret}`;

    const newCred = {
      credentialId,
      employeeId: dto.employeeId,
      qrPayload,
      status: CredentialStatus.ACTIVE,
      version: 1,
      issuedAt: now,
      expiresAt,
    };

    this.credentialsStore.set(credentialId, newCred);
    this.logger.log(`Issued new QR Credential ${credentialId} for ${dto.employeeId}`);
    return {
      employee,
      credential: newCred,
    };
  }

  // --- UC-02: Update QR Credential Status (FR-UM-03) ---
  async updateCredentialStatus(dto: UpdateCredentialStatusDto) {
    const cred = this.credentialsStore.get(dto.credentialId);
    if (!cred) {
      throw new NotFoundException(`Credential ${dto.credentialId} not found`);
    }

    cred.status = dto.status;
    cred.updatedAt = new Date();
    this.credentialsStore.set(dto.credentialId, cred);
    this.logger.log(`Credential ${dto.credentialId} status changed to ${dto.status} by ${dto.updatedBy}`);

    return {
      success: true,
      credentialId: dto.credentialId,
      status: dto.status,
      updatedAt: cred.updatedAt,
    };
  }

  async listEmployees() {
    return Array.from(this.employeesStore.values());
  }

  async listCredentials() {
    return Array.from(this.credentialsStore.values());
  }
}
