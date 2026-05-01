import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';
import { AuthUserEntity } from '../entities/auth-user.entity';

/**
 * AuthUser Repository Interface (Port)
 */
export interface IAuthUserRepository {
  findById(id: string): Promise<AuthUserEntity | null>;
  findByIdSelect(
    id: string,
    select: AuthUserSelect,
  ): Promise<Partial<AuthUserEntity> | null>;
  findByEmail(email: string): Promise<AuthUserEntity | null>;
  findByEmailWithSecurity(email: string): Promise<AuthUserWithSecurity | null>;
  findByProvider(
    provider: string,
    providerId: string,
  ): Promise<AuthUserEntity | null>;
  findByEmailOrUsername(
    email: string,
    username: string,
  ): Promise<AuthUserEntity | null>;
  save(
    entity: AuthUserEntity,
    ctx?: ITransactionContext,
  ): Promise<AuthUserEntity>;
  updateTokenVersion(id: string, version: number): Promise<void>;
  updateVerified(
    id: string,
    verified: boolean,
    ctx?: ITransactionContext,
  ): Promise<void>;
}

export interface AuthUserSelect {
  id?: boolean;
  role?: boolean;
  status?: boolean;
  tokenVersion?: boolean;
  email?: boolean;
  username?: boolean;
}

export interface AuthUserWithSecurity {
  user: AuthUserEntity;
  security: {
    id: string;
    failedAttempts: number;
    lastFailedAt: Date | null;
    lockExpiresAt: Date | null;
  } | null;
}

export const AUTH_USER_REPOSITORY_TOKEN = Symbol('IAuthUserRepository');
