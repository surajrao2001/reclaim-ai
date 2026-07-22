import { Module } from '@nestjs/common';
import { HealthController } from './modules/health/health.controller';
import { TenantsModule } from './modules/tenants/tenants.module';

@Module({
  imports: [TenantsModule],
  controllers: [HealthController],
})
export class AppModule {}
