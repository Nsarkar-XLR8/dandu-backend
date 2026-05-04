export const GOOGLE_OAUTH_POLICY = {
  STATE: {
    TTL_SECONDS: 600,
    CACHE_PREFIX: 'google_oauth_state',
  },
} as const;
