import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { RunLinnworksDailySyncService } from './src/modules/sku-dashboard/application/run-linnworks-daily-sync.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const syncService = app.get(RunLinnworksDailySyncService);

  try {
    console.log('Running sync...');
    const result = await syncService.execute();
    console.log('Sync result:', result);
  } catch (error) {
    console.error('Sync failed:', error);
  }

  await app.close();
}

bootstrap().catch(console.error);
