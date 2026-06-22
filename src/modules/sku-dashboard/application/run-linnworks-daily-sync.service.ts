import { ISkuRepository } from '../ports/outbound/sku-repository.port';
import {
  CatalogSyncResult,
  SyncLinnworksCatalogService,
} from './sync-linnworks-catalog.service';
import {
  SalesSyncResult,
  SyncLinnworksSalesService,
} from './sync-linnworks-sales.service';

export interface LinnworksSyncResult {
  status: 'COMPLETED' | 'FAILED';
  updatedSkus: number;
  updatedStock: number;
  updatedListings: number;
  syncedAt: string;
  durationMs: number;
  catalog?: CatalogSyncResult;
  sales?: SalesSyncResult;
}

export class RunLinnworksDailySyncService {
  constructor(
    private readonly catalogSync: SyncLinnworksCatalogService,
    private readonly salesSync: SyncLinnworksSalesService,
    private readonly skuRepository: ISkuRepository,
  ) {}

  async execute(): Promise<LinnworksSyncResult> {
    const startedAt = Date.now();
    const logId = await this.skuRepository.createSyncLog({
      provider: 'LINNWORKS',
      status: 'PARTIAL_SUCCESS',
      metadata: { state: 'RUNNING' },
    });

    try {
      const catalog = await this.catalogSync.execute();
      const sales = await this.salesSync.execute(365);
      const durationMs = Date.now() - startedAt;

      await this.skuRepository.updateSyncLog(logId, {
        provider: 'LINNWORKS',
        status: 'SUCCESS',
        processedRows: catalog.products + catalog.stockRows + sales.orderItems,
        metadata: { catalog, sales, durationMs },
      });

      return {
        status: 'COMPLETED',
        updatedSkus: catalog.products,
        updatedStock: catalog.stockRows,
        updatedListings: catalog.channels,
        syncedAt: new Date().toISOString(),
        durationMs,
        catalog,
        sales,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      await this.skuRepository.updateSyncLog(logId, {
        provider: 'LINNWORKS',
        status: 'FAILED',
        failedRows: 1,
        errorMessage:
          error instanceof Error ? error.message : 'Linnworks sync failed',
        metadata: { durationMs },
      });

      throw error;
    }
  }
}

