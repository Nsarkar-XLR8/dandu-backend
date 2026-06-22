import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { APP_CONFIG_TOKEN } from '../../../../../common/domain/interfaces/app-config.interface';
import type { IAppConfig } from '../../../../../common/domain/interfaces/app-config.interface';

export interface LinnworksSyncJob {
  type: 'daily' | 'manual';
}

@Injectable()
export class LinnworksSyncQueue implements OnModuleInit {
  constructor(
    @InjectQueue('linnworks-sync')
    private readonly queue: Queue<LinnworksSyncJob>,
    @Inject(APP_CONFIG_TOKEN)
    private readonly config: IAppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'daily-sync',
      { type: 'daily' },
      {
        jobId: 'linnworks-daily-sync',
        repeat: { pattern: this.config.linnworks_daily_sync_cron },
        removeOnComplete: 10,
        removeOnFail: 100,
      },
    );
  }

  async enqueueManualSync(): Promise<string | undefined> {
    const job = await this.queue.add(
      'manual-sync',
      { type: 'manual' },
      {
        attempts: 1,
        removeOnComplete: 10,
        removeOnFail: 100,
      },
    );

    return job.id;
  }
}
