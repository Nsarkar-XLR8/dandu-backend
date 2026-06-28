import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LinnworksSyncService } from './linnworks-sync.service';

@Injectable()
export class SyncSchedulerService {
  private readonly logger = new Logger(SyncSchedulerService.name);

  constructor(
    private readonly syncService: LinnworksSyncService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'nightly-linnworks-sync',
    timeZone: 'America/New_York',
  })
  async runNightlySync() {
    this.logger.log('Sync Scheduler: Starting nightly Linnworks sync at 12:00 AM Eastern Time.');
    try {
      const result = await this.syncService.sync();
      this.logger.log(`Sync Scheduler: Nightly sync complete. Status: ${result.status}, duration: ${result.durationMs}ms`);
    } catch (error) {
      this.logger.error('Sync Scheduler: Nightly sync failed', error);
    }
  }
}
