import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../common/services/prisma.service';
import {
  BrowseSkusQuery,
  BrowseSkusResult,
  DashboardMetricsResult,
  InventoryAlertResult,
  ISkuRepository,
  SyncLogInput,
  UpsertChannelInput,
  UpsertProductInput,
  UpsertSalesMetricInput,
  UpsertStockInput,
} from '../../../ports/outbound/sku-repository.port';
import { SkuMetricsDomainModel } from '../../../domain/models/product.domain';
import { SkuDashboardMapper } from './mappers/sku-dashboard.mapper';

@Injectable()
export class PrismaSkuDashboardRepository implements ISkuRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMetricsBySku(sku: string): Promise<SkuMetricsDomainModel | null> {
    const product = await this.prisma.product.findUnique({
      where: { sku },
      include: {
        stock: {
          orderBy: [{ country: 'asc' }, { locationType: 'asc' }],
        },
        channels: {
          orderBy: [{ channel: 'asc' }, { country: 'asc' }],
        },
        salesMetrics: {
          orderBy: [{ periodEnd: 'desc' }, { channel: 'asc' }],
        },
      },
    });

    return product ? SkuDashboardMapper.toDomain(product) : null;
  }

  async browseSkus(query: BrowseSkusQuery): Promise<BrowseSkusResult> {
    const where: Prisma.ProductWhereInput = {};

    if (query.q) {
      where.OR = [
        { sku: { contains: query.q } },
        { title: { contains: query.q } },
        { brand: { contains: query.q } },
      ];
    }

    if (query.channel && query.channel !== 'ALL') {
      where.channels = { some: { channel: query.channel } };
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        stock: true,
        channels: true,
        salesMetrics: true,
      },
      orderBy: { sku: 'asc' },
      take: 1000,
    });

    const filtered = products.filter((product) => {
      if (!query.stockStatus || query.stockStatus === 'ALL') return true;

      const available = product.stock.reduce(
        (sum, stock) => sum + stock.available,
        0,
      );

      if (query.stockStatus === 'OUT_OF_STOCK') return available === 0;
      if (query.stockStatus === 'LOW_STOCK') {
        return available > 0 && available <= 50;
      }
      return available > 50;
    });

    const cursorIndex = query.cursor
      ? filtered.findIndex((product) => product.sku === query.cursor)
      : -1;
    const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    const page = filtered.slice(startIndex, startIndex + query.limit);
    const nextCursor =
      startIndex + query.limit < filtered.length
        ? page[page.length - 1]?.sku || null
        : null;

    return {
      items: page.map((product) => SkuDashboardMapper.toDomain(product)),
      nextCursor,
      total: filtered.length,
    };
  }

  async getDashboardMetrics(periodDays: number): Promise<DashboardMetricsResult> {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - periodDays);

    const metrics = await this.prisma.productSalesMetric.findMany({
      where: {
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
      },
    });

    const velocityByChannel = new Map<string, number>();
    const revenueByMonth = new Map<string, number>();

    for (const metric of metrics) {
      velocityByChannel.set(
        metric.channel,
        (velocityByChannel.get(metric.channel) || 0) + metric.unitsSold,
      );

      const key = metric.periodEnd.toLocaleString('en-US', {
        month: 'short',
        timeZone: 'UTC',
      });
      revenueByMonth.set(
        key,
        (revenueByMonth.get(key) || 0) + metric.revenue.toNumber(),
      );
    }

    const stockRows = await this.prisma.productStock.findMany();
    const stockByLocation = new Map<string, number>();

    for (const stock of stockRows) {
      const key = `${stock.country} ${stock.locationType}`;
      stockByLocation.set(key, (stockByLocation.get(key) || 0) + stock.available);
    }

    const fills = ['#047857', '#34d399', '#0f172a', '#64748b', '#f59e0b'];

    return {
      salesVelocity: Array.from(velocityByChannel.entries()).map(
        ([channel, units]) => ({
          channel,
          fba: units,
          mfn: 0,
        }),
      ),
      stockDistribution: Array.from(stockByLocation.entries()).map(
        ([name, value], index) => ({
          name,
          value,
          fill: fills[index % fills.length],
        }),
      ),
      revenueTrend: Array.from(revenueByMonth.entries()).map(
        ([month, revenue]) => ({
          month,
          revenue: Math.round(revenue),
        }),
      ),
    };
  }

  async getInventoryAlerts(): Promise<InventoryAlertResult[]> {
    const products = await this.prisma.product.findMany({
      include: {
        stock: true,
        salesMetrics: {
          where: {
            periodEnd: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
      },
      orderBy: { sku: 'asc' },
      take: 250,
    });

    return products
      .flatMap((product): InventoryAlertResult[] => {
        const available = product.stock.reduce(
          (sum, stock) => sum + stock.available,
          0,
        );
        const units30 = product.salesMetrics.reduce(
          (sum, metric) => sum + metric.unitsSold,
          0,
        );

        if (available === 0) {
          return [
            {
              sku: product.sku,
              title: product.title,
              type: 'OUT_OF_STOCK',
              detail: 'No available stock across synced locations.',
              severity: 'HIGH',
            },
          ];
        }

        if (available <= 10) {
          return [
            {
              sku: product.sku,
              title: product.title,
              type: 'CRITICAL_LOW',
              detail: `${available} units available across synced locations.`,
              severity: 'HIGH',
            },
          ];
        }

        if (units30 === 0 && available > 0) {
          return [
            {
              sku: product.sku,
              title: product.title,
              type: 'DEAD_STOCK',
              detail: `${available} units available with no synced sales in 30 days.`,
              severity: 'MEDIUM',
            },
          ];
        }

        return [];
      })
      .slice(0, 10);
  }

  async upsertProducts(products: UpsertProductInput[]): Promise<number> {
    for (const product of products) {
      await this.prisma.product.upsert({
        where: { sku: product.sku },
        create: {
          sku: product.sku,
          title: product.title,
          brand: product.brand,
          status: product.status || 'ACTIVE',
          cost: this.toDecimal(product.cost),
          currency: product.currency || 'USD',
          weight: this.toDecimal(product.weight),
          length: this.toDecimal(product.length),
          width: this.toDecimal(product.width),
          height: this.toDecimal(product.height),
          imageUrl: product.imageUrl,
          productUrl: product.productUrl,
          lastSyncedAt: product.lastSyncedAt,
        },
        update: {
          title: product.title,
          brand: product.brand,
          status: product.status || 'ACTIVE',
          cost: this.toDecimal(product.cost),
          currency: product.currency || 'USD',
          weight: this.toDecimal(product.weight),
          length: this.toDecimal(product.length),
          width: this.toDecimal(product.width),
          height: this.toDecimal(product.height),
          imageUrl: product.imageUrl,
          productUrl: product.productUrl,
          lastSyncedAt: product.lastSyncedAt,
        },
      });
    }

    return products.length;
  }

  async upsertStock(stockRows: UpsertStockInput[]): Promise<number> {
    const products = await this.productIdBySku(stockRows.map((row) => row.sku));

    for (const stock of stockRows) {
      const productId = products.get(stock.sku);
      if (!productId) continue;

      const existing = await this.prisma.productStock.findFirst({
        where: {
          productId,
          country: stock.country,
          locationType: stock.locationType,
          warehouse: stock.warehouse || null,
        },
      });

      const data = {
        quantity: stock.quantity,
        reserved: stock.reserved,
        inbound: stock.inbound,
        available: stock.available,
      };

      if (existing) {
        await this.prisma.productStock.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.prisma.productStock.create({
          data: {
            productId,
            country: stock.country,
            locationType: stock.locationType,
            warehouse: stock.warehouse || null,
            ...data,
          },
        });
      }
    }

    return stockRows.length;
  }

  async upsertChannels(channels: UpsertChannelInput[]): Promise<number> {
    const products = await this.productIdBySku(channels.map((row) => row.sku));

    for (const channel of channels) {
      const productId = products.get(channel.sku);
      if (!productId) continue;

      const existing = await this.prisma.productChannel.findFirst({
        where: {
          productId,
          channel: channel.channel,
          country: channel.country || null,
          asin: channel.asin || null,
          listingId: channel.listingId || null,
        },
      });

      const data = {
        price: this.toDecimal(channel.price),
        currency: channel.currency || 'USD',
        isActive: channel.isActive ?? true,
      };

      if (existing) {
        await this.prisma.productChannel.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.prisma.productChannel.create({
          data: {
            productId,
            channel: channel.channel,
            country: channel.country || null,
            asin: channel.asin || null,
            listingId: channel.listingId || null,
            ...data,
          },
        });
      }
    }

    return channels.length;
  }

  async replaceSalesMetrics(metrics: UpsertSalesMetricInput[]): Promise<number> {
    const products = await this.productIdBySku(metrics.map((metric) => metric.sku));

    for (const metric of metrics) {
      const productId = products.get(metric.sku);
      if (!productId) continue;

      await this.prisma.productSalesMetric.deleteMany({
        where: {
          productId,
          channel: metric.channel,
          country: metric.country || null,
          periodStart: metric.periodStart,
          periodEnd: metric.periodEnd,
        },
      });

      await this.prisma.productSalesMetric.create({
        data: {
          productId,
          channel: metric.channel,
          country: metric.country || null,
          periodStart: metric.periodStart,
          periodEnd: metric.periodEnd,
          unitsSold: metric.unitsSold,
          revenue: this.toDecimal(metric.revenue) || new Prisma.Decimal(0),
          velocity: new Prisma.Decimal(
            metric.unitsSold /
              Math.max(
                1,
                Math.ceil(
                  (metric.periodEnd.getTime() - metric.periodStart.getTime()) /
                    (24 * 60 * 60 * 1000),
                ),
              ),
          ),
          currency: metric.currency || 'USD',
        },
      });
    }

    return metrics.length;
  }

  async createSyncLog(input: SyncLogInput): Promise<string> {
    const log = await this.prisma.skuSyncLog.create({
      data: {
        provider: input.provider,
        status: input.status,
        processedRows: input.processedRows || 0,
        failedRows: input.failedRows || 0,
        errorMessage: input.errorMessage,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });

    return log.id;
  }

  async updateSyncLog(id: string, input: SyncLogInput): Promise<void> {
    await this.prisma.skuSyncLog.update({
      where: { id },
      data: {
        provider: input.provider,
        status: input.status,
        completedAt: new Date(),
        processedRows: input.processedRows || 0,
        failedRows: input.failedRows || 0,
        errorMessage: input.errorMessage,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
  }

  private async productIdBySku(skus: string[]): Promise<Map<string, string>> {
    const uniqueSkus = Array.from(new Set(skus));
    const products = await this.prisma.product.findMany({
      where: { sku: { in: uniqueSkus } },
      select: { sku: true, id: true },
    });

    return new Map(products.map((product) => [product.sku, product.id]));
  }

  async updateProduct(sku: string, data: Partial<UpsertProductInput>): Promise<void> {
    const updateData: Prisma.ProductUpdateInput = {};
    if (data.cost !== undefined) updateData.cost = this.toDecimal(data.cost);
    if (data.weight !== undefined) updateData.weight = this.toDecimal(data.weight);
    if (data.length !== undefined) updateData.length = this.toDecimal(data.length);
    if (data.width !== undefined) updateData.width = this.toDecimal(data.width);
    if (data.height !== undefined) updateData.height = this.toDecimal(data.height);

    if (Object.keys(updateData).length > 0) {
      await this.prisma.product.update({
        where: { sku },
        data: updateData,
      });
    }
  }

  private toDecimal(value?: number | null): Prisma.Decimal | null {
    return value === undefined || value === null ? null : new Prisma.Decimal(value);
  }
}
