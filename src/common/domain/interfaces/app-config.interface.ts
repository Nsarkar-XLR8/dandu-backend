export interface IAppConfig {
  readonly jwt_access_secret: string;
  readonly jwt_refresh_secret: string;
  readonly redis_cache_key_prefix: string;
  readonly rate_limit_enabled: boolean;
  readonly linnworks_application_id: string;
  readonly linnworks_application_secret: string;
  readonly linnworks_token: string;
  readonly linnworks_auth_url: string;
  readonly linnworks_default_server: string;
  readonly linnworks_token_ttl_minutes: number;
  readonly linnworks_catalog_page_size: number;
  readonly linnworks_orders_page_size: number;
  readonly linnworks_channel_batch_size: number;
  readonly linnworks_order_items_batch_size: number;
  readonly linnworks_timeout_ms: number;
  readonly linnworks_retry_attempts: number;
  readonly linnworks_retry_base_delay_ms: number;
  readonly linnworks_rate_limit_per_minute: number;
  readonly linnworks_daily_sync_cron: string;
}

export const APP_CONFIG_TOKEN = Symbol('IAppConfig');
