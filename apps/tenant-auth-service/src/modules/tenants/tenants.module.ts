import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsController } from './tenants.controller';

@Module({
  imports: [AuthModule],
  controllers: [TenantsController],
})
export class TenantsModule {}
