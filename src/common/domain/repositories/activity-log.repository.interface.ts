import { ITransactionContext } from '../interfaces/unit-of-work.interface';

/**
 * Activity Log Repository Interface (Port)
 */
export interface IActivityLogRepository {
  logActivity(
    params: ActivityLogParams,
    ctx?: ITransactionContext,
  ): Promise<void>;
}

export interface ActivityLogParams {
  tableName: string;
  recordId: string;
  action: 'create' | 'update' | 'delete';
  eventType?: string;
  changes?: FieldChange[];
  metadata: ActivityLogMetadata;
}

export interface ActivityLogMetadata {
  ip?: string;
  userAgent?: string;
  actionedBy?: string | null;
  device?: string;
  requestId?: string;
}

export interface FieldChange {
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
}

export const ACTIVITY_LOG_REPOSITORY_TOKEN = Symbol('IActivityLogRepository');
