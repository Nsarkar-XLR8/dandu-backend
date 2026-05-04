export interface IAppConfig {
  readonly jwt_access_secret: string;
  readonly jwt_refresh_secret: string;
  readonly redis_cache_key_prefix: string;
}

export const APP_CONFIG_TOKEN = Symbol('IAppConfig');
