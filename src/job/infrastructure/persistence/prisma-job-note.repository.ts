import { Injectable } from '@nestjs/common';
import { JobNote } from '@prisma/client';
import { PrismaService } from '../../../common/services/prisma.service';
import { PrismaErrorMapper } from '../../../common/infrastructure/persistence/prisma-error.mapper';
import { IJobNoteRepository } from '../../domain/repositories/job-note.repository.interface';
import { JobNoteEntity } from '../../domain/entities/job-note.entity';

@Injectable()
export class PrismaJobNoteRepository implements IJobNoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<JobNoteEntity | null> {
    const r = await this.prisma.jobNote.findUnique({ where: { id } });
    return r ? this.map(r) : null;
  }

  async findAllByJob(jobId: string): Promise<JobNoteEntity[]> {
    const r = await this.prisma.jobNote.findMany({
      where: { jobId },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });
    return r.map((n) => this.map(n));
  }

  async save(entity: JobNoteEntity): Promise<JobNoteEntity> {
    try {
      if (entity.id) {
        const u = await this.prisma.jobNote.update({
          where: { id: entity.id },
          data: {
            title: entity.title,
            content: entity.content,
            isPinned: entity.isPinned,
            category: entity.category,
          },
        });
        return this.map(u);
      }
      const c = await this.prisma.jobNote.create({
        data: {
          job: { connect: { id: entity.jobId } },
          title: entity.title,
          content: entity.content,
          isPinned: entity.isPinned,
          category: entity.category,
        },
      });
      return this.map(c);
    } catch (e) {
      throw PrismaErrorMapper.toDomainException(e, 'JobNote');
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.jobNote.delete({ where: { id } });
  }

  private map(p: JobNote): JobNoteEntity {
    return new JobNoteEntity(
      p.id,
      p.jobId,
      p.title,
      p.content,
      p.isPinned,
      p.category,
      p.createdAt,
      p.updatedAt,
    );
  }
}
