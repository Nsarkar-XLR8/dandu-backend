import { Injectable } from '@nestjs/common';
import { IAppConfig } from '../domain/interfaces/app-config.interface';
import config from './app.config';

@Injectable()
export class AppConfigService implements IAppConfig {
  get jwt_access_secret(): string {
    return config.jwt_access_secret;
  }

  get jwt_refresh_secret(): string {
    return config.jwt_refresh_secret;
  }

  get redis_cache_key_prefix(): string {
    return config.redis_cache_key_prefix;
  }

  get rate_limit_enabled(): boolean {
    return config.rate_limit_enabled;
  }
}
