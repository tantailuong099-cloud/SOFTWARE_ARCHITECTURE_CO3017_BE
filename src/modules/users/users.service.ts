import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Optional } from 'sequelize';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import {
  FactoryId,
  UserAttributes,
  UserModel,
  UserRole,
  UserStatus,
} from './model/user.model';

type UserCreationAttributes = Optional<
  UserAttributes,
  'id' | 'createdAt' | 'updatedAt'
>;

export interface PublicUser {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  factoryId: FactoryId | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(UserModel) private readonly userModel: typeof UserModel,
  ) {}

  async list(search?: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const where = search
      ? {
          [Op.or]: [
            { employeeCode: { [Op.iLike]: `%${search}%` } },
            { fullName: { [Op.iLike]: `%${search}%` } },
            { email: { [Op.iLike]: `%${search}%` } },
          ],
        }
      : undefined;
    const { rows, count } = await this.userModel.findAndCountAll({
      where,
      offset: (safePage - 1) * safeLimit,
      limit: safeLimit,
      order: [['id', 'ASC']],
    });
    return {
      items: rows.map((user) => this.toPublicUser(user)),
      total: count,
      page: safePage,
      limit: safeLimit,
    };
  }

  async getById(id: string) {
    const user = await this.findExisting(id);
    return this.toPublicUser(user);
  }

  async getCurrent(id: string) {
    return this.getById(id);
  }

  async create(dto: CreateUserDto) {
    await this.assertUniqueEmployeeCode(dto.employeeCode);
    await this.assertUniqueEmail(dto.email);
    if (dto.role !== UserRole.ADMIN && !dto.factoryId) {
      throw new BadRequestException(
        'factoryId is required for non-admin users',
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const values: UserCreationAttributes = {
      employeeCode: dto.employeeCode,
      fullName: dto.fullName,
      email: dto.email.toLowerCase(),
      passwordHash,
      role: dto.role ?? UserRole.EMPLOYEE,
      status: dto.status ?? UserStatus.ACTIVE,
      factoryId: dto.factoryId ?? null,
    };
    const user = await this.userModel.create(values);
    return this.toPublicUser(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('No fields provided');
    }
    const user = await this.findExisting(id);
    if (dto.email) {
      await this.assertUniqueEmail(dto.email, id);
    }
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    user.fullName = dto.fullName ?? user.fullName;
    user.email = dto.email ? dto.email.toLowerCase() : user.email;
    user.factoryId =
      dto.factoryId === undefined ? user.factoryId : dto.factoryId;
    await user.save();
    return this.toPublicUser(user);
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto) {
    const user = await this.findExisting(id);
    user.status = dto.status;
    await user.save();
    return this.toPublicUser(user);
  }

  private async findExisting(id: string) {
    const user = await this.userModel.findByPk(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  private async assertUniqueEmployeeCode(
    employeeCode: string,
    excludeId?: string,
  ) {
    const user = await this.userModel.findOne({
      where: {
        employeeCode,
        ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
      },
    });
    if (user) {
      throw new ConflictException('employeeCode already exists');
    }
  }

  private async assertUniqueEmail(email: string, excludeId?: string) {
    const user = await this.userModel.findOne({
      where: {
        email: email.toLowerCase(),
        ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
      },
    });
    if (user) {
      throw new ConflictException('email already exists');
    }
  }

  private toPublicUser(user: UserModel): PublicUser {
    return {
      id: user.id,
      employeeCode: user.employeeCode,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      factoryId: user.factoryId ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
