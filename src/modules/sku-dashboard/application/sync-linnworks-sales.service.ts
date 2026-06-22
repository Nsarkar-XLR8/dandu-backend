import { SalesChannelType } from '../domain/models/product.domain';
import {
  ILinnworksClient,
  LinnworksOrderItem,
  LinnworksProcessedOrder,
} from '../ports/outbound/linnworks-client.port';
import {
  ISkuRepository,
  UpsertSalesMetricInput,
} from '../ports/outbound/sku-repository.port';

export interface SalesSyncResult {
  orders: number;
  orderItems: number;
  metrics: number;
}

interface OrderContext {
  processedAt: Date;
  channel: SalesChannelType;
  country: string | null;
  currency: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOWS = [7, 30, 90, 365] as const;

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export class SyncLinnworksSalesService {
  constructor(
    private readonly linnworksClient: ILinnworksClient,
    private readonly skuRepository: ISkuRepository,
  ) {}

  async execute(days = 365): Promise<SalesSyncResult> {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - days * MS_PER_DAY);
    const orders = await this.fetchOrders(periodStart, periodEnd);
    const contexts = this.toOrderContexts(orders);
    const orderIds = Array.from(contexts.keys());
    const orderItems: LinnworksOrderItem[] = [];

    for (const idBatch of chunk(orderIds, 50)) {
      const items = await this.linnworksClient.getOrderItemsByOrderIds(idBatch);
      if (Array.isArray(items)) orderItems.push(...items);
    }

    const metrics = this.aggregateMetrics(orderItems, contexts, periodEnd);
    const metricCount = await this.skuRepository.replaceSalesMetrics(metrics);

    return {
      orders: orders.length,
      orderItems: orderItems.length,
      metrics: metricCount,
    };
  }

  private async fetchOrders(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<LinnworksProcessedOrder[]> {
    const orders: LinnworksProcessedOrder[] = [];

    for (
      let from = new Date(periodStart);
      from < periodEnd;
      from = new Date(Math.min(periodEnd.getTime(), from.getTime() + 90 * MS_PER_DAY))
    ) {
      const to = new Date(
        Math.min(periodEnd.getTime(), from.getTime() + 90 * MS_PER_DAY - 1),
      );

      for (let pageNum = 1; pageNum <= 1000; pageNum += 1) {
        const page = await this.linnworksClient.searchProcessedOrdersPaged({
          from,
          to,
          pageNum,
        });
        const data = Array.isArray(page.Data) ? page.Data : [];
        orders.push(...data);

        if (page.TotalPages ? pageNum >= page.TotalPages : data.length === 0) {
          break;
        }
      }
    }

    return orders;
  }

  private toOrderContexts(
    orders: LinnworksProcessedOrder[],
  ): Map<string, OrderContext> {
    const contexts = new Map<string, OrderContext>();

    for (const order of orders) {
      if (!order.pkOrderID) continue;

      contexts.set(order.pkOrderID, {
        processedAt: new Date(
          order.dProcessedOn || order.dReceivedDate || new Date().toISOString(),
        ),
        channel: this.toSalesChannel(order.Source),
        country: order.cCountry || null,
        currency: order.cCurrency || 'USD',
      });
    }

    return contexts;
  }

  private aggregateMetrics(
    orderItems: LinnworksOrderItem[],
    contexts: Map<string, OrderContext>,
    periodEnd: Date,
  ): UpsertSalesMetricInput[] {
    const buckets = new Map<string, UpsertSalesMetricInput>();

    for (const item of orderItems) {
      const orderId = item.fkOrderID || item.OrderId;
      const context = orderId ? contexts.get(orderId) : null;
      const sku = item.SKU || item.ItemNumber;
      if (!context || !sku) continue;

      const quantity = item.Quantity ?? item.nQty ?? 0;
      const revenue =
        item.LineTotal ?? (item.PricePerUnit ?? item.Cost ?? 0) * quantity;

      for (const days of WINDOWS) {
        const windowStart = new Date(periodEnd.getTime() - days * MS_PER_DAY);
        if (context.processedAt < windowStart) continue;

        const key = [
          sku,
          context.channel,
          context.country || '',
          days,
        ].join(':');
        const existing = buckets.get(key);

        if (existing) {
          existing.unitsSold += quantity;
          existing.revenue += revenue;
          continue;
        }

        buckets.set(key, {
          sku,
          channel: context.channel,
          country: context.country,
          periodStart: windowStart,
          periodEnd,
          unitsSold: quantity,
          revenue,
          currency: context.currency,
        });
      }
    }

    return Array.from(buckets.values());
  }

  private toSalesChannel(value?: string | null): SalesChannelType {
    const normalized = (value || '').toUpperCase();
    if (normalized.includes('AMAZON')) return 'AMAZON';
    if (normalized.includes('EBAY')) return 'EBAY';
    if (normalized.includes('WALMART')) return 'WALMART';
    if (normalized.includes('SHOPIFY')) return 'SHOPIFY';
    if (normalized.includes('DANDU') || normalized.includes('DISTINCT')) {
      return 'WEBSITE';
    }
    return 'OTHER';
  }
}

