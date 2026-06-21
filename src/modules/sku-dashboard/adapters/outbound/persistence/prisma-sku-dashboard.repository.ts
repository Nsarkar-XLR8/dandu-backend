import { Injectable } from '@nestjs/common';
import { Prisma, SalesChannelType, StockLocationType } from '@prisma/client';
import { PrismaService } from '../../../../../common/services/prisma.service';
import {
  ISkuRepository,
  UpsertProductInput,
  UpsertStockInput,
  UpsertChannelInput,
  CreateImportBatchInput,
  UpdateImportBatchInput,
  ImportRowErrorInput,
  SkuBrowseFilters,
  SkuBrowsePage,
  CreateSyncLogInput,
  DashboardMetricsOutput,
  InventoryAlertOutput,
} from '../../../ports/outbound/sku-repository.port';
import { SkuMetricsDomainModel } from '../../../domain/models/product.domain';
import { SkuDashboardMapper } from './mappers/sku-dashboard.mapper';

// Colour palette for stock-distribution pie chart
const LOCATION_COLOURS: Record<string, string> = {
  'US-FBA': '#047857',
  'CA-FBA': '#34d399',
  'UK-FBA': '#064e3b',
  'US-MFN': '#0f172a',
  'CA-MFN': '#1e293b',
  'UK-MFN': '#334155',
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Low-stock threshold
const LOW_STOCK_THRESHOLD = 50;

function locationColour(country: string, locationType: string): string {
  const key = `${country}-${locationType}`;
  return LOCATION_COLOURS[key] ?? '#64748b';
}

@Injectable()
export class PrismaSkuDashboardRepository implements ISkuRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Single SKU lookup
  // ---------------------------------------------------------------------------

  async findMetricsBySku(sku: string): Promise<SkuMetricsDomainModel | null> {
    const product = await this.prisma.product.findUnique({
      where: { sku },
      include: {
        stock: { orderBy: [{ country: 'asc' }, { locationType: 'asc' }] },
        channels: { orderBy: [{ channel: 'asc' }, { country: 'asc' }] },
        salesMetrics: { orderBy: [{ periodEnd: 'desc' }, { channel: 'asc' }] },
      },
    });

    return product ? SkuDashboardMapper.toDomain(product) : null;
  }

  // ---------------------------------------------------------------------------
  // Browse (cursor paginated)
  // ---------------------------------------------------------------------------

  async browseSkus(filters: SkuBrowseFilters): Promise<SkuBrowsePage> {
    const limit = Math.min(filters.limit ?? 20, 100);
    const { q, stockStatus, channel, cursor } = filters;

    // Base where clause
    const where: Prisma.ProductWhereInput = {};

    // Full-text search on SKU / title
    if (q && q.trim()) {
      where.OR = [
        { sku: { contains: q.trim() } },
        { title: { contains: q.trim() } },
      ];
    }

    // Channel filter
    if (channel && channel !== 'ALL') {
      where.channels = {
        some: { channel: channel as SalesChannelType, isActive: true },
      };
    }

    // Total count (without stock filter — we'll post-filter for stock status)
    const total = await this.prisma.product.count({ where });

    // Fetch page (over-fetch slightly when filtering by stock)
    const take = stockStatus && stockStatus !== 'ALL' ? limit * 3 : limit;

    const products = await this.prisma.product.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { sku: 'asc' },
      include: {
        stock: { orderBy: [{ country: 'asc' }, { locationType: 'asc' }] },
        channels: { orderBy: [{ channel: 'asc' }, { country: 'asc' }] },
        salesMetrics: { orderBy: [{ periodEnd: 'desc' }, { channel: 'asc' }] },
      },
    });

    // Map to domain models
    let items = products.map((p) => SkuDashboardMapper.toDomain(p));

    // Apply stock status filter in memory (requires aggregation across locations)
    if (stockStatus && stockStatus !== 'ALL') {
      items = items.filter((item) => {
        const totalAvailable = item.stock.reduce((sum, s) => sum + (s.available ?? 0), 0);
        switch (stockStatus) {
          case 'IN_STOCK':    return totalAvailable > LOW_STOCK_THRESHOLD;
          case 'LOW_STOCK':   return totalAvailable > 0 && totalAvailable <= LOW_STOCK_THRESHOLD;
          case 'OUT_OF_STOCK': return totalAvailable === 0;
          default: return true;
        }
      });
    }

    // Determine next cursor
    let nextCursor: string | null = null;
    if (items.length > limit) {
      const nextItem = items[limit];
      // Find the raw product id for this sku
      const raw = products.find((p) => p.sku === nextItem.sku);
      nextCursor = raw?.id ?? null;
      items = items.slice(0, limit);
    }

    return { items, nextCursor, total };
  }

  // ---------------------------------------------------------------------------
  // Upserts
  // ---------------------------------------------------------------------------

  async upsertProduct(input: UpsertProductInput): Promise<{ id: string }> {
    const product = await this.prisma.product.upsert({
      where: { sku: input.sku },
      update: {
        title: input.title,
        brand: input.brand ?? undefined,
        cost: input.cost != null ? new Prisma.Decimal(input.cost) : undefined,
        currency: input.currency ?? undefined,
        weight: input.weight != null ? new Prisma.Decimal(input.weight) : undefined,
        length: input.length != null ? new Prisma.Decimal(input.length) : undefined,
        width: input.width != null ? new Prisma.Decimal(input.width) : undefined,
        height: input.height != null ? new Prisma.Decimal(input.height) : undefined,
        imageUrl: input.imageUrl ?? undefined,
        productUrl: input.productUrl ?? undefined,
        lastSyncedAt: new Date(),
      },
      create: {
        sku: input.sku,
        title: input.title,
        brand: input.brand,
        cost: input.cost != null ? new Prisma.Decimal(input.cost) : undefined,
        currency: input.currency ?? 'GBP',
        weight: input.weight != null ? new Prisma.Decimal(input.weight) : undefined,
        length: input.length != null ? new Prisma.Decimal(input.length) : undefined,
        width: input.width != null ? new Prisma.Decimal(input.width) : undefined,
        height: input.height != null ? new Prisma.Decimal(input.height) : undefined,
        imageUrl: input.imageUrl,
        productUrl: input.productUrl,
        lastSyncedAt: new Date(),
      },
      select: { id: true },
    });
    return { id: product.id };
  }

  async upsertStock(input: UpsertStockInput): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { sku: input.sku },
      select: { id: true },
    });
    if (!product) return;

    await this.prisma.productStock.upsert({
      where: {
        productId_country_locationType_warehouse: {
          productId: product.id,
          country: input.country,
          locationType: input.locationType as StockLocationType,
          warehouse: input.warehouse ?? '',
        },
      },
      update: {
        quantity: input.quantity ?? 0,
        reserved: input.reserved ?? 0,
        inbound: input.inbound ?? 0,
        available: input.available,
      },
      create: {
        productId: product.id,
        country: input.country,
        locationType: input.locationType as StockLocationType,
        warehouse: input.warehouse,
        quantity: input.quantity ?? 0,
        reserved: input.reserved ?? 0,
        inbound: input.inbound ?? 0,
        available: input.available,
      },
    });
  }

  async upsertChannel(input: UpsertChannelInput): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { sku: input.sku },
      select: { id: true },
    });
    if (!product) return;

    await this.prisma.productChannel.upsert({
      where: {
        productId_channel_country_asin_listingId: {
          productId: product.id,
          channel: input.channel as SalesChannelType,
          country: (input.country ?? null) as string,
          asin: (input.asin ?? null) as string,
          listingId: (input.listingId ?? null) as string,
        },
      },
      update: {
        price: input.price != null ? new Prisma.Decimal(input.price) : undefined,
        currency: input.currency,
        isActive: input.isActive ?? true,
      },
      create: {
        productId: product.id,
        channel: input.channel as SalesChannelType,
        country: input.country,
        asin: input.asin,
        listingId: input.listingId,
        price: input.price != null ? new Prisma.Decimal(input.price) : undefined,
        currency: input.currency ?? 'GBP',
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateProduct(sku: string, fields: Partial<UpsertProductInput>): Promise<void> {
    const data: Prisma.ProductUpdateInput = {};
    if (fields.title !== undefined) data.title = fields.title;
    if (fields.brand !== undefined) data.brand = fields.brand;
    if (fields.cost !== undefined) data.cost = fields.cost != null ? new Prisma.Decimal(fields.cost) : null;
    if (fields.currency !== undefined) data.currency = fields.currency;
    if (fields.weight !== undefined) data.weight = fields.weight != null ? new Prisma.Decimal(fields.weight) : null;
    if (fields.length !== undefined) data.length = fields.length != null ? new Prisma.Decimal(fields.length) : null;
    if (fields.width !== undefined) data.width = fields.width != null ? new Prisma.Decimal(fields.width) : null;
    if (fields.height !== undefined) data.height = fields.height != null ? new Prisma.Decimal(fields.height) : null;
    if (fields.imageUrl !== undefined) data.imageUrl = fields.imageUrl;
    if (fields.productUrl !== undefined) data.productUrl = fields.productUrl;

    await this.prisma.product.update({ where: { sku }, data });
  }

  // ---------------------------------------------------------------------------
  // Import batch tracking
  // ---------------------------------------------------------------------------

  async createImportBatch(input: CreateImportBatchInput): Promise<{ id: string }> {
    const batch = await this.prisma.skuImportBatch.create({
      data: {
        fileName: input.fileName,
        uploadedBy: input.uploadedBy,
        totalRows: input.totalRows,
        status: 'PENDING',
      },
      select: { id: true },
    });
    return { id: batch.id };
  }

  async updateImportBatch(batchId: string, input: UpdateImportBatchInput): Promise<void> {
    await this.prisma.skuImportBatch.update({
      where: { id: batchId },
      data: {
        status: input.status,
        importedRows: input.importedRows,
        failedRows: input.failedRows,
        completedAt: new Date(),
        errorMessage: input.errorMessage,
      },
    });
  }

  async saveRowErrors(errors: ImportRowErrorInput[]): Promise<void> {
    if (errors.length === 0) return;
    await this.prisma.skuImportRowError.createMany({
      data: errors.map((e) => ({
        batchId: e.batchId,
        rowNumber: e.rowNumber,
        sku: e.sku,
        reason: e.reason,
        rawRow: e.rawRow ? (e.rawRow as Prisma.InputJsonValue) : Prisma.JsonNull,
      })),
      skipDuplicates: true,
    });
  }

  // ---------------------------------------------------------------------------
  // Sync log
  // ---------------------------------------------------------------------------

  async createSyncLog(input: CreateSyncLogInput): Promise<void> {
    await this.prisma.skuSyncLog.create({
      data: {
        provider: input.provider,
        status: input.status,
        processedRows: input.processedRows,
        failedRows: input.failedRows,
        completedAt: new Date(),
        errorMessage: input.errorMessage,
        metadata: input.metadata
          ? (input.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Dashboard metrics
  // ---------------------------------------------------------------------------

  async getDashboardMetrics(periodDays: number): Promise<DashboardMetricsOutput> {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    // 1. Sales velocity per channel
    const salesAgg = await this.prisma.productSalesMetric.groupBy({
      by: ['channel'],
      where: { periodStart: { gte: since } },
      _sum: { unitsSold: true, revenue: true },
    });

    const salesVelocity = salesAgg.map((row) => ({
      channel: row.channel as string,
      fba: row.channel === 'AMAZON' ? (row._sum.unitsSold ?? 0) : 0,
      mfn: row.channel !== 'AMAZON' ? (row._sum.unitsSold ?? 0) : 0,
    }));

    // 2. Stock distribution per location
    const stockAgg = await this.prisma.productStock.groupBy({
      by: ['country', 'locationType'],
      _sum: { available: true },
    });

    const stockDistribution = stockAgg
      .filter((row) => (row._sum.available ?? 0) > 0)
      .map((row) => ({
        name: `${row.country} ${row.locationType}`,
        value: row._sum.available ?? 0,
        fill: locationColour(row.country, row.locationType),
      }));

    // 3. Revenue trend — last 6 calendar months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const revenueRows = await this.prisma.productSalesMetric.findMany({
      where: { periodStart: { gte: sixMonthsAgo } },
      select: { periodStart: true, revenue: true },
    });

    const revenueByMonth: Record<string, number> = {};
    for (const row of revenueRows) {
      const key = `${row.periodStart.getFullYear()}-${row.periodStart.getMonth()}`;
      revenueByMonth[key] = (revenueByMonth[key] ?? 0) + row.revenue.toNumber();
    }

    const revenueTrend = Object.entries(revenueByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, revenue]) => {
        const [, monthStr] = key.split('-');
        return { month: MONTH_NAMES[parseInt(monthStr, 10)] ?? key, revenue: Math.round(revenue) };
      });

    return { salesVelocity, stockDistribution, revenueTrend };
  }

  // ---------------------------------------------------------------------------
  // Inventory alerts
  // ---------------------------------------------------------------------------

  async getInventoryAlerts(): Promise<InventoryAlertOutput[]> {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE' },
      include: {
        stock: true,
        salesMetrics: {
          orderBy: { periodEnd: 'desc' },
          take: 5,
        },
      },
    });

    const alerts: InventoryAlertOutput[] = [];

    for (const product of products) {
      const totalAvailable = product.stock.reduce((sum, s) => sum + s.available, 0);
      const recentUnits = product.salesMetrics.reduce((sum, m) => sum + m.unitsSold, 0);

      if (totalAvailable === 0) {
        alerts.push({
          sku: product.sku,
          title: product.title,
          type: 'OUT_OF_STOCK',
          detail: 'No stock available across all locations',
          severity: 'HIGH',
        });
      } else if (totalAvailable <= LOW_STOCK_THRESHOLD) {
        alerts.push({
          sku: product.sku,
          title: product.title,
          type: 'CRITICAL_LOW',
          detail: `Only ${totalAvailable} units available`,
          severity: totalAvailable <= 10 ? 'HIGH' : 'MEDIUM',
        });
      } else if (recentUnits === 0 && totalAvailable > 200) {
        // Dead stock: no sales but lots of stock
        alerts.push({
          sku: product.sku,
          title: product.title,
          type: 'DEAD_STOCK',
          detail: `${totalAvailable} units in stock with no recent sales`,
          severity: 'LOW',
        });
      }
    }

    // Sort: HIGH first, then MEDIUM, then LOW
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return alerts.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 50);
  }
}
