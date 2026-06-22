import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import config from '../config/app.config';
import { EmailService } from '../services/email.service';
import { EmailQueueService } from '../queues/email/email.queue';
import { EmailProcessor } from '../queues/email/email.processor';
import { EMAIL_SENDER_TOKEN } from '../domain/interfaces/email-sender.interface';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [
    PrismaModule,
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0', 10),
      },
      skipVersionCheck: true,
      prefix: `${config.redis_cache_key_prefix}:bull`,
    }),
    BullModule.registerQueue({
      name: 'email',
    }),
  ],
  providers: [
    EmailQueueService,
    { provide: EMAIL_SENDER_TOKEN, useExisting: EmailQueueService },
    EmailProcessor,
    EmailService,
  ],
  exports: [EmailQueueService, EMAIL_SENDER_TOKEN],
})
export class QueueModule {}
