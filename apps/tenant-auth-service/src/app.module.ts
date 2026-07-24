import { Module } from '@nestjs/common';
import { AppConfigModule } from './modules/config/app-config.module';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [AppConfigModule, DatabaseModule, AuthModule, TenantsModule],
  controllers: [HealthController],
})
export class AppModule {}
