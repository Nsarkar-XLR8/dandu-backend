import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import { EmailType, EmailStatus } from '@prisma/client';
import { PrismaTransactionContext } from '../../../common/infrastructure/persistence/prisma-unit-of-work';
import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';
import {
  IEmailHistoryRepository,
  CreateEmailHistoryData,
} from '../../domain/repositories/email-history.repository.interface';

@Injectable()
export class PrismaEmailHistoryRepository implements IEmailHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: CreateEmailHistoryData,
    ctx?: ITransactionContext,
  ): Promise<void> {
    const cl = ctx ? (ctx as PrismaTransactionContext).prisma : this.prisma;
    await cl.emailHistory.create({
      data: {
        authUser: { connect: { id: data.authId } },
        emailTo: data.emailTo,
        emailType: data.emailType,
        subject: data.subject,
        messageId: data.messageId,
        emailStatus: data.emailStatus as EmailStatus,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }

  async updateStatusByAuth(
    authId: string,
    emailType: string,
    oldStatus: string,
    newStatus: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.emailHistory.updateMany({
      where: {
        authId,
        emailType: emailType as EmailType,
        emailStatus: oldStatus as EmailStatus,
      },
      data: {
        emailStatus: newStatus as EmailStatus,
        ...(errorMessage && { errorMessage }),
      },
    });
  }
}
