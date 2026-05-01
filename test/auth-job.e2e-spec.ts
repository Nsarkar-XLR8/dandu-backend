import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/common/services/prisma.service';

describe('Auth & Job Workflow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    
    await app.init();
    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.authUser.deleteMany({ where: { email: 'e2e-test@example.com' } });
    await app.close();
  });

  let accessToken: string;

  it('should register and login (Auth Workflow)', async () => {
    const registerPayload = {
      email: 'e2e-test@example.com',
      username: 'e2etest',
      password: 'Password123!',
    };

    // 1. Register
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(registerPayload)
      .expect(201);

    // 2. Manually verify user in DB (since we don't have easy access to Redis/Email in E2E easily)
    await prisma.authUser.update({
      where: { email: registerPayload.email },
      data: { verified: true },
    });

    // 3. Login
    const loginResponse = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: registerPayload.email,
        password: registerPayload.password,
      })
      .expect(200);

    expect(loginResponse.body.accessToken).toBeDefined();
    accessToken = loginResponse.body.accessToken;
  });

  it('should manage jobs (Job Workflow)', async () => {
    const jobPayload = {
      company: 'E2E Corp',
      role: 'E2E Tester',
      location: 'Remote',
      appliedDate: new Date().toISOString(),
      appliedVia: 'LINKEDIN',
      status: 'APPLIED',
    };

    // 1. Create Job
    const createResponse = await request(app.getHttpServer())
      .post('/v1/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(jobPayload)
      .expect(201);

    expect(createResponse.body.id).toBeDefined();
    const jobId = createResponse.body.id;

    // 2. Get All Jobs
    const getResponse = await request(app.getHttpServer())
      .get('/v1/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(getResponse.body)).toBe(true);
    expect(getResponse.body.length).toBeGreaterThan(0);

    // 3. Delete Job
    await request(app.getHttpServer())
      .delete(`/v1/jobs/${jobId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });
});
