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
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`Canopy signaling listening on http://127.0.0.1:${port}/v1`);
}

void bootstrap();
