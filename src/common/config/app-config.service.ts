import { Injectable } from '@nestjs/common';
import config from './app.config';

@Injectable()
export class AppConfigService {
  get jwt_access_secret(): string {
    return config.jwt_access_secret;
  }

  get jwt_refresh_secret(): string {
    return config.jwt_refresh_secret;
  }

  get redis_cache_key_prefix(): string {
    return config.redis_cache_key_prefix;
  }
}
