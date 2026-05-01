import { Injectable } from '@nestjs/common';
import { Prisma, JobTimelineEvent } from '@prisma/client';
import { PrismaService } from '../../../common/services/prisma.service';
import { PrismaErrorMapper } from '../../../common/infrastructure/persistence/prisma-error.mapper';
import { IJobTimelineRepository } from '../../domain/repositories/job-timeline.repository.interface';
import { JobTimelineEventEntity } from '../../domain/entities/job-timeline-event.entity';
import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';
import { PrismaTransactionContext } from '../../../common/infrastructure/persistence/prisma-unit-of-work';

@Injectable()
export class PrismaJobTimelineRepository implements IJobTimelineRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByJob(jobId: string): Promise<JobTimelineEventEntity[]> {
    const r = await this.prisma.jobTimelineEvent.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
    });
    return r.map((e) => this.map(e));
  }

  async save(
    entity: JobTimelineEventEntity,
    ctx?: ITransactionContext,
  ): Promise<JobTimelineEventEntity> {
    const cl = ctx ? (ctx as PrismaTransactionContext).prisma : this.prisma;
    try {
      const c = await cl.jobTimelineEvent.create({
        data: {
          job: { connect: { id: entity.jobId } },
          eventType: entity.eventType,
          title: entity.title,
          description: entity.description,
          metadata: entity.metadata as Prisma.InputJsonValue | undefined,
        },
      });
      return this.map(c);
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'JobTimelineEvent');
    }
  }

  private map(p: JobTimelineEvent): JobTimelineEventEntity {
    return new JobTimelineEventEntity(
      p.id,
      p.jobId,
      p.eventType,
      p.title,
      p.description,
      p.metadata as Record<string, unknown> | null,
      p.createdAt,
    );
  }
}
