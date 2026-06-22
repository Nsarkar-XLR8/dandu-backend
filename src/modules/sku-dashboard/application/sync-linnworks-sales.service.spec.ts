import { ILinnworksClient } from '../ports/outbound/linnworks-client.port';
import { ISkuRepository, UpsertSalesMetricInput } from '../ports/outbound/sku-repository.port';
import { SyncLinnworksSalesService } from './sync-linnworks-sales.service';

describe('SyncLinnworksSalesService', () => {
  it('chunks processed-order searches into 90-day windows and stores rolling metrics', async () => {
    const searchedRanges: Array<{ from: Date; to: Date; pageNum: number }> = [];
    const metrics: UpsertSalesMetricInput[] = [];
    const now = new Date();
    const orderId = '00000000-0000-0000-0000-000000000001';

    const linnworksClient: ILinnworksClient = {
      getStockItemsFull: jest.fn(),
      getChannelSkus: jest.fn(),
      searchProcessedOrdersPaged: jest.fn(async (input) => {
        searchedRanges.push(input);

        return {
          PageNumber: input.pageNum,
          EntriesPerPage: 200,
          TotalEntries: input.pageNum === 1 ? 1 : 0,
          TotalPages: 1,
          Data:
            searchedRanges.length === 1
              ? [
                  {
                    pkOrderID: orderId,
                    dProcessedOn: now.toISOString(),
                    Source: 'AMAZON',
                    cCountry: 'US',
                    cCurrency: 'USD',
                  },
                ]
              : [],
        };
      }),
      getOrderItemsByOrderIds: jest.fn(async () => [
        {
          fkOrderID: orderId,
          SKU: 'SKU-1',
          Quantity: 2,
          PricePerUnit: 10,
        },
      ]),
    };

    const skuRepository = {
      replaceSalesMetrics: jest.fn(async (input: UpsertSalesMetricInput[]) => {
        metrics.push(...input);
        return input.length;
      }),
    } as unknown as ISkuRepository;

    const service = new SyncLinnworksSalesService(linnworksClient, skuRepository);
    const result = await service.execute(365);

    expect(searchedRanges.length).toBeGreaterThan(1);
    expect(
      searchedRanges.every(
        (range) => range.to.getTime() - range.from.getTime() <= 90 * 24 * 60 * 60 * 1000,
      ),
    ).toBe(true);
    expect(result.orderItems).toBe(1);
    expect(metrics).toHaveLength(4);
    expect(metrics.map((metric) => metric.unitsSold)).toEqual([2, 2, 2, 2]);
    expect(metrics.map((metric) => metric.revenue)).toEqual([20, 20, 20, 20]);
  });
});

