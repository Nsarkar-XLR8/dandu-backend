import { ISkuRepository } from '../ports/outbound/sku-repository.port';

const PERIOD_DAYS = {
  '7D': 7,
  '30D': 30,
  '90D': 90,
  '365D': 365,
} as const;

export class GetDashboardMetricsService {
  constructor(private readonly skuRepository: ISkuRepository) {}

  async execute(period: keyof typeof PERIOD_DAYS = '30D') {
    return this.skuRepository.getDashboardMetrics(PERIOD_DAYS[period]);
  }
}

