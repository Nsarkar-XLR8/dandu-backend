import { Injectable, Inject } from '@nestjs/common';
import { CustomLoggerService } from './custom-logger.service';
import {
  ACTIVITY_LOG_REPOSITORY_TOKEN,
  ActivityLogMetadata,
  FieldChange,
} from '../domain/repositories/activity-log.repository.interface';
import type { IActivityLogRepository } from '../domain/repositories/activity-log.repository.interface';
import { IActivityRecorder } from '../domain/interfaces/activity-recorder.interface';
import { ITransactionContext } from '../domain/interfaces/unit-of-work.interface';

export type {
  ActivityLogMetadata,
  FieldChange,
} from '../domain/repositories/activity-log.repository.interface';

/**
 * Activity Log Service
 *
 * Convenience service that wraps the IActivityLogRepository with
 * higher-level methods (logCreate, logUpdate, logDelete, logCustomEvent).
 *
 * This service works through the repository port so application code does not
 * construct persistence adapters directly.
 */
@Injectable()
export class ActivityLogService implements IActivityRecorder {
  constructor(
    private readonly customLogger: CustomLoggerService,
    @Inject(ACTIVITY_LOG_REPOSITORY_TOKEN)
    private readonly repo: IActivityLogRepository,
  ) {}

  async logCreate(
    tableName: string,
    recordId: string,
    fields: Record<string, any>,
    metadata: ActivityLogMetadata,
    tx?: any, // backward compat — ignored, use ctx-based approach in new code
  ) {
    const changes: FieldChange[] = Object.entries(fields).map(
      ([key, value]) => ({
        fieldName: key,
        oldValue: null,
        newValue: String(value),
      }),
    );
    // For backward compat with tx, wrap in a pseudo-context
    const ctx = tx ? this.wrapTx(tx) : undefined;
    return this.repo.logActivity(
      {
        tableName,
        recordId,
        action: 'create',
        eventType: 'create',
        changes,
        metadata,
      },
      ctx,
    );
  }

  async logUpdate(
    tableName: string,
    recordId: string,
    oldData: Record<string, unknown>,
    newData: Record<string, unknown>,
    metadata: ActivityLogMetadata,
    tx?: any,
  ) {
    const changes: FieldChange[] = [];
    for (const [key, newValue] of Object.entries(newData)) {
      const oldValue: unknown = oldData[key];
      if (oldValue !== newValue) {
        changes.push({
          fieldName: key,
          oldValue: this.toLogValue(oldValue),
          newValue: this.toLogValue(newValue),
        });
      }
    }
    if (changes.length === 0) return null;

    const ctx = tx ? this.wrapTx(tx) : undefined;
    return this.repo.logActivity(
      {
        tableName,
        recordId,
        action: 'update',
        eventType: 'update',
        changes,
        metadata,
      },
      ctx,
    );
  }

  async logDelete(
    tableName: string,
    recordId: string,
    deletedData: Record<string, any>,
    metadata: ActivityLogMetadata,
    tx?: any,
  ) {
    const changes: FieldChange[] = Object.entries(deletedData).map(
      ([key, value]) => ({
        fieldName: key,
        oldValue: String(value),
        newValue: null,
      }),
    );
    const ctx = tx ? this.wrapTx(tx) : undefined;
    return this.repo.logActivity(
      {
        tableName,
        recordId,
        action: 'delete',
        eventType: 'delete',
        changes,
        metadata,
      },
      ctx,
    );
  }

  async logCustomEvent(
    tableName: string,
    recordId: string,
    eventType: 'login' | 'logout' | 'password_change' | 'profile_update',
    metadata: ActivityLogMetadata,
    changes?: FieldChange[],
    tx?: any,
  ) {
    const actionMap = {
      login: 'update',
      logout: 'update',
      password_change: 'update',
      profile_update: 'update',
    } as const;
    const ctx = tx ? this.wrapTx(tx) : undefined;
    return this.repo.logActivity(
      {
        tableName,
        recordId,
        action: actionMap[eventType],
        eventType,
        changes,
        metadata,
      },
      ctx,
    );
  }

  /**
   * Backward compat: wraps a raw Prisma TransactionClient into our ITransactionContext.
   * This allows modules that haven't been refactored yet (Auth) to still pass `tx` directly.
   */
  private wrapTx(tx: unknown): ITransactionContext & { prisma: unknown } {
    return { __brand: 'TransactionContext' as const, prisma: tx };
  }

  private toLogValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable]';
    }
  }
}
