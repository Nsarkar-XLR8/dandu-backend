import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';

/**
 * EmailHistory Repository Interface (Port)
 */
export interface IEmailHistoryRepository {
  create(
    data: CreateEmailHistoryData,
    ctx?: ITransactionContext,
  ): Promise<void>;
  updateStatusByAuth(
    authId: string,
    emailType: string,
    oldStatus: string,
    newStatus: string,
    errorMessage?: string,
  ): Promise<void>;
}

export interface CreateEmailHistoryData {
  authId: string;
  emailTo: string;
  emailType: 'verification' | 'password_reset' | 'notification';
  subject: string;
  messageId: string;
  emailStatus: string;
  ipAddress?: string;
  userAgent?: string;
}

export const EMAIL_HISTORY_REPOSITORY_TOKEN = Symbol('IEmailHistoryRepository');
