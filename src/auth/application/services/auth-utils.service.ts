import {
  IAccessTokenPayload,
  IRefreshTokenPayload,
  ITokenPayload,
  userRole,
} from '../../interfaces/auth.interface';
import { AUTH_POLICY } from '../policies/auth.policy';
import AppError from '../../../common/errors/app.error';
import crypto from 'crypto';
import type { ICacheStore } from '../../../common/domain/interfaces/cache-store.interface';
import type { IAppConfig } from '../../../common/domain/interfaces/app-config.interface';
import {
  type ITokenSigner,
  type TokenSignOptions,
} from '../../../common/domain/interfaces/token-signer.interface';

interface TokenOptions {
  isRefresh?: boolean;
  expiresIn?: TokenSignOptions['expiresIn'];
}

type VerifiedToken<T extends object> = T & {
  iat?: number;
  exp?: number;
  jti?: string;
};

/**
 * Authentication Utility Service
 * Provides various authentication-related utilities
 */
export class AuthUtilsService {
  constructor(
    private readonly cacheStore: ICacheStore,
    private readonly appConfig: IAppConfig,
    private readonly tokenSigner: ITokenSigner,
  ) {}

  /**
   * Generates a cryptographically secure random ID
   * Used for JTI (JWT ID) to prevent collisions
   */
  generateSecureId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generates a random verification code
   */
  generateVerificationCode = (): string => {
    return crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
  };

  /**
   * Hash a token using SHA-256 for secure storage
   * Never store raw tokens - only hashes
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Creates an access token (stateless, minimal payload)
   */
  createAccessToken(
    payload: IAccessTokenPayload,
    expiresIn?: TokenSignOptions['expiresIn'],
  ): string {
    const secret = this.appConfig.jwt_access_secret;
    if (!secret) {
      throw AppError.internalServerError('JWT access secret is not configured');
    }

    const signOptions: TokenSignOptions = {
      expiresIn: expiresIn || AUTH_POLICY.TOKEN_EXPIRY.ACCESS,
      algorithm: 'HS256',
    };

    return this.tokenSigner.sign({ ...payload }, secret, signOptions);
  }

  /**
   * Creates a refresh token with JTI for revocation capability
   */
  createRefreshToken(
    payload: IRefreshTokenPayload,
    jti: string,
    expiresIn?: TokenSignOptions['expiresIn'],
  ): string {
    const secret = this.appConfig.jwt_refresh_secret;
    if (!secret) {
      throw AppError.internalServerError(
        'JWT refresh secret is not configured',
      );
    }

    const signOptions: TokenSignOptions = {
      expiresIn: expiresIn || AUTH_POLICY.TOKEN_EXPIRY.REFRESH,
      algorithm: 'HS256',
      jwtid: jti, // Embed JTI in JWT standard claim
    };

    return this.tokenSigner.sign({ ...payload }, secret, signOptions);
  }

  /**
   * @deprecated Use createAccessToken or createRefreshToken
   * Creates a JWT token with proper options
   */
  createToken(payload: ITokenPayload, options: TokenOptions = {}): string {
    const { isRefresh = false, expiresIn } = options;
    const secret = isRefresh
      ? this.appConfig.jwt_refresh_secret
      : this.appConfig.jwt_access_secret;
    const defaultExpiry = isRefresh ? '7d' : '1h';

    const signOptions: TokenSignOptions = {
      expiresIn: expiresIn || defaultExpiry,
      algorithm: 'HS256',
    };

    if (!secret) {
      throw AppError.internalServerError('JWT secret is not configured');
    }

    return this.tokenSigner.sign({ ...payload }, secret, signOptions);
  }

  /**
   * Verifies an access token
   */
  verifyAccessToken(token: string): VerifiedToken<IAccessTokenPayload> {
    const secret = this.appConfig.jwt_access_secret;
    if (!secret) {
      throw AppError.internalServerError('JWT access secret is not configured');
    }
    return this.tokenSigner.verify<VerifiedToken<IAccessTokenPayload>>(
      token,
      secret,
    );
  }

  /**
   * Verifies a refresh token and returns payload with JTI
   */
  verifyRefreshToken(token: string): VerifiedToken<IRefreshTokenPayload> {
    const secret = this.appConfig.jwt_refresh_secret;
    if (!secret) {
      throw AppError.internalServerError(
        'JWT refresh secret is not configured',
      );
    }
    return this.tokenSigner.verify<VerifiedToken<IRefreshTokenPayload>>(
      token,
      secret,
    );
  }

