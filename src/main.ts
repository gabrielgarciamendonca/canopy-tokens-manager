import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map((item) => item.trim()) ?? true,
  });
  const http = app.getHttpAdapter().getInstance();
  http.disable('x-powered-by');
  http.get('/health', (_req: unknown, res: { json: (body: unknown) => void }) => {
    res.json({ ok: true, service: 'canopy-signaling' });
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Canopy signaling listening on 0.0.0.0:${port}`);
}

void bootstrap();
