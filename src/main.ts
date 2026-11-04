import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Enable CORS for mobile & web clients
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`=======================================================`);
  logger.log(` TMC Access & Attendance Modular Monolith Backend`);
  logger.log(` Server running on: http://localhost:${port}`);
  logger.log(` Core modules loaded:`);
  logger.log(`   1. User & QR Management   -> /api/user-qr`);
  logger.log(`   2. Gate Station Management -> /api/gate-stations`);
  logger.log(`   3. Attendance Event (Scan) -> /api/access/scan`);
  logger.log(`=======================================================`);
}
bootstrap();
