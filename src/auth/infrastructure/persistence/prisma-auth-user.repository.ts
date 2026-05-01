import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/services/prisma.service';
import { PrismaErrorMapper } from '../../../common/infrastructure/persistence/prisma-error.mapper';
import { PrismaTransactionContext } from '../../../common/infrastructure/persistence/prisma-unit-of-work';
import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';
import {
  IAuthUserRepository,
  AuthUserSelect,
  AuthUserWithSecurity,
} from '../../domain/repositories/auth-user.repository.interface';
import { AuthUser as PrismaAuthUser } from '@prisma/client';
import { AuthUserEntity } from '../../domain/entities/auth-user.entity';

@Injectable()
export class PrismaAuthUserRepository implements IAuthUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<AuthUserEntity | null> {
    try {
      const u = await this.prisma.authUser.findUnique({ where: { id } });
      return u ? this.map(u) : null;
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'AuthUser');
    }
  }

  async findByIdSelect(
    id: string,
    select: AuthUserSelect,
  ): Promise<Partial<AuthUserEntity> | null> {
    try {
      const u = await this.prisma.authUser.findUnique({
        where: { id },
        select: { id: true, ...select },
      });
      return u as Partial<AuthUserEntity> | null;
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'AuthUser');
    }
  }

  async findByEmail(email: string): Promise<AuthUserEntity | null> {
    try {
      const u = await this.prisma.authUser.findUnique({ where: { email } });
      return u ? this.map(u) : null;
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'AuthUser');
    }
  }

  async findByEmailWithSecurity(
    email: string,
  ): Promise<AuthUserWithSecurity | null> {
    try {
      const u = await this.prisma.authUser.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          username: true,
          password: true,
          role: true,
          verified: true,
          status: true,
          provider: true,
          providerId: true,
          tokenVersion: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
          authSecurity: {
            select: {
              id: true,
              failedAttempts: true,
              lastFailedAt: true,
              lockExpiresAt: true,
            },
          },
        },
      });
      if (!u) return null;
      return {
        user: new AuthUserEntity(
          u.id,
          u.email,
          u.password,
          u.username,
          u.role,
          u.verified,
          u.status,
          u.tokenVersion,
          u.deletedAt,
          u.provider,
          u.providerId ?? null,
          u.createdAt,
          u.updatedAt,
        ),
        security: u.authSecurity
          ? {
              id: u.authSecurity.id,
              failedAttempts: u.authSecurity.failedAttempts,
              lastFailedAt: u.authSecurity.lastFailedAt,
              lockExpiresAt: u.authSecurity.lockExpiresAt,
            }
          : null,
      };
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'AuthUser');
    }
  }

  async findByProvider(
    provider: string,
    providerId: string,
  ): Promise<AuthUserEntity | null> {
    try {
      const u = await this.prisma.authUser.findFirst({
        where: { provider, providerId },
      });
      return u ? this.map(u) : null;
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'AuthUser');
    }
  }

  async findByEmailOrUsername(
    email: string,
    username: string,
  ): Promise<AuthUserEntity | null> {
    try {
      const u = await this.prisma.authUser.findFirst({
        where: { OR: [{ email }, { username }] },
      });
      return u ? this.map(u) : null;
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'AuthUser');
    }
  }

  async save(
    entity: AuthUserEntity,
    ctx?: ITransactionContext,
  ): Promise<AuthUserEntity> {
    const cl = ctx ? (ctx as PrismaTransactionContext).prisma : this.prisma;
    try {
      if (entity.id) {
        const u = await cl.authUser.update({
          where: { id: entity.id },
          data: {
            email: entity.email,
            password: entity.password,
            username: entity.username,
            role: entity.role,
            verified: entity.verified,
            status: entity.status,
            tokenVersion: entity.tokenVersion,
            deletedAt: entity.deletedAt,
            provider: entity.provider,
            providerId: entity.providerId,
          },
        });
        return this.map(u);
      }
      const u = await cl.authUser.create({
        data: {
          email: entity.email,
          password: entity.password,
          username: entity.username,
          role: entity.role,
          verified: entity.verified,
          status: entity.status,
          provider: entity.provider,
          providerId: entity.providerId,
        },
      });
      return this.map(u);
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'AuthUser');
    }
  }

  async updateTokenVersion(id: string, version: number): Promise<void> {
    try {
      await this.prisma.authUser.update({
        where: { id },
        data: { tokenVersion: version },
      });
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'AuthUser');
    }
  }

  async updateVerified(
    id: string,
    verified: boolean,
    ctx?: ITransactionContext,
  ): Promise<void> {
    const cl = ctx ? (ctx as PrismaTransactionContext).prisma : this.prisma;
    try {
      await cl.authUser.update({ where: { id }, data: { verified } });
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'AuthUser');
    }
  }

  private map(p: PrismaAuthUser): AuthUserEntity {
    return new AuthUserEntity(
      p.id,
      p.email,
      p.password,
      p.username,
      p.role,
      p.verified,
      p.status,
      p.tokenVersion,
      p.deletedAt,
      p.provider,
      p.providerId ?? null,
      p.createdAt,
      p.updatedAt,
    );
  }
}
