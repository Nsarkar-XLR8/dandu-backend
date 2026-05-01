import { Injectable } from '@nestjs/common';
import { AuthSecurity } from '@prisma/client';
import { PrismaService } from '../../../common/services/prisma.service';
import { PrismaErrorMapper } from '../../../common/infrastructure/persistence/prisma-error.mapper';
import { PrismaTransactionContext } from '../../../common/infrastructure/persistence/prisma-unit-of-work';
import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';
import {
  IAuthSecurityRepository,
  AuthSecurityData,
  CreateAuthSecurityData,
} from '../../domain/repositories/auth-security.repository.interface';

@Injectable()
export class PrismaAuthSecurityRepository implements IAuthSecurityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByAuthId(authId: string): Promise<AuthSecurityData | null> {
    const r = await this.prisma.authSecurity.findUnique({ where: { authId } });
    return r ? this.map(r) : null;
  }

  async create(
    data: CreateAuthSecurityData,
    ctx?: ITransactionContext,
  ): Promise<AuthSecurityData> {
    const cl = ctx ? (ctx as PrismaTransactionContext).prisma : this.prisma;
    try {
      const r = await cl.authSecurity.create({
        data: {
          authUser: { connect: { id: data.authId } },
          failedAttempts: data.failedAttempts ?? 0,
          mfaEnabled: data.mfaEnabled ?? false,
          lastPasswordChange: data.lastPasswordChange ?? new Date(),
        },
      });
      return this.map(r);
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'AuthSecurity');
    }
  }

  async updateFailedAttempts(
    authId: string,
    attempts: number,
    lockExpiresAt?: Date | null,
  ): Promise<void> {
    try {
      await this.prisma.authSecurity.update({
        where: { authId },
        data: {
          failedAttempts: attempts,
          lastFailedAt: new Date(),
          ...(lockExpiresAt !== undefined && { lockExpiresAt }),
        },
      });
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'AuthSecurity');
    }
  }

  async resetFailedAttempts(id: string): Promise<void> {
    try {
      await this.prisma.authSecurity.update({
        where: { id },
        data: { failedAttempts: 0, lastFailedAt: null, lockExpiresAt: null },
      });
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'AuthSecurity');
    }
  }

  private map(p: AuthSecurity): AuthSecurityData {
    return {
      id: p.id,
      authId: p.authId,
      failedAttempts: p.failedAttempts,
      lastFailedAt: p.lastFailedAt,
      lockExpiresAt: p.lockExpiresAt,
      mfaEnabled: p.mfaEnabled,
      lastPasswordChange: p.lastPasswordChange,
    };
  }
}
