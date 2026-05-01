import { Injectable } from '@nestjs/common';
import { JobFollowUp } from '@prisma/client';
import { PrismaService } from '../../../common/services/prisma.service';
import { PrismaErrorMapper } from '../../../common/infrastructure/persistence/prisma-error.mapper';
import { IJobFollowUpRepository } from '../../domain/repositories/job-follow-up.repository.interface';
import { JobFollowUpEntity } from '../../domain/entities/job-follow-up.entity';
import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';
import { PrismaTransactionContext } from '../../../common/infrastructure/persistence/prisma-unit-of-work';

@Injectable()
export class PrismaJobFollowUpRepository implements IJobFollowUpRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<JobFollowUpEntity | null> {
    const r = await this.prisma.jobFollowUp.findUnique({ where: { id } });
    return r ? this.map(r) : null;
  }

  async findAllByJob(jobId: string): Promise<JobFollowUpEntity[]> {
    const r = await this.prisma.jobFollowUp.findMany({
      where: { jobId },
      orderBy: { scheduledDate: 'desc' },
    });
    return r.map((f) => this.map(f));
  }

  async findNextPending(jobId: string): Promise<JobFollowUpEntity | null> {
    const r = await this.prisma.jobFollowUp.findFirst({
      where: { jobId, status: 'PENDING' },
      orderBy: { scheduledDate: 'asc' },
    });
    return r ? this.map(r) : null;
  }

  async save(
    entity: JobFollowUpEntity,
    ctx?: ITransactionContext,
  ): Promise<JobFollowUpEntity> {
    const cl = ctx ? (ctx as PrismaTransactionContext).prisma : this.prisma;
    try {
      if (entity.id) {
        const u = await cl.jobFollowUp.update({
          where: { id: entity.id },
          data: {
            scheduledDate: entity.scheduledDate,
            completedDate: entity.completedDate,
            status: entity.status,
            type: entity.type,
            subject: entity.subject,
            message: entity.message,
            response: entity.response,
          },
        });
        return this.map(u);
      }
      const c = await cl.jobFollowUp.create({
        data: {
          job: { connect: { id: entity.jobId } },
          scheduledDate: entity.scheduledDate,
          status: entity.status,
          type: entity.type,
          subject: entity.subject,
          message: entity.message,
        },
      });
      return this.map(c);
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'JobFollowUp');
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.jobFollowUp.delete({ where: { id } });
  }

  private map(p: JobFollowUp): JobFollowUpEntity {
    return new JobFollowUpEntity(
      p.id,
      p.jobId,
      p.scheduledDate,
      p.completedDate,
      p.status,
      p.type,
      p.subject,
      p.message,
      p.response,
      p.createdAt,
      p.updatedAt,
    );
  }
}
