import { Injectable, Logger } from '@nestjs/common';
import { LinnworksConfig } from './linnworks.config';

/**
 * Represents the Linnworks session token response from the auth endpoint.
 */
interface LinnworksSessionTokenResponse {
  Token: string;
  Server: string;
  /** Token lifetime in seconds. Linnworks commonly returns 1800. */
  TTL?: number;
  /** Expiry as ISO date string. Linnworks tokens expire after ~30 minutes. */
  Expires?: string;
}

/**
 * A single inventory item from Linnworks /api/Stock/GetStockItemsFull
 */
export interface LinnworksStockItem {
  StockItemId: string;
  ItemNumber: string; // SKU
  ItemTitle: string;
  BarcodeNumber?: string;
  CategoryName?: string;
  Weight?: number;
  Width?: number;
  Depth?: number;
  Height?: number;
  RetailPrice?: number;
  PurchasePrice?: number;
  StockLevels?: LinnworksStockLevel[];
  ItemChannelPrices?: LinnworksStockItemPrice[];
  ItemExtendedProperties?: Array<{ ProperyName?: string; PropertyName?: string; PropertyValue: string; ProperyType?: string; PropertyType?: string }>;
  Images?: Array<{ Source: string; IsMain: boolean }>;
  ExtendedProperties?: Array<{ ProperyName?: string; PropertyName?: string; PropertyValue: string; ProperyType?: string; PropertyType?: string }>;
}

export interface LinnworksStockItemPrice {
  Source: string;
  SubSource?: string;
  Price?: number;
  Tag?: string;
  StockItemId?: string;
}

/**
 * A stock level entry from Linnworks /api/Stock/GetItemChangesHistory or /api/Stock/GetStockLevel
 */
export interface LinnworksStockLevel {
  StockItemId: string;
  Location: {
    LocationId: string;
    LocationName: string;
    IsFulfillmentCenter: boolean;
    CountryName?: string;
  };
  Available: number;
  InOrders: number;
  InOrderBook?: number;
  Due: number;
  StockLevel: number;
  MinimumLevel?: number;
  Minimum: number;
  SKU?: string;
}

/**
 * A channel listing from Linnworks /api/Inventory/GetInventoryItemChannelSKUs
 */
export interface LinnworksChannelListing {
  ChannelSKURowId?: string;
  StockItemId: string;
  SKU: string;
  Source: string; // e.g. "AMAZON", "EBAY"
  SubSource?: string; // e.g. marketplace / country code
  ChannelReferenceId?: string; // ASIN / eBay listing ID
  ListingId?: string;
  Price?: number;
  CurrencyCode?: string;
  IsMultiVariation: boolean;
}

interface LinnworksChannelListingBatch {
  StockItemId: string;
  ChannelSkus?: LinnworksChannelListing[];
}

