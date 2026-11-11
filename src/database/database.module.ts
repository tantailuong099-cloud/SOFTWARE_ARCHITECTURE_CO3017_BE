import 'dotenv/config';
import {
  DynamicModule,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { TokenModel } from '../modules/auth/model/token.model';
import { UserModel } from '../modules/users/model/user.model';
import { QRCredentialModel } from '../modules/user-qr/model/qr-credential.model';
import { QRPresentationModel } from '../modules/user-qr/model/qr-presentation.model';
import { GateStationModel } from '../modules/gate-station/model/gate-station.model';
import { AccessEventModel } from '../modules/attendance-event/model/access-event.model';
import { AccessScanRequestModel } from '../modules/attendance-event/model/access-scan-request.model';

@Injectable()
export class DatabaseConnectionChecker implements OnModuleInit {
  private readonly logger = new Logger('DatabaseModule');

  constructor(private readonly sequelize: Sequelize) {}

  async onModuleInit() {
    try {
      await this.sequelize.authenticate();
      this.logger.log(
        '>> Connection to Neon PostgreSQL established successfully!',
      );
    } catch (error) {
      this.logger.error('>> Unable to connect to Neon PostgreSQL:', error);
    }
  }
}

@Module({})
export class DatabaseModule {
  private static readonly logger = new Logger(DatabaseModule.name);

  static forRoot(): DynamicModule {
    const isDbEnabled = process.env.ENABLE_DB === 'true';

    if (!isDbEnabled) {
      this.logger.warn(
        'Database connection disabled (ENABLE_DB is not true). Running with in-memory stores.',
      );
      return {
        module: DatabaseModule,
      };
    }

    return {
      module: DatabaseModule,
      imports: [
        SequelizeModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => {
            const databaseUrl =
              configService.get<string>('DATABASE_URL_POOLED') ||
              configService.get<string>('DATABASE_URL');
            const sslRequired =
              configService.get<string>('DB_SSL') === 'true' ||
              Boolean(databaseUrl?.includes('sslmode=require'));

            return {
              dialect: 'postgres',
              ...(databaseUrl
                ? { uri: databaseUrl }
                : {
                    host: configService.get<string>('DB_HOST', 'localhost'),
                    port: Number(configService.get<string>('DB_PORT', '5432')),
                    username: configService.get<string>(
                      'DB_USERNAME',
                      'postgres',
                    ),
                    password: configService.get<string>(
                      'DB_PASSWORD',
                      'postgres',
                    ),
                    database: configService.get<string>(
                      'DB_DATABASE',
                      'tmc_attendance',
                    ),
                  }),
              autoLoadModels: true,
              models: [
                UserModel,
                TokenModel,
                QRCredentialModel,
                QRPresentationModel,
                GateStationModel,
                AccessEventModel,
                AccessScanRequestModel,
              ],
              synchronize: false,
              logging: false,
              ...(sslRequired
                ? {
                    dialectOptions: {
                      ssl: {
                        require: true,
                        rejectUnauthorized: false,
                      },
                    },
                  }
                : {}),
            };
          },
        }),
      ],
      providers: [DatabaseConnectionChecker],
      exports: [SequelizeModule],
    };
  }
}
