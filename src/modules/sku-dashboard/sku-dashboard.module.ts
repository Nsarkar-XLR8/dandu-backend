
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';

// Controllers
import { SkuDashboardController } from './adapters/inbound/rest/sku-dashboard.controller';
import { ImportController } from './adapters/inbound/rest/import.controller';

// Application services
import { CsvParserService } from './application/csv-parser.service';
import { GetSkuMetricsService } from './application/get-sku-metrics.service';
import { ImportReportService } from './application/import-report.service';
import { BrowseSkusService } from './application/browse-skus.service';
import { GetDashboardMetricsService } from './application/get-dashboard-metrics.service';
import { GetInventoryAlertsService } from './application/get-inventory-alerts.service';
import { UpdateProductService } from './application/update-product.service';
import { LinnworksSyncService } from './application/linnworks-sync.service';
import { LinnworksInventoryRefreshService } from './application/linnworks-inventory-refresh.service';
import { LinnworksHistoricalSalesIngestionService } from './application/linnworks-historical-sales-ingestion.service';
import { SyncSchedulerService } from './application/sync-scheduler.service';

// Ports
import {
  SKU_REPOSITORY_TOKEN,
  ISkuRepository,
} from './ports/outbound/sku-repository.port';

// Adapters
import { PrismaSkuDashboardRepository } from './adapters/outbound/persistence/prisma-sku-dashboard.repository';
import { LinnworksConfig } from './adapters/outbound/linnworks/linnworks.config';
import { LinnworksApiClient } from './adapters/outbound/linnworks/linnworks-api.client';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [SkuDashboardController, ImportController],
  providers: [
    // -------------------------------------------------------------------------
    // Infrastructure
    // -------------------------------------------------------------------------
    PrismaSkuDashboardRepository,
    {
      provide: SKU_REPOSITORY_TOKEN,
      useExisting: PrismaSkuDashboardRepository,
    },
    LinnworksConfig,
    {
      provide: LinnworksApiClient,
      useFactory: (config: LinnworksConfig) => new LinnworksApiClient(config),
      inject: [LinnworksConfig],
    },

    // -------------------------------------------------------------------------
    // Application services
    // -------------------------------------------------------------------------
    CsvParserService,

    {
      provide: GetSkuMetricsService,
      useFactory: (repo: ISkuRepository) => new GetSkuMetricsService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: BrowseSkusService,
      useFactory: (repo: ISkuRepository) => new BrowseSkusService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: GetDashboardMetricsService,
      useFactory: (repo: ISkuRepository) => new GetDashboardMetricsService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: GetInventoryAlertsService,
      useFactory: (repo: ISkuRepository) => new GetInventoryAlertsService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: UpdateProductService,
      useFactory: (repo: ISkuRepository) => new UpdateProductService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: ImportReportService,
      useFactory: (csvParser: CsvParserService, repo: ISkuRepository) =>
        new ImportReportService(csvParser, repo),
      inject: [CsvParserService, SKU_REPOSITORY_TOKEN],
    },
    {
      provide: LinnworksSyncService,
      useFactory: (client: LinnworksApiClient, repo: ISkuRepository) =>
        new LinnworksSyncService(client, repo),
      inject: [LinnworksApiClient, SKU_REPOSITORY_TOKEN],
    },
    {
      provide: LinnworksInventoryRefreshService,
      useFactory: (client: LinnworksApiClient, repo: ISkuRepository) =>
        new LinnworksInventoryRefreshService(client, repo),
      inject: [LinnworksApiClient, SKU_REPOSITORY_TOKEN],
    },
    {
      provide: LinnworksHistoricalSalesIngestionService,
      useFactory: (client: LinnworksApiClient, repo: ISkuRepository) =>
        new LinnworksHistoricalSalesIngestionService(client, repo),
      inject: [LinnworksApiClient, SKU_REPOSITORY_TOKEN],
    },
    SyncSchedulerService,
  ],
})
export class SkuDashboardModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';

// Controllers
import { SkuDashboardController } from './adapters/inbound/rest/sku-dashboard.controller';
import { ImportController } from './adapters/inbound/rest/import.controller';

// Application services
import { CsvParserService } from './application/csv-parser.service';
import { GetSkuMetricsService } from './application/get-sku-metrics.service';
import { ImportReportService } from './application/import-report.service';
import { BrowseSkusService } from './application/browse-skus.service';
import { GetDashboardMetricsService } from './application/get-dashboard-metrics.service';
import { GetInventoryAlertsService } from './application/get-inventory-alerts.service';
import { UpdateProductService } from './application/update-product.service';
import { LinnworksSyncService } from './application/linnworks-sync.service';
import { LinnworksHistoricalSalesIngestionService } from './application/linnworks-historical-sales-ingestion.service';
import { SyncSchedulerService } from './application/sync-scheduler.service';

// Ports
import {
  SKU_REPOSITORY_TOKEN,
  ISkuRepository,
} from './ports/outbound/sku-repository.port';

// Adapters
import { PrismaSkuDashboardRepository } from './adapters/outbound/persistence/prisma-sku-dashboard.repository';
import { LinnworksConfig } from './adapters/outbound/linnworks/linnworks.config';
import { LinnworksApiClient } from './adapters/outbound/linnworks/linnworks-api.client';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [SkuDashboardController, ImportController],
  providers: [
    // -------------------------------------------------------------------------
    // Infrastructure
    // -------------------------------------------------------------------------
    PrismaSkuDashboardRepository,
    {
      provide: SKU_REPOSITORY_TOKEN,
      useExisting: PrismaSkuDashboardRepository,
    },
    LinnworksConfig,
    {
      provide: LinnworksApiClient,
      useFactory: (config: LinnworksConfig) => new LinnworksApiClient(config),
      inject: [LinnworksConfig],
    },

    // -------------------------------------------------------------------------
    // Application services
    // -------------------------------------------------------------------------
    CsvParserService,

    {
      provide: GetSkuMetricsService,
      useFactory: (repo: ISkuRepository) => new GetSkuMetricsService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: BrowseSkusService,
      useFactory: (repo: ISkuRepository) => new BrowseSkusService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: GetDashboardMetricsService,
      useFactory: (repo: ISkuRepository) => new GetDashboardMetricsService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: GetInventoryAlertsService,
      useFactory: (repo: ISkuRepository) => new GetInventoryAlertsService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: UpdateProductService,
      useFactory: (repo: ISkuRepository) => new UpdateProductService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: ImportReportService,
      useFactory: (csvParser: CsvParserService, repo: ISkuRepository) =>
        new ImportReportService(csvParser, repo),
      inject: [CsvParserService, SKU_REPOSITORY_TOKEN],
    },
    {
      provide: LinnworksSyncService,
      useFactory: (client: LinnworksApiClient, repo: ISkuRepository) =>
        new LinnworksSyncService(client, repo),
      inject: [LinnworksApiClient, SKU_REPOSITORY_TOKEN],
    },
    {
      provide: LinnworksHistoricalSalesIngestionService,
      useFactory: (client: LinnworksApiClient, repo: ISkuRepository) =>
        new LinnworksHistoricalSalesIngestionService(client, repo),
      inject: [LinnworksApiClient, SKU_REPOSITORY_TOKEN],
    },
    SyncSchedulerService,
  ],
})
export class SkuDashboardModule {}

