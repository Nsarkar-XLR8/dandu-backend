import { Inject, Injectable } from '@nestjs/common';
import AppError from '../../../common/errors/app.error';
import { AppConfigService } from '../../../common/config/app-config.service';
import { CustomLoggerService } from '../../../common/services/custom-logger.service';
import { AUTH_CONFIG } from '../../config/auth.config';
import {
  CACHE_STORE_TOKEN,
  type ICacheStore,
} from '../../../common/domain/interfaces/cache-store.interface';
import { AUTH_USER_REPOSITORY_TOKEN } from '../../domain/repositories/auth-user.repository.interface';
import type { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.interface';
import { AuthUtilsService } from './auth-utils.service';
import type {
  ILoginResponse,
  IStoredRefreshToken,
  userRole,
} from '../../interfaces/auth.interface';

@Injectable()
export class TokenService {
  constructor(
    private readonly authUtilsService: AuthUtilsService,
    private readonly appConfig: AppConfigService,
    private readonly customLogger: CustomLoggerService,
    @Inject(CACHE_STORE_TOKEN)
    private readonly cacheStore: ICacheStore,
    @Inject(AUTH_USER_REPOSITORY_TOKEN)
    private readonly authUserRepo: IAuthUserRepository,
  ) {}

  /**
   * Create a new session for a user (generates tokens and stores them)
   */
  async createSession(
    user: { id: string; email: string; username: string; role: any; tokenVersion: number },
    meta: { ip: string; userAgent: string; device?: string },
  ): Promise<ILoginResponse> {
    const { ip, userAgent, device } = meta;

    // Distributed lock to prevent concurrent login race conditions
    const lockKey = `${this.appConfig.redis_cache_key_prefix}:lock:login:${user.id}`;
    const lockAcquired = await this.cacheStore.setNX(lockKey, '1', 5);

    if (!lockAcquired) {
      throw AppError.conflict(
        'Another session creation is in progress. Please try again in a moment.',
      );
    }

    try {
      const jti = this.authUtilsService.generateSecureId();

      const accessToken = this.authUtilsService.createAccessToken({
        userId: user.id,
        role: user.role as unknown as userRole,
        tokenVersion: user.tokenVersion,
      });

      const refreshToken = this.authUtilsService.createRefreshToken(
        { userId: user.id },
        jti,
      );

      const tokenHash = this.authUtilsService.hashToken(refreshToken);
      const refreshTokenTTL = this.authUtilsService.parseExpiryToSeconds(
        AUTH_CONFIG.TOKEN_EXPIRY.REFRESH,
      );

      const refreshTokenKey = `${this.appConfig.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.REFRESH_TOKEN}:${user.id}:${jti}`;

      const storedTokenData: IStoredRefreshToken = {
        userId: user.id,
        jti,
        tokenHash,
        ip,
        userAgent,
        device,
        createdAt: new Date().toISOString(),
      };

      // Store refresh token hash in Redis
      await this.cacheStore.set(
        refreshTokenKey,
        storedTokenData,
        refreshTokenTTL,
      );

      // Track session
      await this.addUserSession(user.id, jti, refreshTokenTTL);

      // Enforce max devices
      await this.enforceMaxDevices(
        user.id,
        AUTH_CONFIG.SESSION.MAX_DEVICES_PER_USER,
      ).catch((err) => {
        this.customLogger.warn(
          `Failed to enforce max devices for user ${user.id}: ${err.message}`,
          'TokenService',
        );
      });

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          verified: true, // If we're creating a session, they are verified (or it's OAuth)
        },
        expiresIn: this.authUtilsService.parseExpiryToSeconds(AUTH_CONFIG.TOKEN_EXPIRY.ACCESS),
      };
    } finally {
      await this.cacheStore.del(lockKey);
    }
  }

  /**
   * Refresh access token using rotation
   */
  async refreshToken(
    refreshToken: string,
    meta: { ip: string; userAgent: string; device?: string },
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const { ip, userAgent, device } = meta;

    let decoded: { userId: string; jti: string };
    try {
      const payload = this.authUtilsService.verifyRefreshToken(refreshToken);
      if (!payload.jti) throw new Error('Missing JTI');
      decoded = { userId: payload.userId, jti: payload.jti };
    } catch {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }

    const { userId, jti } = decoded;
    const refreshTokenKey = `${this.appConfig.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.REFRESH_TOKEN}:${userId}:${jti}`;
    const storedData = await this.cacheStore.get<IStoredRefreshToken>(refreshTokenKey);

    if (!storedData) {
      await this.revokeAllUserTokens(userId);
      throw AppError.unauthorized('Refresh token has been revoked');
    }

    if (storedData.tokenHash !== this.authUtilsService.hashToken(refreshToken)) {
      await this.revokeAllUserTokens(userId);
      throw AppError.unauthorized('Invalid refresh token');
    }

    const user = await this.authUserRepo.findByIdSelect(userId, {
      role: true,
      status: true,
      tokenVersion: true,
      email: true,
      username: true,
    });

    if (user?.status !== 'ACTIVE') {
      await this.revokeAllUserTokens(userId);
      throw AppError.unauthorized('User account is not active');
    }

    // Token Rotation
    const newJti = this.authUtilsService.generateSecureId();
    const newAccessToken = this.authUtilsService.createAccessToken({
      userId: user.id as string,
      role: user.role as unknown as userRole,
      tokenVersion: user.tokenVersion ?? 0,
    });

    const newRefreshToken = this.authUtilsService.createRefreshToken(
      { userId: user.id as string },
      newJti,
    );

    const newTokenHash = this.authUtilsService.hashToken(newRefreshToken);
    const refreshTokenTTL = this.authUtilsService.parseExpiryToSeconds(AUTH_CONFIG.TOKEN_EXPIRY.REFRESH);
    const newRefreshTokenKey = `${this.appConfig.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.REFRESH_TOKEN}:${userId}:${newJti}`;

    await this.cacheStore.set(newRefreshTokenKey, {
      userId,
      jti: newJti,
      tokenHash: newTokenHash,
      ip,
      userAgent,
      device,
      createdAt: new Date().toISOString(),
    }, refreshTokenTTL);

    await this.addUserSession(userId, newJti, refreshTokenTTL);
    await this.cacheStore.del(refreshTokenKey); // Remove old token

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.authUtilsService.parseExpiryToSeconds(AUTH_CONFIG.TOKEN_EXPIRY.ACCESS),
    };
  }

  async logout(refreshToken: string, userId: string): Promise<{ message: string }> {
    try {
      const payload = this.authUtilsService.verifyRefreshToken(refreshToken);
      if (payload.jti && payload.userId === userId) {
        const refreshTokenKey = `${this.appConfig.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.REFRESH_TOKEN}:${userId}:${payload.jti}`;
        await this.cacheStore.del(refreshTokenKey);
        
        // Remove from session list
        const sessionKey = `${this.appConfig.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.USER_SESSIONS}:${userId}`;
        const sessions = (await this.cacheStore.get<string[]>(sessionKey)) || [];
        const updatedSessions = sessions.filter((id) => id !== payload.jti);
        await this.cacheStore.set(sessionKey, updatedSessions);
      }
    } catch {
      // Ignore token verification errors during logout
    }

    return { message: 'Logged out successfully' };
  }

  async logoutAllDevices(userId: string): Promise<{ message: string }> {
    await this.revokeAllUserTokens(userId);
    return { message: 'Logged out from all devices successfully' };
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    const sessionKey = `${this.appConfig.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.USER_SESSIONS}:${userId}`;
    const sessions = (await this.cacheStore.get<string[]>(sessionKey)) || [];

    for (const jti of sessions) {
      const tokenKey = `${this.appConfig.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.REFRESH_TOKEN}:${userId}:${jti}`;
      await this.cacheStore.del(tokenKey);
    }

    await this.cacheStore.del(sessionKey);
    await this.incrementTokenVersion(userId);
  }

  async incrementTokenVersion(userId: string): Promise<void> {
    const current = await this.authUserRepo.findByIdSelect(userId, { tokenVersion: true });
    await this.authUserRepo.updateTokenVersion(userId, (current?.tokenVersion || 0) + 1);
    
    const cacheKey = `${this.appConfig.redis_cache_key_prefix}:token_version:${userId}`;
    await this.cacheStore.del(cacheKey);
  }

  private async addUserSession(userId: string, jti: string, ttl: number): Promise<void> {
    const sessionKey = `${this.appConfig.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.USER_SESSIONS}:${userId}`;
    const sessions = (await this.cacheStore.get<string[]>(sessionKey)) || [];
    if (!sessions.includes(jti)) {
      sessions.push(jti);
    }
    await this.cacheStore.set(sessionKey, sessions, ttl);
  }

  private async enforceMaxDevices(userId: string, maxDevices: number): Promise<void> {
    const sessionKey = `${this.appConfig.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.USER_SESSIONS}:${userId}`;
    const sessions = (await this.cacheStore.get<string[]>(sessionKey)) || [];

    if (sessions.length > maxDevices) {
      const sessionsToRemove = sessions.slice(0, sessions.length - maxDevices);
      for (const jti of sessionsToRemove) {
        const tokenKey = `${this.appConfig.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.REFRESH_TOKEN}:${userId}:${jti}`;
        await this.cacheStore.del(tokenKey);
      }
      const remainingSessions = sessions.slice(sessions.length - maxDevices);
      await this.cacheStore.set(sessionKey, remainingSessions);
    }
  }
}
