import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';

/**
 * LoginHistory Repository Interface (Port)
 */
export interface ILoginHistoryRepository {
  create(
    data: CreateLoginHistoryData,
    ctx?: ITransactionContext,
  ): Promise<void>;
}

export interface CreateLoginHistoryData {
  authId: string;
  ipAddress: string;
  userAgent: string;
  device_id?: string;
  action: 'login' | 'logout';
  success: boolean;
  failureReason?: string;
  attemptNumber?: number;
  isSuspicious?: boolean;
  requestId?: string;
}

export const LOGIN_HISTORY_REPOSITORY_TOKEN = Symbol('ILoginHistoryRepository');
