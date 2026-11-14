import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports operational status', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('OPERATIONAL'));
  });

  it.each([
    ['get', '/api/access/events'],
    ['get', '/api/access/recent-events/BD-GATE-01'],
    ['get', '/api/gate-stations'],
    ['post', '/api/access/export-hr'],
    ['get', '/api/user-qr/employees/EMP-BD-001/dynamic-qr'],
    ['get', '/api/qr/employees/EMP-BD-001/dynamic-qr'],
    ['post', '/api/qr/employees/EMP-BD-001/dynamic-qr'],
  ] as const)('requires a session for %s %s', async (method, path) => {
    await request(app.getHttpServer())[method](path).expect(401);
  });
});
