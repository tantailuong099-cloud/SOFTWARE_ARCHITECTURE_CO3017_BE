import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserQRModule } from './modules/user-qr/user-qr.module';
import { GateStationModule } from './modules/gate-station/gate-station.module';
import { AttendanceEventModule } from './modules/attendance-event/attendance-event.module';
import { TurnstileModule } from './adapters/turnstile/turnstile.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule.forRoot(),
    AuthModule,
    UserQRModule,
    GateStationModule,
    AttendanceEventModule,
    TurnstileModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
