export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';
export type StockLocationType = 'FBA' | 'FBM' | 'WAREHOUSE' | 'THIRD_PARTY';
export type SalesChannelType =
  | 'AMAZON'
  | 'EBAY'
  | 'WALMART'
  | 'SHOPIFY'
  | 'WEBSITE'
  | 'OTHER';

export interface ProductDomainModel {
  id: string;
  sku: string;
  title: string;
  brand: string | null;
  status: ProductStatus;
  cost: number | null;
  currency: string;
  weight: number | null;
  dimensions: {
    length: number | null;
    width: number | null;
    height: number | null;
  };
  imageUrl: string | null;
  productUrl: string | null;
  material: string | null;
  thickness: string | null;
  packQty: number | null;
  lastSyncedAt: Date | null;
}

export interface ProductStockDomainModel {
  country: string;
  locationType: StockLocationType;
  warehouse: string | null;
  quantity: number;
  reserved: number;
  inbound: number;
  available: number;
}

export interface ProductChannelDomainModel {
  channel: SalesChannelType;
  country: string | null;
  asin: string | null;
  listingId: string | null;
  price: number | null;
  currency: string;
  isActive: boolean;
}

export interface ProductSalesMetricDomainModel {
  channel: SalesChannelType;
  country: string | null;
  periodStart: Date;
  periodEnd: Date;
  unitsSold: number;
  revenue: number;
  velocity: number | null;
  currency: string;
}

export interface SkuMetricsDomainModel {
  sku: string;
  product: ProductDomainModel;
  stock: ProductStockDomainModel[];
  channels: ProductChannelDomainModel[];
  salesMetrics: ProductSalesMetricDomainModel[];
}
