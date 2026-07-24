import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { StaffAuthGuard } from './staff-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [StaffAuthGuard],
  exports: [StaffAuthGuard],
})
export class AuthModule {}
