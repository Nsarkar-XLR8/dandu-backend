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
  Images?: Array<{ Source: string; IsMain: boolean }>;
  ExtendedProperties?: Array<{ ProperyName: string; PropertyValue: string; ProperyType: string }>;
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
  Due: number;
  StockLevel: number;
  Minimum: number;
}

/**
 * A channel listing from Linnworks /api/Inventory/GetInventoryItemChannelSKUs
 */
export interface LinnworksChannelListing {
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
  private cachedServer: string = 'https://api.linnworks.net';
  private tokenExpiresAt: Date | null = null;

  // Renew if less than 5 minutes left
  private static readonly RENEW_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
  // Fallback TTL when Linnworks doesn't return an explicit expiry (25 min)
  private static readonly DEFAULT_TTL_MS = 25 * 60 * 1000;

  constructor(private readonly config: LinnworksConfig) {
    if (config.initialAuthToken) {
      // Optional warm start for local debugging; normal operation authorizes on demand.
      this.cachedToken = config.initialAuthToken;
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
    const body = new URLSearchParams({
      ApplicationId: this.config.applicationId,
      ApplicationSecret: this.config.applicationSecret,
      Token: this.config.installationId,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Linnworks auth failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as LinnworksSessionTokenResponse;

    this.cachedToken = data.Token;
    this.cachedServer = data.Server ?? 'https://api.linnworks.net';

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
      const result = await this.post<{ Items: LinnworksStockItem[]; TotalResults: number }>(
        '/api/Stock/GetStockItemsFull',
        {
          request: {
            PageNumber: page,
            PageSize: PAGE_SIZE,
            LoadCompositeParents: false,
            LoadVariationParents: false,
            DataRequirements: [0, 2, 3, 4, 5, 6, 8], // Core fields + images + extended props
            SearchTypes: [0],
            HasImages: null,
            Filters: null,
          },
        },
      );

      all.push(...(result.Items ?? []));

      if (all.length >= result.TotalResults) break;
      page++;
    }

    this.logger.log(`Fetched ${all.length} stock items from Linnworks`);
    return all;
  }

  /**
   * Fetch stock levels for all locations.
   */
  async getStockLevels(stockItemIds: string[]): Promise<LinnworksStockLevel[]> {
    const BATCH = 50;
    const all: LinnworksStockLevel[] = [];

    for (let i = 0; i < stockItemIds.length; i += BATCH) {
      const batch = stockItemIds.slice(i, i + BATCH);
      const result = await this.post<LinnworksStockLevel[]>(
        '/api/Stock/GetStockLevel',
        { stockItemId: batch[0] }, // Linnworks stock level is per-item; iterate
      );
      // For multi-item, use the batch endpoint if available:
      if (Array.isArray(result)) all.push(...result);
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
      const result = await this.post<{ StockLevels?: LinnworksStockLevel[] }>(
        '/api/Stock/GetStockLevelBatch',
        { stockItemIds: batchIds },
      );
      if (result.StockLevels) all.push(...result.StockLevels);
    }

    return all;
  }

  /**
   * Fetch channel listings (ASIN, eBay listing IDs, prices) for all inventory items.
   */
  async getAllChannelListings(stockItemIds: string[]): Promise<LinnworksChannelListing[]> {
    const BATCH = 50;
    const all: LinnworksChannelListing[] = [];

    for (let i = 0; i < stockItemIds.length; i += BATCH) {
      const batchIds = stockItemIds.slice(i, i + BATCH);
      const result = await this.post<LinnworksChannelListing[]>(
        '/api/Inventory/GetInventoryItemChannelSKUs',
        { stockItemIds: batchIds },
      );
      if (Array.isArray(result)) all.push(...result);
    }

    return all;
  }
}
