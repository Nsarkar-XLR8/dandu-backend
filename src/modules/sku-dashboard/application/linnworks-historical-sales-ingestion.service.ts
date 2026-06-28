import { Logger } from '@nestjs/common';
import {
  LinnworksApiClient,
  LinnworksOrderItem,
  LinnworksProcessedOrderSummary,
} from '../adapters/outbound/linnworks/linnworks-api.client';
import { ISkuRepository, IncrementSalesMetricInput } from '../ports/outbound/sku-repository.port';

type ChannelType = 'AMAZON' | 'EBAY' | 'WALMART' | 'SHOPIFY' | 'WEBSITE' | 'OTHER';

export interface HistoricalSalesIngestionOptions {
  fromDate?: Date;
  toDate?: Date;
  historyDays?: number;
  chunkDays?: number;
  resultsPerPage?: number;
}

export interface HistoricalSalesChunkResult {
  fromDate: string;
  toDate: string;
  pagesProcessed: number;
  ordersProcessed: number;
  itemRowsProcessed: number;
}

export interface HistoricalSalesIngestionResult {
  status: 'COMPLETED' | 'FAILED';
  fromDate: string;
  toDate: string;
  chunkDays: number;
  chunksProcessed: number;
  pagesProcessed: number;
  ordersProcessed: number;
  itemRowsProcessed: number;
  metricsUpdated: number;
  skippedItemRows: number;
  failedRows: number;
  clearedMetrics: number;
  chunkResults: HistoricalSalesChunkResult[];
  syncedAt: string;
  durationMs: number;
  errorMessage?: string;
  errorCode?: string;
  failedChunk?: {
    fromDate: string;
    toDate: string;
    pageNumber: number;
  };
  userMessage?: string;
}

interface DateChunk {
  from: Date;
  to: Date;
}

function mapChannelSource(source?: string | null, subSource?: string | null): ChannelType {
  const value = `${source ?? ''} ${subSource ?? ''}`.toUpperCase().trim();
  if (value.includes('AMAZON')) return 'AMAZON';
  if (value.includes('EBAY')) return 'EBAY';
  if (value.includes('WALMART')) return 'WALMART';
  if (value.includes('SHOPIFY')) return 'SHOPIFY';
  if (value.includes('WEB') || value.includes('DANDU') || value.includes('BIGCOMMERCE') || value.includes('DISTINCT')) return 'WEBSITE';
  return 'OTHER';
}

