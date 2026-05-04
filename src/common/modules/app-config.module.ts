import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { APP_CONFIG_TOKEN } from '../domain/interfaces/app-config.interface';

@Global()
@Module({
  providers: [
    AppConfigService,
    { provide: APP_CONFIG_TOKEN, useExisting: AppConfigService },
  ],
  exports: [AppConfigService, APP_CONFIG_TOKEN],
})
export class AppConfigModule {}
