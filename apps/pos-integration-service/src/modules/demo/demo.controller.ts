import { Controller, Headers, HttpCode, Ip, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { DemoService } from './demo.service';
import { clientIpFromRequest } from './demo.types';

@Controller('v1/demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post('simulate-order')
  @HttpCode(200)
  async simulateOrder(
    @Req() req: Request,
    @Ip() nestIp: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const clientIp = clientIpFromRequest(headers, nestIp || req.ip || 'unknown');
    return this.demoService.simulateOrder(clientIp);
  }
}