function normalizeCountry(country?: string | null, subSource?: string | null): string | null {
  const raw = (country || subSource || '').trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  const map: Record<string, string> = {
    'UNITED STATES': 'US',
    USA: 'US',
    US: 'US',
    'AMAZON.COM': 'US',
    CANADA: 'CA',
    CA: 'CA',
    'AMAZON.CA': 'CA',
    'UNITED KINGDOM': 'GB',
    UK: 'GB',
    GB: 'GB',
    'AMAZON.CO.UK': 'GB',
  };

  if (map[upper]) return map[upper];
  if (upper.includes('AMAZON.COM')) return 'US';
  if (upper.includes('AMAZON.CA')) return 'CA';
  if (upper.includes('AMAZON.CO.UK')) return 'GB';
  return upper.length === 2 ? upper : upper.slice(0, 2);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function createSafeDateChunks(fromDate: Date, toDate: Date, chunkDays = 90): DateChunk[] {
  if (chunkDays < 1 || chunkDays > 90) {
    throw new Error('chunkDays must be between 1 and 90');
  }

  const chunks: DateChunk[] = [];
  let cursor = startOfUtcDay(fromDate);
  const finalTo = endOfUtcDay(toDate);

  while (cursor <= finalTo) {
    const chunkEnd = new Date(Math.min(addUtcDays(cursor, chunkDays).getTime() - 1, finalTo.getTime()));
    chunks.push({ from: cursor, to: chunkEnd });
    cursor = new Date(chunkEnd.getTime() + 1);
  }

  return chunks;
}

function toUserDate(date: string): string {
  return date.slice(0, 10);
}

function parseLinnworksSearchError(message: string) {
  const match = message.match(/chunk ([^ ]+) to ([^,]+), page (\d+)/);
  const isProcessedOrderValidationError =
    message.includes('Linnworks API error 400') &&
    (message.includes('The request is invalid') ||
      message.includes('End date is required when searching using a date range'));

  return {
    isLinnworksInvalidRequest: isProcessedOrderValidationError,
    failedChunk: match
      ? {
          fromDate: match[1],
          toDate: match[2],
          pageNumber: Number(match[3]),
        }
      : undefined,
  };
}

function extractOrderId(item: LinnworksOrderItem): string | undefined {
  return item.pkOrderID ?? item.fkOrderId ?? item.OrderId;
}

function normalizeOrderId(orderId: string): string {
  return orderId.trim().toLowerCase();
}

function collectMetricInputs(
  order: LinnworksProcessedOrderSummary,
  item: LinnworksOrderItem,
  periodStart: Date,
  periodEnd: Date,
  bucket: Map<string, IncrementSalesMetricInput>,
) {
  const sku = item.SKU || item.ItemNumber;
  if (!sku) return;

  const quantity = Math.max(0, Math.round(Number(item.Quantity ?? 0)));
  if (quantity === 0) return;

  const channelSource = item.ItemSource ?? order.Source ?? 'OTHER';
  const country = normalizeCountry(order.cCountry, order.SubSource);
  const channel = mapChannelSource(channelSource, order.SubSource);
  const currency = 'USD';
  const revenue = Number(item.PricePerUnit ?? 0) * quantity;
  const key = [sku, channel, country ?? '', currency].join('|');
  const existing = bucket.get(key) ?? {
    sku,
    channel,
    country,
    periodStart,
    periodEnd,
    unitsSold: 0,
    revenue: 0,
    currency,
  };

  existing.unitsSold += quantity;
  existing.revenue = Number(existing.revenue ?? 0) + (Number.isFinite(revenue) ? revenue : 0);
  bucket.set(key, existing);
}

export class LinnworksHistoricalSalesIngestionService {
  private readonly logger = new Logger(LinnworksHistoricalSalesIngestionService.name);

  constructor(
    private readonly linnworksClient: LinnworksApiClient,
    private readonly skuRepository: ISkuRepository,
  ) {}

  async ingest(options: HistoricalSalesIngestionOptions = {}): Promise<HistoricalSalesIngestionResult> {
    const startedAt = Date.now();
    const chunkDays = options.chunkDays ?? 90;
    const resultsPerPage = options.resultsPerPage ?? 200;
    const toDate = endOfUtcDay(options.toDate ?? new Date());
    const historyDays = Math.max(1, options.historyDays ?? 365);
    const fromDate = startOfUtcDay(
      options.fromDate ?? addUtcDays(startOfUtcDay(toDate), -(historyDays - 1)),
    );

    let pagesProcessed = 0;
    let ordersProcessed = 0;
    let itemRowsProcessed = 0;
    let metricsUpdated = 0;
    let skippedItemRows = 0;
    let failedRows = 0;
    let clearedMetrics = 0;
    const chunkResults: HistoricalSalesChunkResult[] = [];

    this.logger.log(`Historical Linnworks sales ingestion started: ${fromDate.toISOString()} to ${toDate.toISOString()}`);

    try {
      if (fromDate > toDate) {
        throw new Error('fromDate must be before toDate');
      }

      const chunks = createSafeDateChunks(fromDate, toDate, chunkDays);
      const metricBucket = new Map<string, IncrementSalesMetricInput>();

      for (const chunk of chunks) {
        const chunkResult: HistoricalSalesChunkResult = {
          fromDate: chunk.from.toISOString(),
          toDate: chunk.to.toISOString(),
          pagesProcessed: 0,
          ordersProcessed: 0,
          itemRowsProcessed: 0,
        };

        let pageNumber = 1;
        let totalPages = 1;

        do {
          const page = await this.linnworksClient.searchProcessedOrdersPaged(
            chunk.from,
            chunk.to,
            pageNumber,
            resultsPerPage,
          );

          totalPages = page.totalPages;
          pagesProcessed++;
          chunkResult.pagesProcessed++;

          const orders = page.data;
          const orderById = new Map(orders.map((order) => [normalizeOrderId(order.pkOrderID), order]));
          const orderIds = orders.map((order) => order.pkOrderID);
          ordersProcessed += orderIds.length;
          chunkResult.ordersProcessed += orderIds.length;

          if (orderIds.length > 0) {
            const itemsByOrderId = await this.linnworksClient.getOrderItemsByOrderIds(orderIds);

            for (const [orderId, items] of itemsByOrderId) {
              const order = orderById.get(normalizeOrderId(orderId));
              if (!order) continue;

              for (const item of items) {
                itemRowsProcessed++;
                chunkResult.itemRowsProcessed++;
                collectMetricInputs(order, { ...item, pkOrderID: extractOrderId(item) ?? orderId }, fromDate, toDate, metricBucket);
              }
            }
          }

          pageNumber++;
        } while (pageNumber <= totalPages);

        chunkResults.push(chunkResult);
      }

      const replaceResult = await this.skuRepository.replaceSalesMetricsForPeriod(
        fromDate,
        toDate,
        [...metricBucket.values()],
      );
      clearedMetrics = replaceResult.cleared;
      metricsUpdated = replaceResult.created;
      skippedItemRows = replaceResult.skipped;

      const durationMs = Date.now() - startedAt;
      await this.skuRepository.createSyncLog({
        provider: 'linnworks-historical-sales',
        processedRows: itemRowsProcessed,
        failedRows,
        status: failedRows === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
        durationMs,
        metadata: {
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString(),
          chunkDays,
          resultsPerPage,
          chunksProcessed: chunkResults.length,
          pagesProcessed,
          ordersProcessed,
          itemRowsProcessed,
          metricsUpdated,
          skippedItemRows,
          clearedMetrics,
        },
      });

      return {
        status: 'COMPLETED',
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        chunkDays,
        chunksProcessed: chunkResults.length,
        pagesProcessed,
        ordersProcessed,
        itemRowsProcessed,
        metricsUpdated,
        skippedItemRows,
        failedRows,
        clearedMetrics,
        chunkResults,
        syncedAt: new Date().toISOString(),
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      const parsedError = parseLinnworksSearchError(message);
      const userMessage = parsedError.failedChunk
        ? `Linnworks rejected the processed-orders search for ${toUserDate(parsedError.failedChunk.fromDate)} to ${toUserDate(parsedError.failedChunk.toDate)}. No sales data was imported.`
        : 'Historical sales import could not be completed. No sales data was imported.';
      const errorCode = parsedError.isLinnworksInvalidRequest
        ? 'LINNWORKS_PROCESSED_ORDER_SEARCH_INVALID'
        : 'HISTORICAL_SALES_IMPORT_FAILED';

      this.logger.error(`Historical Linnworks sales ingestion failed: ${message}`);
      await this.skuRepository.createSyncLog({
        provider: 'linnworks-historical-sales',
        processedRows: itemRowsProcessed,
        failedRows: failedRows + 1,
        status: 'FAILED',
        errorMessage: message,
        durationMs,
        metadata: {
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString(),
          chunkDays,
          resultsPerPage,
          pagesProcessed,
          ordersProcessed,
          itemRowsProcessed,
          metricsUpdated,
          skippedItemRows,
          clearedMetrics,
          errorCode,
          failedChunk: parsedError.failedChunk,
        },
      }).catch(() => {});

      return {
        status: 'FAILED',
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        chunkDays,
        chunksProcessed: chunkResults.length,
        pagesProcessed,
        ordersProcessed,
        itemRowsProcessed,
        metricsUpdated,
        skippedItemRows,
        failedRows: failedRows + 1,
        clearedMetrics,
        chunkResults,
        syncedAt: new Date().toISOString(),
        durationMs,
        errorMessage: message,
        errorCode,
        failedChunk: parsedError.failedChunk,
        userMessage,
      };
    }
  }
}
