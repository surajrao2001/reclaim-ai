import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const port = Number(process.env.PORT ?? 3002);
  await app.listen(port);
  Logger.log(`pos-integration-service listening on :${port}`, 'Bootstrap');
}

void bootstrap();
