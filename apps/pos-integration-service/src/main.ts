import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadConfig } from './config/configuration';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.enableCors({
    origin: config.corsOrigins,
  });
  await app.listen(config.port);
  Logger.log(`pos-integration-service listening on :${config.port}`, 'Bootstrap');
}

void bootstrap();
