export interface ICacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean>;
  setNX<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<boolean>;
  incr(key: string, increment?: number): Promise<number | null>;
  expire(key: string, seconds: number): Promise<boolean>;
}

export const CACHE_STORE_TOKEN = Symbol('ICacheStore');
