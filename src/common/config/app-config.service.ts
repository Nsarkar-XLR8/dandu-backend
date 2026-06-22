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

  get linnworks_application_id(): string {
    return config.linnworks_application_id;
  }

  get linnworks_application_secret(): string {
    return config.linnworks_application_secret;
  }

  get linnworks_token(): string {
    return config.linnworks_token;
  }

  get linnworks_auth_url(): string {
    return config.linnworks_auth_url;
  }

  get linnworks_default_server(): string {
    return config.linnworks_default_server;
  }

  get linnworks_token_ttl_minutes(): number {
    return config.linnworks_token_ttl_minutes;
  }

  get linnworks_catalog_page_size(): number {
    return config.linnworks_catalog_page_size;
  }

  get linnworks_orders_page_size(): number {
    return config.linnworks_orders_page_size;
  }

  get linnworks_channel_batch_size(): number {
    return config.linnworks_channel_batch_size;
  }

  get linnworks_order_items_batch_size(): number {
    return config.linnworks_order_items_batch_size;
  }

  get linnworks_timeout_ms(): number {
    return config.linnworks_timeout_ms;
  }

  get linnworks_retry_attempts(): number {
    return config.linnworks_retry_attempts;
  }

  get linnworks_retry_base_delay_ms(): number {
    return config.linnworks_retry_base_delay_ms;
  }

  get linnworks_rate_limit_per_minute(): number {
    return config.linnworks_rate_limit_per_minute;
  }

  get linnworks_daily_sync_cron(): string {
    return config.linnworks_daily_sync_cron;
  }
}
