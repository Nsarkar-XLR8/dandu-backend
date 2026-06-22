import { ISkuRepository } from '../ports/outbound/sku-repository.port';

export class GetInventoryAlertsService {
  constructor(private readonly skuRepository: ISkuRepository) {}

  async execute() {
    return this.skuRepository.getInventoryAlerts();
  }
}

