import { Controller, Get, Param } from '@nestjs/common';
import { TenantsService } from './tenants.service';

@Controller('v1/tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get(':tenantId')
  getTenant(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getById(tenantId);
  }
}
