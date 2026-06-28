
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../../../common/guards/auth.guard';
import { SkuSearchQueryDto } from '../../../dto/sku-search-query.dto';
import { HistoricalSalesIngestionDto } from '../../../dto/historical-sales-ingestion.dto';
import { GetSkuMetricsService } from '../../../application/get-sku-metrics.service';
import { BrowseSkusService } from '../../../application/browse-skus.service';
import { GetDashboardMetricsService } from '../../../application/get-dashboard-metrics.service';
import { GetInventoryAlertsService } from '../../../application/get-inventory-alerts.service';
import { LinnworksSyncService } from '../../../application/linnworks-sync.service';
import { LinnworksInventoryRefreshService } from '../../../application/linnworks-inventory-refresh.service';
import { LinnworksHistoricalSalesIngestionService } from '../../../application/linnworks-historical-sales-ingestion.service';
import { UpdateProductService } from '../../../application/update-product.service';

@ApiTags('SKU Dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('sku-dashboard')
export class SkuDashboardController {
  constructor(
    private readonly getSkuMetricsService: GetSkuMetricsService,
    private readonly browseSkusService: BrowseSkusService,
    private readonly getDashboardMetricsService: GetDashboardMetricsService,
    private readonly getInventoryAlertsService: GetInventoryAlertsService,
    private readonly linnworksSyncService: LinnworksSyncService,
    private readonly linnworksInventoryRefreshService: LinnworksInventoryRefreshService,
    private readonly linnworksHistoricalSalesIngestionService: LinnworksHistoricalSalesIngestionService,
    private readonly updateProductService: UpdateProductService,
  ) {}

  // -------------------------------------------------------------------------
  // GET /sku-dashboard/search?sku=
  // -------------------------------------------------------------------------
  @Get('search')
  @ApiOperation({ summary: 'Get full SKU metrics by exact SKU' })
  @ApiResponse({ status: 200, description: 'SKU metrics retrieved successfully' })
  async search(@Query() query: SkuSearchQueryDto) {
    const result = await this.getSkuMetricsService.execute(query.sku);
    return { message: 'SKU metrics retrieved successfully', data: result };
  }

  // -------------------------------------------------------------------------
  // GET /sku-dashboard/browse
  // -------------------------------------------------------------------------
  @Get('browse')
  @ApiOperation({ summary: 'Paginated SKU catalog browse with filters' })
  @ApiQuery({ name: 'q',           required: false, description: 'Full-text search on SKU / Title' })
  @ApiQuery({ name: 'stockStatus', required: false, enum: ['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] })
  @ApiQuery({ name: 'channel',     required: false, enum: ['ALL', 'AMAZON', 'EBAY', 'WALMART', 'SHOPIFY', 'WEBSITE', 'OTHER'] })
  @ApiQuery({ name: 'cursor',      required: false, description: 'Pagination cursor (product ID)' })
  @ApiQuery({ name: 'limit',       required: false, description: 'Page size (default 20, max 100)' })
  @ApiResponse({ status: 200, description: 'Paginated SKU list' })
  async browse(
    @Query('q')           q?: string,
    @Query('stockStatus') stockStatus?: string,
    @Query('channel')     channel?: string,
    @Query('cursor')      cursor?: string,
    @Query('limit')       limit?: string,
  ) {
    const result = await this.browseSkusService.execute({
      q,
      stockStatus: stockStatus as any,
      channel:     channel as any,
      cursor,
      limit:       limit ? parseInt(limit, 10) : undefined,
    });
    return { message: 'SKU catalog retrieved', data: result };
  }

  // -------------------------------------------------------------------------
  // GET /sku-dashboard/dashboard?period=30D
  // -------------------------------------------------------------------------
  @Get('dashboard')
  @ApiOperation({ summary: 'Get aggregated dashboard metrics (charts, KPIs)' })
  @ApiQuery({ name: 'period', required: false, enum: ['7D', '30D', '90D', '365D'] })
  @ApiResponse({ status: 200, description: 'Dashboard metrics' })
  async dashboard(@Query('period') period?: string) {
    const result = await this.getDashboardMetricsService.execute(period ?? '30D');
    return { message: 'Dashboard metrics retrieved', data: result };
  }

  // -------------------------------------------------------------------------
  // GET /sku-dashboard/alerts
  // -------------------------------------------------------------------------
  @Get('alerts')
  @ApiOperation({ summary: 'Get inventory alerts (out-of-stock, low-stock, dead stock)' })
  @ApiResponse({ status: 200, description: 'Inventory alerts list' })
  async alerts() {
    const result = await this.getInventoryAlertsService.execute();
    return { message: 'Inventory alerts retrieved', data: result };
  }

  // -------------------------------------------------------------------------
  // POST /sku-dashboard/sync/linnworks
  // -------------------------------------------------------------------------
  @Post('sync/linnworks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger a full Linnworks API sync (products, stock, listings)' })
  @ApiResponse({ status: 200, description: 'Sync result' })
  async syncLinnworks() {
    const result = await this.linnworksSyncService.sync();
    return {
      message: result.status === 'COMPLETED' ? 'Linnworks sync complete' : 'Linnworks sync failed',
      data: result,
    };
  }

  // -------------------------------------------------------------------------
  // POST /sku-dashboard/refresh-inventory
  // -------------------------------------------------------------------------
  @Post('refresh-inventory')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh Linnworks inventory and hard-delete local SKUs no longer in Linnworks' })
  @ApiResponse({ status: 200, description: 'Inventory refresh result' })
  async refreshInventory() {
    const result = await this.linnworksInventoryRefreshService.refreshInventory();
    return {
      message: result.status === 'COMPLETED'
        ? 'Inventory refresh complete'
        : 'Inventory refresh failed',
      data: result,
    };
  }

  // -------------------------------------------------------------------------
  // POST /sku-dashboard/sync/linnworks/historical-sales
  // -------------------------------------------------------------------------
  @Post('sync/linnworks/historical-sales')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import historical Linnworks processed order items using 90-day chunks' })
  @ApiResponse({ status: 200, description: 'Historical sales ingestion result' })
  async syncHistoricalSales(@Body() body: HistoricalSalesIngestionDto) {
    const result = await this.linnworksHistoricalSalesIngestionService.ingest({
      fromDate: body.fromDate ? new Date(body.fromDate) : undefined,
      toDate: body.toDate ? new Date(body.toDate) : undefined,
      historyDays: body.historyDays,
      chunkDays: body.chunkDays,
    });

    return {
      message: result.status === 'COMPLETED'
        ? 'Historical Linnworks sales import complete'
        : 'Historical Linnworks sales import failed',
      data: result,
    };
  }

  // -------------------------------------------------------------------------
  // PATCH /sku-dashboard/product/:sku
  // -------------------------------------------------------------------------
  @Patch('product/:sku')
  @ApiOperation({ summary: 'Update mutable product fields (title, cost, brand, etc.)' })
  @ApiResponse({ status: 200, description: 'Product updated' })
  async updateProduct(
    @Param('sku') sku: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.updateProductService.execute(decodeURIComponent(sku), body as any);
    return { message: 'Product updated successfully' };
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../../../common/guards/auth.guard';
import { SkuSearchQueryDto } from '../../../dto/sku-search-query.dto';
import { HistoricalSalesIngestionDto } from '../../../dto/historical-sales-ingestion.dto';
import { GetSkuMetricsService } from '../../../application/get-sku-metrics.service';
import { BrowseSkusService } from '../../../application/browse-skus.service';
import { GetDashboardMetricsService } from '../../../application/get-dashboard-metrics.service';
import { GetInventoryAlertsService } from '../../../application/get-inventory-alerts.service';
import { LinnworksSyncService } from '../../../application/linnworks-sync.service';
import { LinnworksHistoricalSalesIngestionService } from '../../../application/linnworks-historical-sales-ingestion.service';
import { UpdateProductService } from '../../../application/update-product.service';

@ApiTags('SKU Dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('sku-dashboard')
export class SkuDashboardController {
  constructor(
    private readonly getSkuMetricsService: GetSkuMetricsService,
    private readonly browseSkusService: BrowseSkusService,
    private readonly getDashboardMetricsService: GetDashboardMetricsService,
    private readonly getInventoryAlertsService: GetInventoryAlertsService,
    private readonly linnworksSyncService: LinnworksSyncService,
    private readonly linnworksHistoricalSalesIngestionService: LinnworksHistoricalSalesIngestionService,
    private readonly updateProductService: UpdateProductService,
  ) {}

  // -------------------------------------------------------------------------
  // GET /sku-dashboard/search?sku=
  // -------------------------------------------------------------------------
  @Get('search')
  @ApiOperation({ summary: 'Get full SKU metrics by exact SKU' })
  @ApiResponse({ status: 200, description: 'SKU metrics retrieved successfully' })
  async search(@Query() query: SkuSearchQueryDto) {
    const result = await this.getSkuMetricsService.execute(query.sku);
    return { message: 'SKU metrics retrieved successfully', data: result };
  }

  // -------------------------------------------------------------------------
  // GET /sku-dashboard/browse
  // -------------------------------------------------------------------------
  @Get('browse')
  @ApiOperation({ summary: 'Paginated SKU catalog browse with filters' })
  @ApiQuery({ name: 'q',           required: false, description: 'Full-text search on SKU / Title' })
  @ApiQuery({ name: 'stockStatus', required: false, enum: ['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] })
  @ApiQuery({ name: 'channel',     required: false, enum: ['ALL', 'AMAZON', 'EBAY', 'WALMART', 'SHOPIFY', 'WEBSITE', 'OTHER'] })
  @ApiQuery({ name: 'cursor',      required: false, description: 'Pagination cursor (product ID)' })
  @ApiQuery({ name: 'limit',       required: false, description: 'Page size (default 20, max 100)' })
  @ApiResponse({ status: 200, description: 'Paginated SKU list' })
  async browse(
    @Query('q')           q?: string,
    @Query('stockStatus') stockStatus?: string,
    @Query('channel')     channel?: string,
    @Query('cursor')      cursor?: string,
    @Query('limit')       limit?: string,
  ) {
    const result = await this.browseSkusService.execute({
      q,
      stockStatus: stockStatus as any,
      channel:     channel as any,
      cursor,
      limit:       limit ? parseInt(limit, 10) : undefined,
    });
    return { message: 'SKU catalog retrieved', data: result };
  }

  // -------------------------------------------------------------------------
  // GET /sku-dashboard/dashboard?period=30D
  // -------------------------------------------------------------------------
  @Get('dashboard')
  @ApiOperation({ summary: 'Get aggregated dashboard metrics (charts, KPIs)' })
  @ApiQuery({ name: 'period', required: false, enum: ['7D', '30D', '90D', '365D'] })
  @ApiResponse({ status: 200, description: 'Dashboard metrics' })
  async dashboard(@Query('period') period?: string) {
    const result = await this.getDashboardMetricsService.execute(period ?? '30D');
    return { message: 'Dashboard metrics retrieved', data: result };
  }

  // -------------------------------------------------------------------------
  // GET /sku-dashboard/alerts
  // -------------------------------------------------------------------------
  @Get('alerts')
  @ApiOperation({ summary: 'Get inventory alerts (out-of-stock, low-stock, dead stock)' })
  @ApiResponse({ status: 200, description: 'Inventory alerts list' })
  async alerts() {
    const result = await this.getInventoryAlertsService.execute();
    return { message: 'Inventory alerts retrieved', data: result };
  }

  // -------------------------------------------------------------------------
  // POST /sku-dashboard/sync/linnworks
  // -------------------------------------------------------------------------
  @Post('sync/linnworks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger a full Linnworks API sync (products, stock, listings)' })
  @ApiResponse({ status: 200, description: 'Sync result' })
  async syncLinnworks() {
    const result = await this.linnworksSyncService.sync();
    return {
      message: result.status === 'COMPLETED' ? 'Linnworks sync complete' : 'Linnworks sync failed',
      data: result,
    };
  }

  // -------------------------------------------------------------------------
  // POST /sku-dashboard/sync/linnworks/historical-sales
  // -------------------------------------------------------------------------
  @Post('sync/linnworks/historical-sales')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import historical Linnworks processed order items using 90-day chunks' })
  @ApiResponse({ status: 200, description: 'Historical sales ingestion result' })
  async syncHistoricalSales(@Body() body: HistoricalSalesIngestionDto) {
    const result = await this.linnworksHistoricalSalesIngestionService.ingest({
      fromDate: body.fromDate ? new Date(body.fromDate) : undefined,
      toDate: body.toDate ? new Date(body.toDate) : undefined,
      historyDays: body.historyDays,
      chunkDays: body.chunkDays,
    });

    return {
      message: result.status === 'COMPLETED'
        ? 'Historical Linnworks sales import complete'
        : 'Historical Linnworks sales import failed',
      data: result,
    };
  }

  // -------------------------------------------------------------------------
  // PATCH /sku-dashboard/product/:sku
  // -------------------------------------------------------------------------
  @Patch('product/:sku')
  @ApiOperation({ summary: 'Update mutable product fields (title, cost, brand, etc.)' })
  @ApiResponse({ status: 200, description: 'Product updated' })
  async updateProduct(
    @Param('sku') sku: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.updateProductService.execute(decodeURIComponent(sku), body as any);
    return { message: 'Product updated successfully' };
  }
}

