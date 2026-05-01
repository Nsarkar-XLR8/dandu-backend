import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';

/**
 * AuthSecurity Repository Interface (Port)
 */
export interface IAuthSecurityRepository {
  findByAuthId(authId: string): Promise<AuthSecurityData | null>;
  create(
    data: CreateAuthSecurityData,
    ctx?: ITransactionContext,
  ): Promise<AuthSecurityData>;
  updateFailedAttempts(
    authId: string,
    attempts: number,
    lockExpiresAt?: Date | null,
  ): Promise<void>;
  resetFailedAttempts(id: string): Promise<void>;
}

export interface AuthSecurityData {
  id: string;
  authId: string;
  failedAttempts: number;
  lastFailedAt: Date | null;
  lockExpiresAt: Date | null;
  mfaEnabled: boolean;
  lastPasswordChange: Date | null;
}

export interface CreateAuthSecurityData {
  authId: string;
  failedAttempts?: number;
  mfaEnabled?: boolean;
  lastPasswordChange?: Date;
}

export const AUTH_SECURITY_REPOSITORY_TOKEN = Symbol('IAuthSecurityRepository');
