import { Injectable } from '@nestjs/common';
import { EventType, ActionType } from '@prisma/client';
import { PrismaService } from '../../services/prisma.service';
import { PrismaTransactionContext } from './prisma-unit-of-work';
import { ITransactionContext } from '../../domain/interfaces/unit-of-work.interface';
import {
  IActivityLogRepository,
  ActivityLogParams,
} from '../../domain/repositories/activity-log.repository.interface';

@Injectable()
export class PrismaActivityLogRepository implements IActivityLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async logActivity(
    params: ActivityLogParams,
    ctx?: ITransactionContext,
  ): Promise<void> {
    const cl = ctx ? (ctx as PrismaTransactionContext).prisma : this.prisma;
    const {
      tableName,
      recordId,
      action,
      eventType,
      changes = [],
      metadata,
    } = params;

    await cl.activityLogEvent.create({
      data: {
        tableName,
        recordId,
        action: action as ActionType,
        eventType: (eventType || action) as EventType,
        actionedBy: metadata.actionedBy || null,
        ipAddress: metadata.ip,
        userAgent: metadata.userAgent,
        device: metadata.device,
        requestId: metadata.requestId,
        details:
          changes.length > 0
            ? {
                create: changes.map((c) => ({
                  fieldName: c.fieldName,
                  oldValue: c.oldValue,
                  newValue: c.newValue,
                })),
              }
            : undefined,
      },
    });
  }
}
