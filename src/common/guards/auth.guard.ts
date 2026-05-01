import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import {
  CACHE_STORE_TOKEN,
  type ICacheStore,
} from '../domain/interfaces/cache-store.interface';
import { AppConfigService } from '../config/app-config.service';
import { AUTH_USER_REPOSITORY_TOKEN } from '../../auth/domain/repositories/auth-user.repository.interface';
import type { IAuthUserRepository } from '../../auth/domain/repositories/auth-user.repository.interface';

interface IAccessTokenPayload {
  userId: string;
  role: string;
  tokenVersion: number;
}

/**
 * AuthGuard — Verifies JWT access tokens and validates tokenVersion.
 *
 * Refactored to use IAuthUserRepository port instead of PrismaService directly.
 * This maintains the hexagonal architecture pattern where guards (infrastructure)
 * access the database through repository ports.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(CACHE_STORE_TOKEN)
    private readonly cacheStore: ICacheStore,
    private readonly appConfig: AppConfigService,
    @Inject(AUTH_USER_REPOSITORY_TOKEN)
    private readonly authUserRepo: IAuthUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No token found');
    }

    try {
      const payload = jwt.verify(
        token,
        this.appConfig.jwt_access_secret,
      ) as IAccessTokenPayload;

      // Step 2: Check tokenVersion (hybrid - Redis first, DB fallback)
      const currentVersion = await this.getTokenVersion(payload.userId);

      if (currentVersion !== payload.tokenVersion) {
        throw new UnauthorizedException(
          'Token has been revoked. Please login again.',
        );
      }

      // Attach user to request for downstream use
      Object.assign(request, { user: payload });

      return true;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Token has expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedException('Invalid token');
      }
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Authentication failed');
    }
  }

  /**
   * Get token version with Redis cache
   * Fast path: Redis lookup (~1-2ms)
   * Slow path: DB lookup + cache (~10-20ms, only on cache miss)
   */
  private async getTokenVersion(userId: string): Promise<number> {
    const cacheKey = `${this.appConfig.redis_cache_key_prefix}:token_version:${userId}`;

    // Try Redis first (fast path - most common)
    const cachedVersion = await this.cacheStore.get<number>(cacheKey);
    if (cachedVersion !== null && cachedVersion !== undefined) {
      return cachedVersion;
    }

    // Fallback to DB via repository (slow path - only on cache miss)
    const user = await this.authUserRepo.findByIdSelect(userId, {
      tokenVersion: true,
      status: true,
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }

    // Cache for 1 hour (or until security event invalidates it)
    await this.cacheStore.set(cacheKey, user.tokenVersion, 3600);

    return user.tokenVersion as number;
  }

  /**
   * Extract token from Authorization header
   * Format: Bearer <token>
   */
  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }

  /**
   * Extract token from cookies (alternative method)
   */
  private extractTokenFromCookies(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.accessToken;
  }
}
