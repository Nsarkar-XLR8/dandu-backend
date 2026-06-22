import { Logger } from '@nestjs/common';
import AppError from '../../../common/errors/app.error';
import {
  ImportReportCommand,
  ImportReportResult,
  IImportReportUseCase,
} from '../ports/inbound/import-report.usecase';
import { CsvParserService } from './csv-parser.service';
import { ISkuRepository, UpsertProductInput, UpsertStockInput, UpsertChannelInput } from '../ports/outbound/sku-repository.port';

/**
 * Linnworks "My Inventory" CSV header mappings.
 *
 * Linnworks exports have flexible column names depending on template; we try
 * common alternatives for each logical field.
 */
const HEADER_ALIASES: Record<string, string[]> = {
  sku:      ['SKU', 'ItemNumber', 'Item Number', 'Stock Item', 'StockItemId'],
  title:    ['Title', 'ItemTitle', 'Item Title', 'Description', 'ProductTitle'],
  brand:    ['Brand', 'Manufacturer', 'BrandName'],
  currency: ['Currency', 'CurrencyCode', 'Currency Code'],
  cost:     ['PurchasePrice', 'Purchase Price', 'CostPrice', 'Cost Price', 'UnitCost'],
  price:    ['RetailPrice', 'Retail Price', 'SalePrice', 'Sale Price', 'Price'],
  weight:   ['Weight', 'ItemWeight', 'WeightKg', 'WeightG'],
  length:   ['Length', 'LENGTH (in)', 'Depth', 'ItemDepth', 'PackageLength'],
  width:    ['Width', 'WIDTH (in)', 'ItemWidth', 'PackageWidth'],
  height:   ['Height', 'HEIGHT (in)', 'ItemHeight', 'PackageHeight'],
  imageUrl: ['ImageUrl', 'Image URL', 'ImageSource', 'MainImage', 'Image'],
  // Stock
  available:['Available', 'AvailableQuantity', 'Qty Available', 'Stock Available'],
  fbaStock: ['FBA Stock', 'FBAStock', 'Amazon FBA Stock', 'FBA Quantity', 'FBA Qty'],
  mfnStock: ['MFN Stock', 'MFNStock', 'FBM Stock', 'FBMStock', 'Merchant Stock', 'MFN Quantity', 'MFN Qty'],
  inOrders: ['InOrders', 'In Orders', 'Reserved', 'Allocated'],
  inbound:  ['Due', 'Inbound', 'PurchaseInProgress', 'OnOrder', 'On Order'],
  stockLevel:['StockLevel', 'Stock Level', 'Quantity', 'TotalStock'],
  // Location
  location: ['Location', 'Warehouse', 'LocationName', 'FulfillmentCenter'],
  country:  ['Country', 'CountryCode', 'MarketplaceCountry'],
  // Channel
  channel:  ['Channel', 'Source', 'MarketplaceSource', 'ChannelType'],
  asin:     ['ASIN', 'Listing ID / ASIN', 'ChannelRefId', 'Channel Ref', 'ChannelReferenceId'],
  listingId:['ListingId', 'Listing ID', 'Listing ID / ASIN', 'ChannelListingId'],
  fbaPrice: ['FBA Price', 'FBAPrice', 'Amazon FBA Price'],
  mfnPrice: ['MFN Price', 'MFNPrice', 'FBM Price', 'FBMPrice', 'Merchant Price'],
  sales7:   ['7-Day Sales (units)', '7 Day Sales', '7-Day Sales', 'Sales 7 Days', 'Units Sold 7 Days'],
  sales30:  ['30-Day Sales (units)', '30 Day Sales', '30-Day Sales', 'Sales 30 Days', 'Units Sold 30 Days'],
  sales90:  ['90-Day Sales (units)', '90 Day Sales', '90-Day Sales', 'Sales 90 Days', 'Units Sold 90 Days'],
  sales365: ['365-Day Sales (units)', '365 Day Sales', '365-Day Sales', 'Sales 365 Days', 'Units Sold 365 Days'],
  material: ['Material', 'MaterialType', 'ProductMaterial', 'material'],
  thickness:['Thickness', 'ProductThickness', 'ThicknessGauge', 'thickness'],
  packQty:  ['PackQty', 'Pack Qty', 'PackQuantity', 'QuantityPerPack', 'packQty'],
};

type ChannelType = 'AMAZON' | 'EBAY' | 'WALMART' | 'SHOPIFY' | 'WEBSITE' | 'OTHER';

