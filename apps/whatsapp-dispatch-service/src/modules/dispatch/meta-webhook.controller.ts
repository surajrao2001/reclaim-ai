import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { WhatsAppMessageStatus } from '@reclaimai/shared-types';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { apiError } from '../../common/api-error';
import { DispatchService } from './dispatch.service';

interface MetaStatusEntry {
  id?: string;
  status?: string;
}

interface MetaWebhookBody {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: MetaStatusEntry[];
      };
    }>;
  }>;
}

const META_STATUS_MAP: Record<string, WhatsAppMessageStatus> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
};

@Controller('v1/webhooks/meta-whatsapp')
export class MetaWebhookController {
  private readonly logger = new Logger(MetaWebhookController.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly dispatch: DispatchService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    if (
      mode === 'subscribe' &&
      token === this.config.metaWaVerifyToken &&
      challenge
    ) {
      return challenge;
    }
    throw apiError(
      HttpStatus.FORBIDDEN,
      'WEBHOOK_VERIFY_FAILED',
      'Invalid Meta webhook verification',
      false,
    );
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() req: Request,
    @Headers('x-hub-signature-256') _signature?: string,
  ): Promise<{ ok: true }> {
    const body = req.body as MetaWebhookBody;
    if (body?.object && body.object !== 'whatsapp_business_account') {
      return { ok: true };
    }

    const statuses =
      body?.entry?.flatMap(
        (entry) =>
          entry.changes?.flatMap((change) => change.value?.statuses ?? []) ??
          [],
      ) ?? [];

    for (const statusEntry of statuses) {
      if (!statusEntry.id || !statusEntry.status) {
        continue;
      }
      const mapped = META_STATUS_MAP[statusEntry.status];
      if (!mapped) {
        this.logger.debug(`Ignoring Meta status=${statusEntry.status}`);
        continue;
      }
      try {
        await this.dispatch.handleMetaStatusUpdate({
          waMessageId: statusEntry.id,
          status: mapped,
        });
      } catch (error) {
        this.logger.error(
          `Webhook status update failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    return { ok: true };
  }
}
