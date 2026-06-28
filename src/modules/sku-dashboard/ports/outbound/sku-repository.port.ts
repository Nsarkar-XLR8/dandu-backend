import { SkuMetricsDomainModel } from '../../domain/models/product.domain';

// ---------------------------------------------------------------------------
// Import batch types
// ---------------------------------------------------------------------------

export interface CreateImportBatchInput {
  fileName: string;
  uploadedBy?: string;
  totalRows: number;
}

export interface UpdateImportBatchInput {
  status: 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED';
  importedRows: number;
  failedRows: number;
  errorMessage?: string;
}

export interface ImportRowErrorInput {
  batchId: string;
  rowNumber: number;
  sku?: string;
  reason: string;
  rawRow?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Upsert types
// ---------------------------------------------------------------------------

export interface UpsertProductInput {
  sku: string;
  title: string;
  brand?: string | null;
  cost?: number | null;
  currency?: string;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  material?: string | null;
  thickness?: string | null;
  packQty?: number | null;
}

export interface UpsertStockInput {
  sku: string;
  country: string;
  locationType: 'FBA' | 'FBM' | 'WAREHOUSE' | 'THIRD_PARTY';
  warehouse?: string | null;
  quantity?: number;
  reserved?: number;
  inbound?: number;
  available: number;
}

export interface UpsertChannelInput {
  sku: string;
  channel: 'AMAZON' | 'EBAY' | 'WALMART' | 'SHOPIFY' | 'WEBSITE' | 'OTHER';
  country?: string | null;
  asin?: string | null;
  listingId?: string | null;
  price?: number | null;
  currency?: string;
  isActive?: boolean;
}

export interface UpsertSalesMetricInput {
  sku: string;
  channel: 'AMAZON' | 'EBAY' | 'WALMART' | 'SHOPIFY' | 'WEBSITE' | 'OTHER';
  country?: string | null;
  periodStart: Date;
  periodEnd: Date;
  unitsSold: number;
  revenue?: number;
  velocity?: number | null;
  currency?: string;
}

export interface IncrementSalesMetricInput extends UpsertSalesMetricInput {}

export interface ReplaceSalesMetricsForPeriodResult {
  cleared: number;
  created: number;
  skipped: number;
}

export interface DeleteProductsNotInSkuSetResult {
  deleted: number;
  remaining: number;
}

// ---------------------------------------------------------------------------
// Browse / filter types
// ---------------------------------------------------------------------------

export interface SkuBrowseFilters {
  q?: string;
  stockStatus?: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  channel?: 'ALL' | 'AMAZON' | 'EBAY' | 'WALMART' | 'SHOPIFY' | 'WEBSITE' | 'OTHER';
  cursor?: string;
  limit?: number;
}

export interface SkuBrowsePage {
  items: SkuMetricsDomainModel[];
  nextCursor: string | null;
  total: number;
}

// ---------------------------------------------------------------------------
// Sync log types
// ---------------------------------------------------------------------------

export interface CreateSyncLogInput {
  provider: string;
  processedRows: number;
  failedRows: number;
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Dashboard & alerts
// ---------------------------------------------------------------------------

export interface DashboardMetricsOutput {
  salesVelocity: Array<{ channel: string; fba: number; mfn: number }>;
  stockDistribution: Array<{ name: string; value: number; fill: string }>;
  revenueTrend: Array<{ month: string; revenue: number }>;
}

export interface InventoryAlertOutput {
  sku: string;
  title: string;
  type: 'DEAD_STOCK' | 'AGED_STOCK' | 'CRITICAL_LOW' | 'OUT_OF_STOCK';
  detail: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ---------------------------------------------------------------------------
// Port interface
// ---------------------------------------------------------------------------

export interface ISkuRepository {
  // Single SKU lookup
  findMetricsBySku(sku: string): Promise<SkuMetricsDomainModel | null>;

  // Browsing
  browseSkus(filters: SkuBrowseFilters): Promise<SkuBrowsePage>;

  // Upsert operations (used by CSV import and Linnworks sync)
  upsertProduct(input: UpsertProductInput): Promise<{ id: string }>;
  upsertStock(input: UpsertStockInput): Promise<void>;
  upsertChannel(input: UpsertChannelInput): Promise<void>;
  upsertSalesMetric(input: UpsertSalesMetricInput): Promise<void>;
  incrementSalesMetric(input: IncrementSalesMetricInput): Promise<boolean>;
  replaceSalesMetricsForPeriod(
    periodStart: Date,
    periodEnd: Date,
    inputs: IncrementSalesMetricInput[],
  ): Promise<ReplaceSalesMetricsForPeriodResult>;
  clearSalesMetricsForPeriod(periodStart: Date, periodEnd: Date): Promise<number>;

  // Update mutable product fields
  updateProduct(sku: string, fields: Partial<UpsertProductInput>): Promise<void>;
  deleteProductsNotInSkus(skus: string[]): Promise<DeleteProductsNotInSkuSetResult>;

  // Import batch tracking
  createImportBatch(input: CreateImportBatchInput): Promise<{ id: string }>;
  updateImportBatch(batchId: string, input: UpdateImportBatchInput): Promise<void>;
  saveRowErrors(errors: ImportRowErrorInput[]): Promise<void>;

  // Sync log
  createSyncLog(input: CreateSyncLogInput): Promise<void>;
  findLastSuccessfulSync(provider: string): Promise<Date | null>;

  // Dashboard aggregations
  getDashboardMetrics(periodDays: number): Promise<DashboardMetricsOutput>;

  // Inventory alerts
  getInventoryAlerts(): Promise<InventoryAlertOutput[]>;
}

export const SKU_REPOSITORY_TOKEN = Symbol('ISkuRepository');
