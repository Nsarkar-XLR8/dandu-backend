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
  cost:     ['PurchasePrice', 'Purchase Price', 'CostPrice', 'Cost Price', 'UnitCost'],
  price:    ['RetailPrice', 'Retail Price', 'SalePrice', 'Sale Price', 'Price'],
  weight:   ['Weight', 'ItemWeight', 'WeightKg', 'WeightG'],
  imageUrl: ['ImageUrl', 'Image URL', 'ImageSource', 'MainImage', 'Image'],
  // Stock
  available:['Available', 'AvailableQuantity', 'Qty Available', 'Stock Available'],
  inOrders: ['InOrders', 'In Orders', 'Reserved', 'Allocated'],
  inbound:  ['Due', 'Inbound', 'PurchaseInProgress', 'OnOrder', 'On Order'],
  stockLevel:['StockLevel', 'Stock Level', 'Quantity', 'TotalStock'],
  // Location
  location: ['Location', 'Warehouse', 'LocationName', 'FulfillmentCenter'],
  country:  ['Country', 'CountryCode', 'MarketplaceCountry'],
  // Channel
  channel:  ['Channel', 'Source', 'MarketplaceSource', 'ChannelType'],
  asin:     ['ASIN', 'ChannelRefId', 'Channel Ref', 'ChannelReferenceId'],
  listingId:['ListingId', 'Listing ID', 'ChannelListingId'],
};

type ChannelType = 'AMAZON' | 'EBAY' | 'WALMART' | 'SHOPIFY' | 'WEBSITE' | 'OTHER';

function mapChannel(raw: string): ChannelType {
  const u = raw.toUpperCase().trim();
  if (u.includes('AMAZON')) return 'AMAZON';
  if (u.includes('EBAY'))   return 'EBAY';
  if (u.includes('WALMART')) return 'WALMART';
  if (u.includes('SHOPIFY')) return 'SHOPIFY';
  if (u.includes('WEB') || u.includes('DANDU') || u.includes('WEBSITE')) return 'WEBSITE';
  return 'OTHER';
}

function mapLocationType(locationName: string): 'FBA' | 'FBM' | 'WAREHOUSE' | 'THIRD_PARTY' {
  const u = locationName.toUpperCase();
  if (u.includes('FBA') || u.includes('AMAZON')) return 'FBA';
  if (u.includes('FBM'))  return 'FBM';
  if (u.includes('3PL') || u.includes('THIRD')) return 'THIRD_PARTY';
  return 'WAREHOUSE';
}

function parseNum(val: string): number | null {
  if (!val || val.trim() === '' || val.trim() === '-') return null;
  const n = parseFloat(val.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function resolve(row: Record<string, string>, field: string): string {
  for (const alias of (HEADER_ALIASES[field] ?? [])) {
    if (alias in row && row[alias].trim() !== '') return row[alias].trim();
  }
  return '';
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
          imageUrl: resolve(row.values, 'imageUrl') || null,
        };
        await this.skuRepository.upsertProduct(productInput);

        // ---- Stock ----------------------------------------------------------
        const locationName = resolve(row.values, 'location') || 'DEFAULT';
        const country      = resolve(row.values, 'country')  || 'GB';
        const available    = parseNum(resolve(row.values, 'available'))  ?? 0;
        const inOrders     = parseNum(resolve(row.values, 'inOrders'))   ?? 0;
        const inbound      = parseNum(resolve(row.values, 'inbound'))    ?? 0;
        const stockLevel   = parseNum(resolve(row.values, 'stockLevel')) ?? available;

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

        // ---- Channel --------------------------------------------------------
        const channelRaw = resolve(row.values, 'channel');
        if (channelRaw) {
          const channelInput: UpsertChannelInput = {
            sku,
            channel:   mapChannel(channelRaw),
            country:   resolve(row.values, 'country') || null,
            asin:      resolve(row.values, 'asin')    || null,
            listingId: resolve(row.values, 'listingId') || null,
            price:     parseNum(resolve(row.values, 'price')),
            currency:  resolve(row.values, 'currency') || 'GBP',
            isActive:  true,
          };
          await this.skuRepository.upsertChannel(channelInput);
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
