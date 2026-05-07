import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppEnvironment } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService =
    app.get<ConfigService<AppEnvironment, true>>(ConfigService);
  const port = Number(configService.get('PORT', { infer: true }));
  const apiPrefix = configService.get('API_PREFIX', { infer: true });
  const corsOrigin = configService.get('CORS_ORIGIN', { infer: true });
  const corsOrigins = corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.setGlobalPrefix(apiPrefix);
  app.enableShutdownHooks();
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
