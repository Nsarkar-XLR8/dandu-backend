import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../../../common/guards/auth.guard';
import { SkuSearchQueryDto } from '../../../dto/sku-search-query.dto';
import { GetSkuMetricsService } from '../../../application/get-sku-metrics.service';
import { SkuBrowseQueryDto } from '../../../dto/sku-browse-query.dto';
import { BrowseSkusService } from '../../../application/browse-skus.service';
import { DashboardQueryDto } from '../../../dto/dashboard-query.dto';
import { GetDashboardMetricsService } from '../../../application/get-dashboard-metrics.service';
import { GetInventoryAlertsService } from '../../../application/get-inventory-alerts.service';
import { RunLinnworksDailySyncService } from '../../../application/run-linnworks-daily-sync.service';
import { LinnworksSyncQueue } from '../queue/linnworks-sync.queue';
import { UpdateProductService } from '../../../application/update-product.service';
import { UpdateProductDto } from '../../../dto/update-product.dto';
import { Patch, Param } from '@nestjs/common';

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
    private readonly runLinnworksDailySyncService: RunLinnworksDailySyncService,
    private readonly linnworksSyncQueue: LinnworksSyncQueue,
    private readonly updateProductService: UpdateProductService,
  ) {}

  @Get('search')
  @ApiOperation({ summary: 'Search SKU dashboard metrics' })
  @ApiResponse({
    status: 200,
    description: 'SKU metrics retrieved successfully',
  })
  async search(@Query() query: SkuSearchQueryDto) {
    const result = await this.getSkuMetricsService.execute(query.sku);

    return {
      message: 'SKU metrics retrieved successfully',
      data: result,
    };
  }

  @Get('browse')
  @ApiOperation({ summary: 'Browse SKU dashboard metrics' })
  async browse(@Query() query: SkuBrowseQueryDto) {
    const result = await this.browseSkusService.execute(query);

    return {
      message: 'SKU metrics retrieved successfully',
      data: result,
    };
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get SKU dashboard aggregates' })
  async dashboard(@Query() query: DashboardQueryDto) {
    const result = await this.getDashboardMetricsService.execute(query.period);

    return {
      message: 'Dashboard metrics retrieved successfully',
      data: result,
    };
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get inventory alerts' })
  async alerts() {
    const result = await this.getInventoryAlertsService.execute();

    return {
      message: 'Inventory alerts retrieved successfully',
      data: result,
    };
  }

  @Post('sync/linnworks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run Linnworks sync now' })
  async syncLinnworks(@Body('queued') queued?: boolean) {
    if (queued) {
      const jobId = await this.linnworksSyncQueue.enqueueManualSync();

      return {
        message: 'Linnworks sync queued',
        data: { jobId },
      };
    }

    const result = await this.runLinnworksDailySyncService.execute();

    return {
      message: 'Linnworks sync completed',
      data: result,
    };
  }

  @Patch('product/:sku')
  @ApiOperation({ summary: 'Update product metrics (cost, weight, dimensions)' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  async updateProduct(
    @Param('sku') sku: string,
    @Body() dto: UpdateProductDto,
  ) {
    await this.updateProductService.execute(sku, dto);
    return {
      message: 'Product updated successfully',
    };
  }
}
