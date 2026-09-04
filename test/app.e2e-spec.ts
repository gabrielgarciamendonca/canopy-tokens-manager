process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ROOM_TTL_SECONDS = '900';
process.env.MAIL_DEV_RETURN_CODE = 'true';
process.env.NODE_ENV = 'test';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Canopy signaling (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /v1/health', async () => {
    await request(app.getHttpServer())
      .get('/v1/health')
      .expect(200)
      .expect({ ok: true, service: 'canopy-signaling' });
  });

  it('rejects unauthenticated room access', async () => {
    await request(app.getHttpServer()).post('/v1/rooms').send({ offer: 'x'.repeat(40) }).expect(401);
  });

  it('exchanges offer/answer only for signed-in users', async () => {
    const hostToken = await signIn(app, 'host@example.com');
    const guestToken = await signIn(app, 'guest@example.com');
    const offer = `offer-${'a'.repeat(40)}`;
    const answer = `answer-${'b'.repeat(40)}`;

    const created = await request(app.getHttpServer())
      .post('/v1/rooms')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ offer })
      .expect(201);

    expect(created.body.code).toMatch(/^CN-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(created.body.offer).toBeUndefined();

    const fetched = await request(app.getHttpServer())
      .get(`/v1/rooms/${created.body.code}`)
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);
    expect(fetched.body.offer).toBe(offer);

    await request(app.getHttpServer())
      .get(`/v1/rooms/${created.body.code}/answer`)
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .put(`/v1/rooms/${created.body.code}/answer`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ answer })
      .expect(200);

    const hostAnswer = await request(app.getHttpServer())
      .get(`/v1/rooms/${created.body.code}/answer`)
      .set('Authorization', `Bearer ${hostToken}`)
      .expect(200);
    expect(hostAnswer.body.answer).toBe(answer);
  });
});

async function signIn(app: INestApplication<App>, email: string): Promise<string> {
  const requested = await request(app.getHttpServer())
    .post('/v1/auth/request-code')
    .send({ email })
    .expect(201);
  expect(requested.body.devCode).toMatch(/^\d{6}$/);

  const verified = await request(app.getHttpServer())
    .post('/v1/auth/verify')
    .send({ email, code: requested.body.devCode })
    .expect(201);
  return verified.body.accessToken as string;
}
