import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SkuDashboardController } from './adapters/inbound/rest/sku-dashboard.controller';
import { ImportController } from './adapters/inbound/rest/import.controller';
import { LinnworksSyncProcessor } from './adapters/inbound/queue/linnworks-sync.processor';
import { LinnworksSyncQueue } from './adapters/inbound/queue/linnworks-sync.queue';
import { LinnworksClient } from './adapters/outbound/linnworks/linnworks-client';
import {
  ILinnworksClient,
  LINNWORKS_CLIENT_TOKEN,
} from './ports/outbound/linnworks-client.port';
import { CsvParserService } from './application/csv-parser.service';
import { BrowseSkusService } from './application/browse-skus.service';
import { GetDashboardMetricsService } from './application/get-dashboard-metrics.service';
import { GetSkuMetricsService } from './application/get-sku-metrics.service';
import { GetInventoryAlertsService } from './application/get-inventory-alerts.service';
import { ImportReportService } from './application/import-report.service';
import { RunLinnworksDailySyncService } from './application/run-linnworks-daily-sync.service';
import { SyncLinnworksCatalogService } from './application/sync-linnworks-catalog.service';
import { SyncLinnworksSalesService } from './application/sync-linnworks-sales.service';
import {
  SKU_REPOSITORY_TOKEN,
  ISkuRepository,
} from './ports/outbound/sku-repository.port';
import { PrismaSkuDashboardRepository } from './adapters/outbound/persistence/prisma-sku-dashboard.repository';
import { UpdateProductService } from './application/update-product.service';

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({
      name: 'linnworks-sync',
    }),
  ],
  controllers: [SkuDashboardController, ImportController],
  providers: [
    CsvParserService,
    LinnworksClient,
    LinnworksSyncQueue,
    LinnworksSyncProcessor,
    PrismaSkuDashboardRepository,
    {
      provide: LINNWORKS_CLIENT_TOKEN,
      useExisting: LinnworksClient,
    },
    {
      provide: SKU_REPOSITORY_TOKEN,
      useExisting: PrismaSkuDashboardRepository,
    },
    {
      provide: GetSkuMetricsService,
      useFactory: (skuRepository: ISkuRepository) =>
        new GetSkuMetricsService(skuRepository),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: BrowseSkusService,
      useFactory: (skuRepository: ISkuRepository) =>
        new BrowseSkusService(skuRepository),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: GetDashboardMetricsService,
      useFactory: (skuRepository: ISkuRepository) =>
        new GetDashboardMetricsService(skuRepository),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: GetInventoryAlertsService,
      useFactory: (skuRepository: ISkuRepository) =>
        new GetInventoryAlertsService(skuRepository),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: SyncLinnworksCatalogService,
      useFactory: (
        linnworksClient: ILinnworksClient,
        skuRepository: ISkuRepository,
      ) => new SyncLinnworksCatalogService(linnworksClient, skuRepository),
      inject: [LINNWORKS_CLIENT_TOKEN, SKU_REPOSITORY_TOKEN],
    },
    {
      provide: SyncLinnworksSalesService,
      useFactory: (
        linnworksClient: ILinnworksClient,
        skuRepository: ISkuRepository,
      ) => new SyncLinnworksSalesService(linnworksClient, skuRepository),
      inject: [LINNWORKS_CLIENT_TOKEN, SKU_REPOSITORY_TOKEN],
    },
    {
      provide: RunLinnworksDailySyncService,
      useFactory: (
        catalogSync: SyncLinnworksCatalogService,
        salesSync: SyncLinnworksSalesService,
        skuRepository: ISkuRepository,
      ) => new RunLinnworksDailySyncService(catalogSync, salesSync, skuRepository),
      inject: [
        SyncLinnworksCatalogService,
        SyncLinnworksSalesService,
        SKU_REPOSITORY_TOKEN,
      ],
    },
    {
      provide: ImportReportService,
      useFactory: (csvParserService: CsvParserService) =>
        new ImportReportService(csvParserService),
      inject: [CsvParserService],
    },
    {
      provide: UpdateProductService,
      useFactory: (skuRepository: ISkuRepository) =>
        new UpdateProductService(skuRepository),
      inject: [SKU_REPOSITORY_TOKEN],
    },
  ],
})
export class SkuDashboardModule {}
