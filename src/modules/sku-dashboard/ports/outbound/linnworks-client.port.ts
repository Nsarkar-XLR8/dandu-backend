export interface LinnworksStockItem {
  StockItemId?: string;
  ItemNumber?: string;
  ItemTitle?: string;
  PurchasePrice?: number;
  RetailPrice?: number;
  Weight?: number;
  Height?: number;
  Width?: number;
  Depth?: number;
  Images?: Array<{
    Source?: string;
    FullSource?: string;
    IsMain?: boolean;
  }>;
  StockLevels?: Array<{
    StockLevel?: number;
    InOrderBook?: number;
    InOrders?: number;
    Due?: number;
    Available?: number;
    Location?: {
      LocationName?: string;
      LocationTag?: string;
      IsFulfillmentCenter?: boolean;
      IsWarehouseManaged?: boolean;
    };
  }>;
  ItemChannelPrices?: Array<{
    Source?: string;
    SubSource?: string;
    Price?: number;
  }>;
}

export interface LinnworksChannelSku {
  StockItemId?: string;
  Source?: string;
  SubSource?: string;
  ChannelSKU?: string;
  SKU?: string;
  ASIN?: string;
}

export interface LinnworksProcessedOrder {
  pkOrderID?: string;
  dProcessedOn?: string;
  dReceivedDate?: string;
  Source?: string;
  SubSource?: string;
  cCountry?: string;
  cCurrency?: string;
}

export interface LinnworksOrderItem {
  fkOrderID?: string;
  OrderId?: string;
  SKU?: string;
  ItemNumber?: string;
  Quantity?: number;
  nQty?: number;
  Cost?: number;
  PricePerUnit?: number;
  LineTotal?: number;
}

export interface LinnworksPagedOrders {
  PageNumber: number;
  EntriesPerPage: number;
  TotalEntries: number;
  TotalPages: number;
  Data: LinnworksProcessedOrder[];
}

export interface ILinnworksClient {
  getStockItemsFull(pageNumber: number): Promise<LinnworksStockItem[]>;
  getChannelSkus(inventoryItemIds: string[]): Promise<LinnworksChannelSku[]>;
  searchProcessedOrdersPaged(input: {
    from: Date;
    to: Date;
    pageNum: number;
  }): Promise<LinnworksPagedOrders>;
  getOrderItemsByOrderIds(orderIds: string[]): Promise<LinnworksOrderItem[]>;
}

export const LINNWORKS_CLIENT_TOKEN = Symbol('ILinnworksClient');

