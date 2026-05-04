import AppError from '../../../common/errors/app.error';
import type { IAppConfig } from '../../../common/domain/interfaces/app-config.interface';
import type { ICacheStore } from '../../../common/domain/interfaces/cache-store.interface';
import {
  type ITokenSigner,
  TokenVerificationException,
  TokenVerificationFailureReason,
} from '../../../common/domain/interfaces/token-signer.interface';
import type { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.interface';

export interface AuthenticatedPrincipal {
  userId: string;
  role: string;
  tokenVersion: number;
}

interface AccessTokenPayload {
  userId: string;
  role: string;
  tokenVersion: number;
}

export class AccessTokenAuthenticator {
  constructor(
    private readonly tokenSigner: ITokenSigner,
    private readonly appConfig: IAppConfig,
    private readonly cacheStore: ICacheStore,
    private readonly authUserRepo: IAuthUserRepository,
  ) {}

  async authenticate(accessToken: string): Promise<AuthenticatedPrincipal> {
    let payload: AccessTokenPayload;

    try {
      payload = this.tokenSigner.verify<AccessTokenPayload>(
        accessToken,
        this.appConfig.jwt_access_secret,
      );
    } catch (error) {
      if (error instanceof TokenVerificationException) {
        throw AppError.unauthorized(
          error.reason === TokenVerificationFailureReason.EXPIRED
            ? 'Token has expired'
            : 'Invalid token',
        );
      }
      throw AppError.unauthorized('Authentication failed');
    }

    const currentVersion = await this.getTokenVersion(payload.userId);

    if (currentVersion !== payload.tokenVersion) {
      throw AppError.unauthorized('Token has been revoked. Please login again.');
    }

    return {
      userId: payload.userId,
      role: payload.role,
      tokenVersion: payload.tokenVersion,
    };
  }

  private async getTokenVersion(userId: string): Promise<number> {
    const cacheKey = `${this.appConfig.redis_cache_key_prefix}:token_version:${userId}`;
    const cachedVersion = await this.cacheStore.get<number>(cacheKey);

    if (cachedVersion !== null && cachedVersion !== undefined) {
      return cachedVersion;
    }

    const user = await this.authUserRepo.findByIdSelect(userId, {
      tokenVersion: true,
      status: true,
    });

    if (!user) {
      throw AppError.unauthorized('User not found');
    }

    if (user.status !== 'ACTIVE') {
      throw AppError.unauthorized('User account is not active');
    }

    await this.cacheStore.set(cacheKey, user.tokenVersion, 3600);

    return user.tokenVersion as number;
  }
}