  /**
   * @deprecated Use verifyAccessToken or verifyRefreshToken
   * Verifies a JWT token
   */
  verifyToken(token: string): VerifiedToken<Record<string, unknown>> {
    const secret = this.appConfig.jwt_access_secret;
    if (!secret) {
      throw AppError.internalServerError('JWT secret is not configured');
    }
    return this.tokenSigner.verify<VerifiedToken<Record<string, unknown>>>(
      token,
      secret,
    );
  }

  /**
   * Checks rate limiting for operations
   */
  async checkRateLimit(
    key: string,
    maxAttempts: number,
    windowMs: number,
  ): Promise<boolean> {
    const cacheKey = `${this.appConfig.redis_cache_key_prefix}:${AUTH_POLICY.CACHE_PREFIXES.RATE_LIMIT}${key}`;
    const lockKey = `${cacheKey}:locked`;

    // First check if we're in a locked state
    const isLocked = await this.cacheStore.exists(lockKey);
    if (isLocked) {
      throw AppError.tooManyRequests(
        `Rate limit exceeded. Please try again after ${windowMs / 1000} seconds.`,
      );
    }

    // Use Redis INCR to atomically increment the counter
    const currentAttempts = await this.cacheStore.incr(cacheKey);

    // Set expiry on first attempt
    if (currentAttempts === 1) {
      await this.cacheStore.expire(cacheKey, windowMs / 1000);
    }

    if (currentAttempts && currentAttempts > maxAttempts) {
      // Set a lock with TTL instead of continuing to increment
      await this.cacheStore.set(lockKey, '1', windowMs / 1000);
      throw AppError.tooManyRequests(
        `Rate limit exceeded. Please try again after ${windowMs / 1000} seconds.`,
      );
    }

    return true;
  }

  /**
   * Validates password strength
   */
  validatePassword(password: string): boolean {
    const { PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS } = AUTH_POLICY;

    if (password.length < PASSWORD_MIN_LENGTH) {
      return false;
    }

    if (PASSWORD_REQUIREMENTS.UPPERCASE && !/[A-Z]/.test(password)) {
      return false;
    }

    if (PASSWORD_REQUIREMENTS.LOWERCASE && !/[a-z]/.test(password)) {
      return false;
    }

    if (PASSWORD_REQUIREMENTS.NUMBERS && !/\d/.test(password)) {
      return false;
    }

    if (
      PASSWORD_REQUIREMENTS.SPECIAL_CHARS &&
      !/[!@#$%^&*(),.?":{}|<>]/.test(password)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Checks if a user can modify another user's role based on role hierarchy
   */
  canModifyRole(
    currentUserRole: userRole,
    targetUserRole: userRole,
    newRole: userRole,
  ): boolean {
    const { ROLE_HIERARCHY } = AUTH_POLICY;

    // Super admin can modify any role except other super admins
    if (currentUserRole === userRole.SUPER_ADMIN) {
      return (
        targetUserRole !== userRole.SUPER_ADMIN &&
        newRole !== userRole.SUPER_ADMIN
      );
    }

    // Admin can only modify moderator and customer roles
    if (currentUserRole === userRole.ADMIN) {
      const targetRoleLevel =
        ROLE_HIERARCHY[targetUserRole as keyof typeof ROLE_HIERARCHY] || 0;
      const newRoleLevel =
        ROLE_HIERARCHY[newRole as keyof typeof ROLE_HIERARCHY] || 0;
      const adminLevel = ROLE_HIERARCHY[userRole.ADMIN];

      return targetRoleLevel < adminLevel && newRoleLevel < adminLevel;
    }

    // Moderator can only modify customer roles
    if (currentUserRole === userRole.MODERATOR) {
      return (
        targetUserRole === userRole.CUSTOMER && newRole === userRole.CUSTOMER
      );
    }

    // Customer cannot modify any roles
    if (currentUserRole === userRole.CUSTOMER) {
      return false;
    }

    return false;
  }

  /**
   * Parse token expiry string to seconds
   */
  parseExpiryToSeconds(expiry: string): number {
    const match = /^(\d+)([smhd])?$/.exec(expiry);
    if (!match) {
      return 3600;
    }

    const value = Number.parseInt(match[1], 10);
    const unit = match[2] || 's';

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 60 * 60 * 24;
      default:
        return value;
    }
  }
}
