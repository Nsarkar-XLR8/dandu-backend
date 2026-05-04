export const AUTH_POLICY = {
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_REQUIREMENTS: {
    UPPERCASE: true,
    LOWERCASE: true,
    NUMBERS: true,
    SPECIAL_CHARS: true,
  },
  TOKEN_EXPIRY: {
    ACCESS: '15m',
    REFRESH: '7d',
    VERIFICATION: '24h',
    PASSWORD_RESET: '1h',
  },
  RATE_LIMIT: {
    LOGIN_MAX_ATTEMPTS: 5,
    LOGIN_WINDOW_MS: 15 * 60 * 1000,
    PASSWORD_RESET_MAX_ATTEMPTS: 3,
    PASSWORD_RESET_WINDOW_MS: 60 * 60 * 1000,
  },
  ACCOUNT_LOCKOUT: {
    MAX_FAILED_ATTEMPTS: 5,
    LOCKOUT_DURATION_MS: 30 * 60 * 1000,
  },
  SESSION: {
    MAX_DEVICES_PER_USER: 5,
  },
  ROLE_HIERARCHY: {
    CUSTOMER: 1,
    MODERATOR: 2,
    ADMIN: 3,
    SUPER_ADMIN: 4,
  },
  CACHE_PREFIXES: {
    ACCESS_TOKEN: 'access_token',
    REFRESH_TOKEN: 'refresh:user',
    USER_SESSIONS: 'sessions:user',
    RATE_LIMIT: 'rate_limit:',
    VERIFICATION_TOKEN: 'verification_token',
    PASSWORD_RESET_TOKEN: 'password_reset_token',
    TOKEN_BLACKLIST: 'token_blacklist',
  },
} as const;