function formatLinnworksDate(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

export interface LinnworksProcessedOrderSummary {
  pkOrderID: string;
  dProcessedOn?: string;
  Source?: string;
  SubSource?: string;
  cCountry?: string;
  cCurrency?: string;
}

export interface LinnworksOrderDetails {
  OrderId: string;
  ProcessedDateTime?: string;
  GeneralInfo?: {
    Source?: string;
    SubSource?: string;
    SiteCode?: string;
    ReceivedDate?: string;
  };
  CustomerInfo?: {
    Address?: { Country?: string };
  };
  TotalsInfo?: {
    Currency?: string;
  };
  Items?: LinnworksOrderItem[];
}

export interface LinnworksOrderItem {
  pkOrderID?: string;
  fkOrderId?: string;
  OrderId?: string;
  ItemTitle?: string;
  SKU?: string;
  ItemNumber?: string;
  sku?: string;
  itemNumber?: string;
  ItemSource?: string;
  Quantity?: number;
  quantity?: number;
  PricePerUnit?: number;
  pricePerUnit?: number;
  Cost?: number;
  StockItemId?: string;
  CompositeSubItems?: LinnworksOrderItem[];
}

export interface LinnworksProcessedOrderPage {
  data: LinnworksProcessedOrderSummary[];
  pageNumber: number;
  totalPages: number;
  totalEntries?: number;
}

export interface LinnworksSalesMetric {
  sku: string;
  channelSource: string;
  subSource?: string;
  country?: string | null;
  periodStart: Date;
  periodEnd: Date;
  unitsSold: number;
  revenue: number;
  currency?: string;
}

/**
 * HTTP client for the Linnworks REST API.
 *
 * Handles:
 *  - Session token acquisition via ApplicationToken endpoint
 *  - Automatic token renewal when the cached token is within 5 minutes of expiry
 *  - All requests are routed through the session-specific API server URL
 */
@Injectable()
export class LinnworksApiClient {
  private readonly logger = new Logger(LinnworksApiClient.name);

  private cachedToken: string | null = null;
  private cachedServer: string;
  private tokenExpiresAt: Date | null = null;

  // Renew if less than 5 minutes left
  private static readonly RENEW_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
  // Fallback TTL when Linnworks doesn't return an explicit expiry (25 min)
  private static readonly DEFAULT_TTL_MS = 25 * 60 * 1000;

  constructor(private readonly config: LinnworksConfig) {
    this.cachedServer = config.initialServer;

    if (config.initialSessionToken) {
      // Optional warm start for local debugging; normal operation authorizes on demand.
      this.cachedToken = config.initialSessionToken;
      this.tokenExpiresAt = new Date(Date.now() + LinnworksApiClient.DEFAULT_TTL_MS);
    }
  }

  // ---------------------------------------------------------------------------
  // Token lifecycle
  // ---------------------------------------------------------------------------

  private isTokenExpiredOrNearExpiry(): boolean {
    if (!this.cachedToken || !this.tokenExpiresAt) return true;
    return Date.now() >= this.tokenExpiresAt.getTime() - LinnworksApiClient.RENEW_BEFORE_EXPIRY_MS;
  }

  async ensureToken(): Promise<void> {
    if (!this.isTokenExpiredOrNearExpiry()) return;

    this.logger.log('Linnworks session token expired or near expiry — renewing…');

    const url = 'https://api.linnworks.net/api/Auth/AuthorizeByApplication';
    const body = {
      ApplicationId: this.config.applicationId,
      ApplicationSecret: this.config.applicationSecret,
      Token: this.config.installationToken,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Linnworks auth failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as LinnworksSessionTokenResponse;

    this.cachedToken = data.Token;
    this.cachedServer = data.Server ?? this.config.initialServer;

    if (data.Expires) {
      this.tokenExpiresAt = new Date(data.Expires);
    } else if (data.TTL && data.TTL > 0) {
      this.tokenExpiresAt = new Date(Date.now() + data.TTL * 1000);
    } else {
      this.tokenExpiresAt = new Date(Date.now() + LinnworksApiClient.DEFAULT_TTL_MS);
    }

    this.logger.log(`Linnworks token renewed — server: ${this.cachedServer}, expires: ${this.tokenExpiresAt.toISOString()}`);
  }

  // ---------------------------------------------------------------------------
  // Low-level HTTP helper
  // ---------------------------------------------------------------------------

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    await this.ensureToken();

    const url = new URL(`${this.cachedServer}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: this.cachedToken! },
    });

    if (response.status === 401) {
      // Force token renewal once and retry
      this.cachedToken = null;
      await this.ensureToken();
      const retry = await fetch(url.toString(), {
        headers: { Authorization: this.cachedToken! },
      });
      if (!retry.ok) {
        const text = await retry.text().catch(() => '');
        throw new Error(`Linnworks API error ${retry.status}: ${text}`);
      }
      return retry.json() as Promise<T>;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Linnworks API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  private normalizeArray<T>(response: unknown, keys: string[] = []): T[] {
    if (Array.isArray(response)) return response as T[];
    if (!response || typeof response !== 'object') return [];

    const object = response as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(object[key])) return object[key] as T[];
    }
    for (const key of ['Items', 'Data', 'StockLevels', 'ProcessedOrders']) {
      if (Array.isArray(object[key])) return object[key] as T[];
    }
    return [];
  }

  private normalizePagedData<T>(response: unknown): { data: T[]; totalPages?: number; totalEntries?: number } {
    if (!response || typeof response !== 'object') {
      return { data: this.normalizeArray<T>(response) };
    }

    const object = response as Record<string, any>;
    const paged = object.ProcessedOrders ?? object;
    return {
      data: this.normalizeArray<T>(paged, ['Data', 'Items']),
      totalPages: typeof paged.TotalPages === 'number' ? paged.TotalPages : undefined,
      totalEntries: typeof paged.TotalEntries === 'number' ? paged.TotalEntries : undefined,
    };
  }

  private normalizeOrderItemsByOrderId(response: unknown, orderIds: string[]): Map<string, LinnworksOrderItem[]> {
    const itemsByOrderId = new Map<string, LinnworksOrderItem[]>();
    const requestedOrderIds = new Set(orderIds.map((id) => id.toLowerCase()));

    const readFirstString = (object: Record<string, unknown>, keys: string[]): string | undefined => {
      for (const key of keys) {
        const value = object[key];
        if (typeof value === 'string' && value.trim() !== '') return value;
      }
      return undefined;
    };

    const readFirstNumber = (object: Record<string, unknown>, keys: string[]): number | undefined => {
      for (const key of keys) {
        const value = object[key];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim() !== '') {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) return parsed;
        }
      }
      return undefined;
    };

    const pushItem = (orderId: string | undefined, item: Record<string, unknown>) => {
      const resolvedOrderId = orderId ?? readFirstString(item, [
        'pkOrderID',
        'pkOrderId',
        'fkOrderId',
        'OrderId',
        'orderId',
        'id',
      ]);
      if (!resolvedOrderId) return;

      const sku = readFirstString(item, ['SKU', 'Sku', 'sku', 'ItemNumber', 'itemNumber', 'ItemSku', 'itemSku']);
      const quantity = readFirstNumber(item, ['Quantity', 'quantity', 'Qty', 'qty', 'nQty']);
      if (!sku || !quantity || quantity <= 0) return;

      const normalizedItem: LinnworksOrderItem = {
        ...(item as LinnworksOrderItem),
        pkOrderID: resolvedOrderId,
        SKU: sku,
        ItemNumber: readFirstString(item, ['ItemNumber', 'itemNumber']) ?? sku,
        Quantity: quantity,
        PricePerUnit: readFirstNumber(item, ['PricePerUnit', 'pricePerUnit', 'Price', 'price', 'UnitPrice', 'unitPrice']),
      };

      itemsByOrderId.set(resolvedOrderId, [...(itemsByOrderId.get(resolvedOrderId) ?? []), normalizedItem]);
    };

    const visit = (value: unknown, inheritedOrderId?: string) => {
      if (!value) return;

      if (Array.isArray(value)) {
        for (const item of value) visit(item, inheritedOrderId);
        return;
      }

      if (typeof value !== 'object') return;
      const object = value as Record<string, unknown>;
      const objectOrderId = readFirstString(object, [
        'pkOrderID',
        'pkOrderId',
        'pkOrderid',
        'fkOrderId',
        'OrderId',
        'orderId',
        'OrderIdGuid',
        'id',
      ]) ?? inheritedOrderId;

      const nestedItems =
        object.Items ??
        object.items ??
        object.OrderItems ??
        object.orderItems ??
        object.OrderLines ??
        object.orderLines ??
        object.lines ??
        object.Lines;
      if (Array.isArray(nestedItems)) {
        for (const item of nestedItems) {
          if (item && typeof item === 'object') pushItem(objectOrderId, item as Record<string, unknown>);
        }
        return;
      }

      const directSku = readFirstString(object, ['SKU', 'Sku', 'sku', 'ItemNumber', 'itemNumber', 'ItemSku', 'itemSku']);
      const directQuantity = readFirstNumber(object, ['Quantity', 'quantity', 'Qty', 'qty', 'nQty']);
      if (directSku && directQuantity && directQuantity > 0) {
        pushItem(objectOrderId, object);
        return;
      }

      for (const [key, child] of Object.entries(object)) {
        const nextOrderId = requestedOrderIds.has(key.toLowerCase()) ? key : objectOrderId;
        if (child && typeof child === 'object') {
          visit(child, nextOrderId);
        }
      }
    };

    visit(response);

    if (itemsByOrderId.size === 0 && response && typeof response === 'object') {
      const root = response as Record<string, unknown>;
      const keys = Object.keys(root).slice(0, 12).join(', ');
      this.logger.warn(`Unable to parse GetOrders line items. Top-level keys: ${keys || '(none)'}`);
      for (const key of ['Data', 'data', 'Orders', 'orders', 'Items', 'items']) {
        const child = root[key];
        if (Array.isArray(child) && child[0] && typeof child[0] === 'object') {
          const childKeys = Object.keys(child[0] as Record<string, unknown>).slice(0, 16).join(', ');
          this.logger.warn(`GetOrders ${key}[0] keys: ${childKeys}`);
          break;
        }
        if (child && typeof child === 'object' && !Array.isArray(child)) {
          const childKeys = Object.keys(child as Record<string, unknown>).slice(0, 16).join(', ');
          this.logger.warn(`GetOrders ${key} keys: ${childKeys}`);
          break;
        }
      }
    }

    return itemsByOrderId;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    await this.ensureToken();

    const url = `${this.cachedServer}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.cachedToken!,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      this.cachedToken = null;
      await this.ensureToken();
      const retry = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.cachedToken!,
        },
        body: JSON.stringify(body),
      });
      if (!retry.ok) {
        const text = await retry.text().catch(() => '');
        throw new Error(`Linnworks API error ${retry.status}: ${text}`);
      }
      return retry.json() as Promise<T>;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Linnworks API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  // Domain-specific Linnworks calls
  // ---------------------------------------------------------------------------

  /**
   * Fetch all inventory items (paginated internally).
   * Linnworks returns a max of 200 per page; we loop until exhausted.
   */
  async getAllStockItems(): Promise<LinnworksStockItem[]> {
    const PAGE_SIZE = 200;
    let page = 1;
    const all: LinnworksStockItem[] = [];

    while (true) {
      const result = await this.post<unknown>(
        '/api/Stock/GetStockItemsFull',
        {
          keyword: '',
          loadCompositeParents: false,
          loadVariationParents: false,
          entriesPerPage: PAGE_SIZE,
          pageNumber: page,
          dataRequirements: ['StockLevels', 'Pricing', 'ChannelPrice', 'ExtendedProperties', 'Images'],
          searchTypes: ['SKU', 'Title', 'Barcode'],
        },
      );

      const items = this.normalizeArray<LinnworksStockItem>(result, ['Items']);
      all.push(...items);

      const totalResults =
        result && typeof result === 'object' && 'TotalResults' in result
          ? Number((result as { TotalResults?: number }).TotalResults)
          : undefined;
      if (typeof totalResults === 'number' && all.length >= totalResults) break;
      if (items.length < PAGE_SIZE) break;
      page++;
    }

    this.logger.log(`Fetched ${all.length} stock items from Linnworks`);
    return all;
  }

  /**
   * Fetch stock levels for all locations.
   */
  async getStockLevels(stockItemIds: string[]): Promise<LinnworksStockLevel[]> {
    const all: LinnworksStockLevel[] = [];

    for (const stockItemId of stockItemIds) {
      const result = await this.post<unknown>(
        '/api/Stock/GetStockLevel',
        { stockItemId },
      );
      all.push(...this.normalizeArray<LinnworksStockLevel>(result, ['StockLevels']));
    }

    return all;
  }

  /**
   * Fetch stock levels for a batch of stock item IDs (more efficient).
   */
  async getStockLevelsBulk(stockItemIds: string[]): Promise<LinnworksStockLevel[]> {
    const BATCH = 100;
    const all: LinnworksStockLevel[] = [];

    for (let i = 0; i < stockItemIds.length; i += BATCH) {
      const batchIds = stockItemIds.slice(i, i + BATCH);
      const result = await this.post<unknown>(
        '/api/Stock/GetStockLevelBatch',
        { stockItemIds: batchIds },
      );
      all.push(...this.normalizeArray<LinnworksStockLevel>(result, ['StockLevels']));
    }

    return all;
  }

  /**
   * Fetch channel listings (ASIN, eBay listing IDs, prices) for all inventory items.
   */
  async getAllChannelListings(stockItemIds: string[]): Promise<LinnworksChannelListing[]> {
    const BATCH = 100;
    const all: LinnworksChannelListing[] = [];

    for (let i = 0; i < stockItemIds.length; i += BATCH) {
      const inventoryItemIds = stockItemIds.slice(i, i + BATCH);
      const result = await this.post<unknown>(
        '/api/Inventory/BatchGetInventoryItemChannelSKUs',
        { inventoryItemIds },
      );
      const batches = this.normalizeArray<LinnworksChannelListingBatch>(result);
      for (const batch of batches) {
        all.push(
          ...(batch.ChannelSkus ?? []).map((listing) => ({
            ...listing,
            StockItemId: listing.StockItemId ?? batch.StockItemId,
          })),
        );
      }
    }

    return all;
  }

  async searchProcessedOrders(from: Date, to: Date): Promise<LinnworksProcessedOrderSummary[]> {
    const PAGE_SIZE = 200;
    let page = 1;
    const all: LinnworksProcessedOrderSummary[] = [];

    while (true) {
      const result = await this.post<unknown>(
        '/api/ProcessedOrders/SearchProcessedOrders',
        {
          request: {
            SearchTerm: '',
            SearchFilters: [],
            DateField: 'processed',
            FromDate: from.toISOString(),
            ToDate: to.toISOString(),
            PageNumber: page,
            ResultsPerPage: PAGE_SIZE,
            SearchSorting: {
              SortField: 'dProcessedOn',
              SortDirection: 'ASC',
            },
          },
        },
      );

      const paged = this.normalizePagedData<LinnworksProcessedOrderSummary>(result);
      all.push(...paged.data);

      if (paged.totalPages && page >= paged.totalPages) break;
      if (paged.data.length < PAGE_SIZE) break;
      page++;
    }

    return all.filter((order) => Boolean(order.pkOrderID));
  }

  async searchProcessedOrdersPaged(
    from: Date,
    to: Date,
    pageNumber: number,
    entriesPerPage = 150,
  ): Promise<LinnworksProcessedOrderPage> {
    const fromValue = formatLinnworksDate(from);
    const toValue = formatLinnworksDate(to);
    const path = '/api/ProcessedOrders/SearchProcessedOrdersPaged';
    const request = {
      from: fromValue,
      to: toValue,
      dateType: 'PROCESSED',
      searchField: '',
      exactMatch: false,
      searchTerm: '',
      pageNum: pageNumber,
      numEntriesPerPage: entriesPerPage,
    };

    let result: unknown;
    try {
      result = await this.post<unknown>(path, request);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${message} while fetching processed orders chunk ${fromValue} to ${toValue}, page ${pageNumber}; requestBody=${JSON.stringify(request)}`,
      );
    }

    const paged = this.normalizePagedData<LinnworksProcessedOrderSummary>(result);
    return {
      data: paged.data.filter((order) => Boolean(order.pkOrderID)),
      pageNumber,
      totalPages: Math.max(1, paged.totalPages ?? (paged.data.length < entriesPerPage ? pageNumber : pageNumber + 1)),
      totalEntries: paged.totalEntries,
    };
  }

  async getOrderItemsByOrderIds(orderIds: string[]): Promise<Map<string, LinnworksOrderItem[]>> {
    const BATCH = 150;
    const itemsByOrderId = new Map<string, LinnworksOrderItem[]>();

    for (let i = 0; i < orderIds.length; i += BATCH) {
      const batchIds = orderIds.slice(i, i + BATCH);
      const result = await this.post<unknown>(
        '/api/Orders/GetOrders',
        {
          ordersIds: batchIds,
          loadItems: true,
          loadAdditionalInfo: false,
        },
      );

      const batchItems = this.normalizeOrderItemsByOrderId(result, batchIds);
      if (batchItems.size === 0) {
        this.logger.warn(`GetOrders returned no parsed line items for ${batchIds.length} processed orders`);
      }
      for (const [orderId, items] of batchItems) {
        itemsByOrderId.set(orderId, [...(itemsByOrderId.get(orderId) ?? []), ...items]);
      }
    }

    return itemsByOrderId;
  }

  async getOrdersByIds(orderIds: string[]): Promise<LinnworksOrderDetails[]> {
    const BATCH = 50;
    const all: LinnworksOrderDetails[] = [];

    for (let i = 0; i < orderIds.length; i += BATCH) {
      const batchIds = orderIds.slice(i, i + BATCH);
      const result = await this.post<unknown>(
        '/api/Orders/GetOrdersById',
        { pkOrderIds: batchIds },
      );
      all.push(...this.normalizeArray<LinnworksOrderDetails>(result));
    }

    return all;
  }

  async getSalesMetrics(periodDays: number[] = [7, 30, 90, 365]): Promise<LinnworksSalesMetric[]> {
    const periodEnd = new Date();
    const maxDays = Math.max(...periodDays);
    const earliestPeriodStart = new Date(periodEnd.getTime() - maxDays * 24 * 60 * 60 * 1000);
    const periods = periodDays.map((days) => ({
      days,
      periodStart: new Date(periodEnd.getTime() - days * 24 * 60 * 60 * 1000),
      periodEnd,
    }));

    const orders: LinnworksProcessedOrderSummary[] = [];
    const chunkDays = 90;
    let chunkStart = earliestPeriodStart;
    while (chunkStart < periodEnd) {
      const chunkEnd = new Date(
        Math.min(
          periodEnd.getTime(),
          chunkStart.getTime() + chunkDays * 24 * 60 * 60 * 1000,
        ),
      );
      orders.push(...await this.searchProcessedOrders(chunkStart, chunkEnd));
      chunkStart = new Date(chunkEnd.getTime() + 1);
    }

    const orderIds = [...new Set(orders.map((order) => order.pkOrderID))];
    if (orderIds.length === 0) return [];

    const orderDetails = await this.getOrdersByIds(orderIds);
    const buckets = new Map<string, LinnworksSalesMetric>();

    const addItem = (
      order: LinnworksOrderDetails,
      item: LinnworksOrderItem,
      channelSource: string,
      subSource?: string,
      country?: string | null,
      currency?: string,
    ) => {
      const sku = item.SKU || item.ItemNumber;
      if (!sku) return;

      const quantity = Math.max(0, Math.round(Number(item.Quantity ?? 0)));
      if (quantity === 0) return;

      const orderDate = new Date(
        order.ProcessedDateTime ??
          order.GeneralInfo?.ReceivedDate ??
          periodEnd,
      );

      const revenue =
        typeof item.Cost === 'number'
          ? item.Cost
          : Number(item.PricePerUnit ?? 0) * quantity;

      for (const period of periods) {
        if (orderDate < period.periodStart || orderDate > period.periodEnd) continue;

        const key = [
          sku,
          channelSource,
          subSource ?? '',
          country ?? '',
          currency ?? '',
          period.days,
        ].join('|');

        const existing = buckets.get(key) ?? {
          sku,
          channelSource,
          subSource,
          country,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          unitsSold: 0,
          revenue: 0,
          currency,
        };

        existing.unitsSold += quantity;
        existing.revenue += Number.isFinite(revenue) ? revenue : 0;
        buckets.set(key, existing);
      }

      for (const child of item.CompositeSubItems ?? []) {
        addItem(order, child, channelSource, subSource, country, currency);
      }
    };

    for (const order of orderDetails) {
      const channelSource = order.GeneralInfo?.Source ?? 'OTHER';
      const subSource = order.GeneralInfo?.SubSource ?? order.GeneralInfo?.SiteCode;
      const country = order.CustomerInfo?.Address?.Country ?? null;
      const currency = order.TotalsInfo?.Currency ?? 'GBP';

      for (const item of order.Items ?? []) {
        addItem(order, item, item.ItemSource ?? channelSource, subSource, country, currency);
      }
    }

    return [...buckets.values()];
  }
}
