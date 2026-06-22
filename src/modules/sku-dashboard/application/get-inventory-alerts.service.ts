import { ISkuRepository, InventoryAlertOutput } from '../ports/outbound/sku-repository.port';

export class GetInventoryAlertsService {
  constructor(private readonly skuRepository: ISkuRepository) {}

  async execute(): Promise<InventoryAlertOutput[]> {
    return this.skuRepository.getInventoryAlerts();
  }
}
