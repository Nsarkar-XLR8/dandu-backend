import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SKU_REPOSITORY_TOKEN } from '../ports/outbound/sku-repository.port';
import type { ISkuRepository } from '../ports/outbound/sku-repository.port';
import { LinnworksSyncService } from './linnworks-sync.service';
import { Inject } from '@nestjs/common';

@Injectable()
export class SyncSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SyncSchedulerService.name);
  private checkInterval: NodeJS.Timeout | null = null;

  // Run a check once every hour (3600000 ms)
  private static readonly CHECK_INTERVAL_MS = 60 * 60 * 1000;
  // Sync window: 24 hours
  private static readonly SYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000;

  constructor(
    @Inject(SKU_REPOSITORY_TOKEN)
    private readonly skuRepository: ISkuRepository,
    private readonly syncService: LinnworksSyncService,
  ) {}

  onApplicationBootstrap() {
    this.logger.log('Initializing Automated Daily Linnworks Sync Scheduler…');
    
    // Perform initial check immediately with a brief delay so application start isn't blocked
    setTimeout(() => this.runCheck(), 5000);

    // Schedule check to run every hour
    this.checkInterval = setInterval(() => this.runCheck(), SyncSchedulerService.CHECK_INTERVAL_MS);
  }

  async runCheck() {
    this.logger.log('Sync Scheduler: Checking last sync log time…');
    try {
      const lastSyncTime = await this.skuRepository.findLastSuccessfulSync('linnworks');
      
      let shouldSync = false;
      if (!lastSyncTime) {
        this.logger.log('Sync Scheduler: No prior successful sync found. Triggering initial sync.');
        shouldSync = true;
      } else {
        const elapsedMs = Date.now() - lastSyncTime.getTime();
        this.logger.log(`Sync Scheduler: Last successful sync was ${Math.round(elapsedMs / 1000 / 60)} minutes ago.`);
        
        if (elapsedMs >= SyncSchedulerService.SYNC_COOLDOWN_MS) {
          this.logger.log('Sync Scheduler: More than 24 hours elapsed. Triggering daily sync.');
          shouldSync = true;
        }
      }

      if (shouldSync) {
        this.logger.log('Sync Scheduler: Initiating Linnworks sync background process…');
        const result = await this.syncService.sync();
        this.logger.log(`Sync Scheduler: Sync process complete. Status: ${result.status}, duration: ${result.durationMs}ms`);
      } else {
        this.logger.log('Sync Scheduler: Daily sync not required yet.');
      }
    } catch (error) {
      this.logger.error('Sync Scheduler: Error occurred during sync validation', error);
    }
  }

  // Clean up timer on module destroy if applicable
  onModuleDestroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}
