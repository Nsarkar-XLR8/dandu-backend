import 'dotenv/config';

interface AppConfig {
  jwt_access_secret: string;
  jwt_refresh_secret: string;
  redis_cache_key_prefix: string;
  rate_limit_enabled: boolean;
  node_env: string;
  port: number;
  email_host: string;
  email_port: number;
  email_user: string;
  email_pass: string;
  email_from: string;
  // Google OAuth
  google_client_id: string;
  google_client_secret: string;
  google_redirect_uri: string;
  cors_origins: string[];
  linnworks_application_id: string;
  linnworks_application_secret: string;
  linnworks_token: string;
  linnworks_auth_url: string;
  linnworks_default_server: string;
  linnworks_token_ttl_minutes: number;
  linnworks_catalog_page_size: number;
  linnworks_orders_page_size: number;
  linnworks_channel_batch_size: number;
  linnworks_order_items_batch_size: number;
  linnworks_timeout_ms: number;
  linnworks_retry_attempts: number;
  linnworks_retry_base_delay_ms: number;
  linnworks_rate_limit_per_minute: number;
  linnworks_daily_sync_cron: string;
}

const parseCsv = (value?: string): string[] =>
  value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

export const resolveLinnworksToken = (
  env: Partial<Pick<NodeJS.ProcessEnv, 'LINNWORKS_TOKEN' | 'LINNWORKS_AUTH_TOKEN' | 'LINNWORKS_INSTALLATION_ID'>> = process.env,
): string =>
  env.LINNWORKS_TOKEN || env.LINNWORKS_AUTH_TOKEN || env.LINNWORKS_INSTALLATION_ID || '';

const config: AppConfig = {
  jwt_access_secret:
    process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || '',
  jwt_refresh_secret:
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || '',
  redis_cache_key_prefix: process.env.REDIS_CACHE_KEY_PREFIX || 'app',
  rate_limit_enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  node_env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  email_host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  email_port: parseInt(process.env.EMAIL_PORT || '587', 10),
  email_user: process.env.EMAIL_USER || '',
  email_pass: process.env.EMAIL_PASS || '',
  email_from: process.env.EMAIL_FROM || process.env.EMAIL_USER || '',
  // Google OAuth
  google_client_id: process.env.GOOGLE_CLIENT_ID || '',
  google_client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
  google_redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
  cors_origins: parseCsv(process.env.CORS_ORIGINS || 'http://localhost:5173,https://dandu-frontend.vercel.app'),
  linnworks_application_id: process.env.LINNWORKS_APPLICATION_ID || '',
  linnworks_application_secret: process.env.LINNWORKS_APPLICATION_SECRET || '',
  linnworks_token: resolveLinnworksToken(),
  linnworks_auth_url:
    process.env.LINNWORKS_AUTH_URL ||
    'https://api.linnworks.net/api/Auth/AuthorizeByApplication',
  linnworks_default_server:
    process.env.LINNWORKS_DEFAULT_SERVER || 'https://us-ext.linnworks.net',
  linnworks_token_ttl_minutes: parseInt(
    process.env.LINNWORKS_TOKEN_TTL_MINUTES || '30',
    10,
  ),
  linnworks_catalog_page_size: parseInt(
    process.env.LINNWORKS_CATALOG_PAGE_SIZE || '200',
    10,
  ),
  linnworks_orders_page_size: parseInt(
    process.env.LINNWORKS_ORDERS_PAGE_SIZE || '200',
    10,
  ),
  linnworks_channel_batch_size: parseInt(
    process.env.LINNWORKS_CHANNEL_BATCH_SIZE || '100',
    10,
  ),
  linnworks_order_items_batch_size: parseInt(
    process.env.LINNWORKS_ORDER_ITEMS_BATCH_SIZE || '50',
    10,
  ),
  linnworks_timeout_ms: parseInt(process.env.LINNWORKS_TIMEOUT_MS || '30000', 10),
  linnworks_retry_attempts: parseInt(
    process.env.LINNWORKS_RETRY_ATTEMPTS || '3',
    10,
  ),
  linnworks_retry_base_delay_ms: parseInt(
    process.env.LINNWORKS_RETRY_BASE_DELAY_MS || '500',
    10,
  ),
  linnworks_rate_limit_per_minute: parseInt(
    process.env.LINNWORKS_RATE_LIMIT_PER_MINUTE || '145',
    10,
  ),
  linnworks_daily_sync_cron: process.env.LINNWORKS_DAILY_SYNC_CRON || '0 3 * * *',
};

export default config;
