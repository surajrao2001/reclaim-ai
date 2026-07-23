import { Module } from '@nestjs/common';
import { MetaWhatsAppClient } from './meta-whatsapp.client';
import { GupshupWhatsAppClient } from './gupshup-whatsapp.client';
import { WhatsAppSenderService } from './whatsapp-sender.service';

@Module({
  providers: [MetaWhatsAppClient, GupshupWhatsAppClient, WhatsAppSenderService],
  exports: [MetaWhatsAppClient, GupshupWhatsAppClient, WhatsAppSenderService],
})
export class ProvidersModule {}
