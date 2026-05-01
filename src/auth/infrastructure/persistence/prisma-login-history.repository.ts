import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import { PrismaTransactionContext } from '../../../common/infrastructure/persistence/prisma-unit-of-work';
import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';
import {
  ILoginHistoryRepository,
  CreateLoginHistoryData,
} from '../../domain/repositories/login-history.repository.interface';

@Injectable()
export class PrismaLoginHistoryRepository implements ILoginHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: CreateLoginHistoryData,
    ctx?: ITransactionContext,
  ): Promise<void> {
    const cl = ctx ? (ctx as PrismaTransactionContext).prisma : this.prisma;
    await cl.loginHistory.create({
      data: {
        authUser: { connect: { id: data.authId } },
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        device_id: data.device_id,
        action: data.action,
        success: data.success,
        failureReason: data.failureReason,
        attemptNumber: data.attemptNumber ?? 1,
        isSuspicious: data.isSuspicious ?? false,
        requestId: data.requestId,
      },
    });
  }
}