function mapChannel(raw: string): ChannelType {
  const u = raw.toUpperCase().trim();
  if (u.includes('AMAZON')) return 'AMAZON';
  if (u.includes('EBAY'))   return 'EBAY';
  if (u.includes('WALMART')) return 'WALMART';
  if (u.includes('SHOPIFY')) return 'SHOPIFY';
  if (u.includes('WEB') || u.includes('DANDU') || u.includes('WEBSITE') || u.includes('BIGCOMMERCE') || u.includes('DISTINCT')) return 'WEBSITE';
  return 'OTHER';
}

function mapLocationType(locationName: string): 'FBA' | 'FBM' | 'WAREHOUSE' | 'THIRD_PARTY' {
  const u = locationName.toUpperCase();
  if (u.includes('FBA') || u.includes('AMAZON')) return 'FBA';
  if (u.includes('FBM') || u.includes('MFN') || u === 'DEFAULT' || u.includes('FLORIDA')) return 'FBM';
  if (u.includes('3PL') || u.includes('THIRD')) return 'THIRD_PARTY';
  if (u.includes('WHOLESALE')) return 'WAREHOUSE';
  return 'WAREHOUSE';
}

function parseNum(val: string): number | null {
  if (!val || val.trim() === '' || val.trim() === '-') return null;
  const n = parseFloat(val.replace(/[$£€,]/g, '').trim());
  return isNaN(n) ? null : n;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolve(row: Record<string, string>, field: string): string {
  const normalizedRow = Object.entries(row).map(([key, value]) => [
    normalizeHeader(key),
    value,
  ] as const);

  for (const alias of (HEADER_ALIASES[field] ?? [])) {
    if (alias in row && row[alias].trim() !== '') return row[alias].trim();
    const normalizedAlias = normalizeHeader(alias);
    const normalizedMatch = normalizedRow.find(
      ([header, value]) => header === normalizedAlias && value.trim() !== '',
    );
    if (normalizedMatch) return normalizedMatch[1].trim();
  }
  return '';
}

function periodStart(periodEnd: Date, days: number): Date {
  return new Date(periodEnd.getTime() - days * 24 * 60 * 60 * 1000);
}

export class ImportReportService implements IImportReportUseCase {
  private readonly logger = new Logger(ImportReportService.name);

  constructor(
    private readonly csvParser: CsvParserService,
    private readonly skuRepository: ISkuRepository,
  ) {}

  async execute(command: ImportReportCommand): Promise<ImportReportResult> {
    const rows = this.csvParser.parse(command.content);

    if (rows.length === 0) {
      throw AppError.badRequest('CSV report is empty');
    }

    // Create import batch record
    const { id: batchId } = await this.skuRepository.createImportBatch({
      fileName: command.fileName,
      uploadedBy: command.uploadedBy,
      totalRows: rows.length,
    });

    let importedRows = 0;
    let failedRows = 0;
    const rowErrors: Array<{
      batchId: string;
      rowNumber: number;
      sku?: string;
      reason: string;
      rawRow: Record<string, string>;
    }> = [];

    for (const row of rows) {
      const sku = resolve(row.values, 'sku');
      if (!sku) {
        failedRows++;
        rowErrors.push({
          batchId,
          rowNumber: row.rowNumber,
          reason: 'Missing SKU column — check column header mapping',
          rawRow: row.values,
        });
        continue;
      }

      try {
        // ---- Product --------------------------------------------------------
        const title = resolve(row.values, 'title') || sku;
        const productInput: UpsertProductInput = {
          sku,
          title,
          brand:    resolve(row.values, 'brand') || null,
          cost:     parseNum(resolve(row.values, 'cost')),
          currency: resolve(row.values, 'currency') || 'GBP',
          weight:   parseNum(resolve(row.values, 'weight')),
          length:   parseNum(resolve(row.values, 'length')),
          width:    parseNum(resolve(row.values, 'width')),
          height:   parseNum(resolve(row.values, 'height')),
          imageUrl: resolve(row.values, 'imageUrl') || null,
          material: resolve(row.values, 'material') || null,
          thickness: resolve(row.values, 'thickness') || null,
          packQty:  parseNum(resolve(row.values, 'packQty')),
        };
        await this.skuRepository.upsertProduct(productInput);

        // ---- Stock ----------------------------------------------------------
        const locationName = resolve(row.values, 'location') || 'DEFAULT';
        const country      = resolve(row.values, 'country')  || 'US';
        const available    = parseNum(resolve(row.values, 'available'))  ?? 0;
        const inOrders     = parseNum(resolve(row.values, 'inOrders'))   ?? 0;
        const inbound      = parseNum(resolve(row.values, 'inbound'))    ?? 0;
        const stockLevel   = parseNum(resolve(row.values, 'stockLevel')) ?? available;
        const fbaStock     = parseNum(resolve(row.values, 'fbaStock'));
        const mfnStock     = parseNum(resolve(row.values, 'mfnStock'));
        const hasFulfillmentStock = fbaStock !== null || mfnStock !== null;

        if (!hasFulfillmentStock) {
          const stockInput: UpsertStockInput = {
            sku,
            country,
            locationType: mapLocationType(locationName),
            warehouse:    locationName,
            quantity:     stockLevel,
            reserved:     inOrders,
            inbound,
            available,
          };
          await this.skuRepository.upsertStock(stockInput);
        } else {
          if (fbaStock !== null) {
            await this.skuRepository.upsertStock({
              sku,
              country,
              locationType: 'FBA',
              warehouse: locationName === 'DEFAULT' ? 'FBA' : locationName,
              quantity: fbaStock,
              reserved: 0,
              inbound: 0,
              available: fbaStock,
            });
          }
          if (mfnStock !== null) {
            await this.skuRepository.upsertStock({
              sku,
              country,
              locationType: 'FBM',
              warehouse: locationName === 'DEFAULT' ? 'MFN' : locationName,
              quantity: mfnStock,
              reserved: 0,
              inbound: 0,
              available: mfnStock,
            });
          }
        }

        // ---- Channel --------------------------------------------------------
        const channelRaw = resolve(row.values, 'channel');
        const asin = resolve(row.values, 'asin') || null;
        const listingId = resolve(row.values, 'listingId') || null;
        const price =
          parseNum(resolve(row.values, 'price')) ??
          parseNum(resolve(row.values, 'fbaPrice')) ??
          parseNum(resolve(row.values, 'mfnPrice'));
        if (channelRaw || asin || listingId || price !== null) {
          const channelInput: UpsertChannelInput = {
            sku,
            channel:   mapChannel(channelRaw || (asin ? 'AMAZON' : 'OTHER')),
            country:   resolve(row.values, 'country') || null,
            asin,
            listingId,
            price,
            currency:  resolve(row.values, 'currency') || 'GBP',
            isActive:  true,
          };
          await this.skuRepository.upsertChannel(channelInput);
        }

        // ---- Sales Metrics --------------------------------------------------
        const metricChannel = mapChannel(channelRaw || (asin ? 'AMAZON' : 'OTHER'));
        const metricCountry = resolve(row.values, 'country') || null;
        const metricCurrency = resolve(row.values, 'currency') || 'GBP';
        const periodEnd = new Date();
        const salesBuckets = [
          { field: 'sales7', days: 7 },
          { field: 'sales30', days: 30 },
          { field: 'sales90', days: 90 },
          { field: 'sales365', days: 365 },
        ];

        for (const bucket of salesBuckets) {
          const unitsSold = parseNum(resolve(row.values, bucket.field));
          if (unitsSold === null) continue;

          await this.skuRepository.upsertSalesMetric({
            sku,
            channel: metricChannel,
            country: metricCountry,
            periodStart: periodStart(periodEnd, bucket.days),
            periodEnd,
            unitsSold: Math.round(unitsSold),
            revenue: 0,
            currency: metricCurrency,
          });
        }

        importedRows++;
      } catch (err) {
        failedRows++;
        const reason = err instanceof Error ? err.message : 'Unknown error';
        this.logger.warn(`Row ${row.rowNumber} (SKU: ${sku}) failed: ${reason}`);
        rowErrors.push({
          batchId,
          rowNumber: row.rowNumber,
          sku,
          reason,
          rawRow: row.values,
        });
      }
    }

    // Save all row errors in one batch
    if (rowErrors.length > 0) {
      await this.skuRepository.saveRowErrors(rowErrors);
    }

    // Mark batch complete
    const status =
      failedRows === 0
        ? 'COMPLETED'
        : importedRows === 0
          ? 'FAILED'
          : 'COMPLETED_WITH_ERRORS';

    await this.skuRepository.updateImportBatch(batchId, {
      status,
      importedRows,
      failedRows,
    });

    this.logger.log(`Import ${batchId}: ${importedRows} imported, ${failedRows} failed`);

    return { batchId, totalRows: rows.length, importedRows, failedRows };
  }
}
