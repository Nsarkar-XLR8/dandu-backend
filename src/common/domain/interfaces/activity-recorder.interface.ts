import {
  ActivityLogMetadata,
  FieldChange,
} from '../repositories/activity-log.repository.interface';
import { ITransactionContext } from './unit-of-work.interface';

export interface IActivityRecorder {
  logCreate(
    tableName: string,
    recordId: string,
    fields: Record<string, unknown>,
    metadata: ActivityLogMetadata,
    tx?: ITransactionContext,
  ): Promise<unknown>;

  logUpdate(
    tableName: string,
    recordId: string,
    oldData: Record<string, unknown>,
    newData: Record<string, unknown>,
    metadata: ActivityLogMetadata,
    tx?: ITransactionContext,
  ): Promise<unknown>;

  logDelete(
    tableName: string,
    recordId: string,
    deletedData: Record<string, unknown>,
    metadata: ActivityLogMetadata,
    tx?: ITransactionContext,
  ): Promise<unknown>;

  logCustomEvent(
    tableName: string,
    recordId: string,
    eventType: 'login' | 'logout' | 'password_change' | 'profile_update',
    metadata: ActivityLogMetadata,
    changes?: FieldChange[],
    tx?: ITransactionContext,
  ): Promise<unknown>;
}

export const ACTIVITY_RECORDER_TOKEN = Symbol('IActivityRecorder');
