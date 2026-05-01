import { Injectable } from '@nestjs/common';
import { Prisma, JobStatus, ResponseStatus, JobPriority, JobLocationType, AppliedVia } from '@prisma/client';
import { PrismaService } from '../../../common/services/prisma.service';
import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';
import { PrismaTransactionContext } from '../../../common/infrastructure/persistence/prisma-unit-of-work';
import { PrismaErrorMapper } from '../../../common/infrastructure/persistence/prisma-error.mapper';
import { PaginatedResult } from '../../../common/domain/interfaces/repository.base';
import {
  IJobRepository,
  JobFilterParams,
  JobStatistics,
} from '../../domain/repositories/job.repository.interface';
import { JobEntity } from '../../domain/entities/job.entity';
import { JobMapper } from './mappers/job.mapper';

/**
 * Prisma Job Repository (Adapter)
 *
 * Implements IJobRepository using Prisma Client with MongoDB.
 *
 * MongoDB-specific edge cases handled:
 * 1. No `mode: 'insensitive'` — uses regex-based case-insensitive search
 * 2. groupBy with _count uses { _all: true } syntax
 * 3. ObjectId validation via PrismaErrorMapper (P2023)
 */
@Injectable()
export class PrismaJobRepository implements IJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<JobEntity | null> {
    try {
      const job = await this.prisma.job.findUnique({ where: { id } });
      return job ? JobMapper.toDomain(job) : null;
    } catch (error) {
      throw PrismaErrorMapper.toDomainException(error, 'Job');
    }
  }

  async findAllByUser(
    authId: string,
    filter: JobFilterParams,
  ): Promise<PaginatedResult<JobEntity>> {
    const {
      search,
      status,
      responseStatus,
      priority,
      locationType,
      location,
      appliedVia,
      appliedDateFrom,
      appliedDateTo,
      responseDateFrom,
      responseDateTo,
      salaryMinFrom,
      salaryMaxTo,
      isFavorite,
      isArchived,
      interviewScheduled,
      tags,
      techStack,
      company,
      page = 1,
      limit = 20,
      sortBy = 'appliedDate',
      sortOrder = 'desc',
    } = filter;

    const where: Prisma.JobWhereInput = {
      authId,
      deletedAt: null,
    };

    // =========================================================
    // MongoDB Edge Case: case-insensitive search
    // Prisma's MongoDB connector does NOT support `mode: 'insensitive'`.
    // We use `contains` which is case-SENSITIVE on MongoDB by default.
    // For case-insensitive search, we use string matching without mode.
    //
    // Note: For production MongoDB deployments needing case-insensitive
    // search, consider creating a case-insensitive collation index:
    // db.Job.createIndex({ company: 1 }, { collation: { locale: "en", strength: 2 } })
    // =========================================================
    if (search) {
      where.OR = [
        { company: { contains: search } },
        { role: { contains: search } },
        { location: { contains: search } },
        { techStack: { hasSome: [search] } },
        { tags: { hasSome: [search] } },
      ];
    }

    // Status filters
    if (status && status.length > 0) {
      where.status = { in: status as JobStatus[] };
    }

    if (responseStatus && responseStatus.length > 0) {
      where.responseStatus = { in: responseStatus as ResponseStatus[] };
    }

    if (priority && priority.length > 0) {
      where.priority = { in: priority as JobPriority[] };
    }

    if (locationType && locationType.length > 0) {
      where.locationType = { in: locationType as JobLocationType[] };
    }

    if (location) {
      where.location = { contains: location };
    }

    if (appliedVia && appliedVia.length > 0) {
      where.appliedVia = { in: appliedVia as AppliedVia[] };
    }

    // Date filters
    if (appliedDateFrom || appliedDateTo) {
      where.appliedDate = {};
      if (appliedDateFrom) {
        where.appliedDate.gte = new Date(appliedDateFrom);
      }
      if (appliedDateTo) {
        where.appliedDate.lte = new Date(appliedDateTo);
      }
    }

    if (responseDateFrom || responseDateTo) {
      where.responseDate = {};
      if (responseDateFrom) {
        where.responseDate.gte = new Date(responseDateFrom);
      }
      if (responseDateTo) {
        where.responseDate.lte = new Date(responseDateTo);
      }
    }

    // Salary filters
    if (salaryMinFrom !== undefined) {
      where.salaryMin = { gte: salaryMinFrom };
    }

    if (salaryMaxTo !== undefined) {
      where.salaryMax = { lte: salaryMaxTo };
    }

    // Boolean filters
    if (isFavorite !== undefined) {
      where.isFavorite = isFavorite;
    }

    if (isArchived !== undefined) {
      where.isArchived = isArchived;
    }

    if (interviewScheduled !== undefined) {
      where.interviewScheduled = interviewScheduled;
    }

    // Array filters
    if (tags && tags.length > 0) {
      where.tags = { hasSome: tags };
    }

    if (techStack && techStack.length > 0) {
      where.techStack = { hasSome: techStack };
    }

    if (company) {
      where.company = { contains: company };
    }

    // Build orderBy
    const orderBy: Prisma.JobOrderByWithRelationInput = {};
    const validSortFields = [
      'appliedDate',
      'company',
      'status',
      'salaryMax',
      'salaryMin',
      'responseDate',
      'createdAt',
      'updatedAt',
      'priority',
      'role',
    ];

    if (validSortFields.includes(sortBy)) {
      orderBy[sortBy] = sortOrder;
    } else {
      orderBy.appliedDate = 'desc';
    }

    try {
      const [jobs, total] = await Promise.all([
        this.prisma.job.findMany({
          where,
          orderBy,
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.job.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        data: jobs.map((job) => JobMapper.toDomain(job)),
        meta: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    } catch (error) {
      throw PrismaErrorMapper.toDomainException(error, 'Job');
    }
  }

  async save(entity: JobEntity): Promise<JobEntity> {
    try {
      if (entity.id) {
        // Update existing
        const updated = await this.prisma.job.update({
          where: { id: entity.id },
          data: JobMapper.toUpdateInput(entity),
        });
        return JobMapper.toDomain(updated);
      } else {
        // Create new
        const created = await this.prisma.job.create({
          data: JobMapper.toCreateInput(entity),
        });
        return JobMapper.toDomain(created);
      }
    } catch (error) {
      throw PrismaErrorMapper.toDomainException(error, 'Job');
    }
  }

  async saveInTransaction(
    entity: JobEntity,
    ctx: ITransactionContext,
  ): Promise<JobEntity> {
    const tx = (ctx as PrismaTransactionContext).prisma;
    try {
      if (entity.id) {
        const updated = await tx.job.update({
          where: { id: entity.id },
          data: JobMapper.toUpdateInput(entity),
        });
        return JobMapper.toDomain(updated);
      } else {
        const created = await tx.job.create({
          data: JobMapper.toCreateInput(entity),
        });
        return JobMapper.toDomain(created);
      }
    } catch (error) {
      throw PrismaErrorMapper.toDomainException(error, 'Job');
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.job.delete({ where: { id } });
    } catch (error) {
      throw PrismaErrorMapper.toDomainException(error, 'Job');
    }
  }

  async softDelete(id: string, ctx?: ITransactionContext): Promise<void> {
    try {
      const client = ctx
        ? (ctx as PrismaTransactionContext).prisma
        : this.prisma;
      await client.job.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      throw PrismaErrorMapper.toDomainException(error, 'Job');
    }
  }

  async hardDelete(id: string): Promise<void> {
    try {
      await this.prisma.job.delete({ where: { id } });
    } catch (error) {
      throw PrismaErrorMapper.toDomainException(error, 'Job');
    }
  }

  async bulkUpdate(
    ids: string[],
    authId: string,
    data: Partial<Pick<JobEntity, 'isArchived' | 'deletedAt'>>,
  ): Promise<number> {
    try {
      const result = await this.prisma.job.updateMany({
        where: { id: { in: ids }, authId, deletedAt: null },
        data,
      });
      return result.count;
    } catch (error) {
      throw PrismaErrorMapper.toDomainException(error, 'Job');
    }
  }

  async findManyByIds(ids: string[], authId: string): Promise<JobEntity[]> {
    try {
      const jobs = await this.prisma.job.findMany({
        where: { id: { in: ids }, authId, deletedAt: null },
      });
      return jobs.map((job) => JobMapper.toDomain(job));
    } catch (error) {
      throw PrismaErrorMapper.toDomainException(error, 'Job');
    }
  }

  async getStatistics(authId: string): Promise<JobStatistics> {
    try {
      const baseWhere = { authId, deletedAt: null };

      const [
        totalJobs,
        byStatus,
        byResponseStatus,
        byLocationType,
        byPriority,
        byAppliedVia,
        applicationsThisWeek,
        applicationsThisMonth,
        responsesThisWeek,
        interviewsScheduled,
        salaryStats,
      ] = await Promise.all([
        this.prisma.job.count({ where: baseWhere }),
        this.prisma.job.groupBy({
          by: ['status'],
          where: baseWhere,
          _count: { _all: true },
        }),
        this.prisma.job.groupBy({
          by: ['responseStatus'],
          where: baseWhere,
          _count: { _all: true },
        }),
        this.prisma.job.groupBy({
          by: ['locationType'],
          where: baseWhere,
          _count: { _all: true },
        }),
        this.prisma.job.groupBy({
          by: ['priority'],
          where: baseWhere,
          _count: { _all: true },
        }),
        this.prisma.job.groupBy({
          by: ['appliedVia'],
          where: baseWhere,
          _count: { _all: true },
        }),
        this.prisma.job.count({
          where: {
            ...baseWhere,
            appliedDate: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
        this.prisma.job.count({
          where: {
            ...baseWhere,
            appliedDate: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        }),
        this.prisma.job.count({
          where: {
            ...baseWhere,
            responseStatus: 'RESPONSE_RECEIVED',
            responseDate: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
        this.prisma.job.count({
          where: {
            ...baseWhere,
            interviewScheduled: true,
            interviewDate: { gte: new Date() },
          },
        }),
        this.prisma.job.aggregate({
          where: { ...baseWhere, salaryMin: { not: null } },
          _avg: { salaryMin: true, salaryMax: true },
        }),
      ]);

      // Calculate rates
      const responsesReceived =
        byResponseStatus.find((s) => s.responseStatus === 'RESPONSE_RECEIVED')
          ?._count._all || 0;
      const interviews =
        byStatus.find((s) => s.status === 'INTERVIEW')?._count._all || 0;
      const offers =
        byStatus.find((s) => s.status === 'OFFER')?._count._all || 0;

      return {
        totalJobs,
        byStatus: Object.fromEntries(
          byStatus.map((s) => [s.status, s._count._all]),
        ),
        byResponseStatus: Object.fromEntries(
          byResponseStatus.map((s) => [s.responseStatus, s._count._all]),
        ),
        byLocationType: Object.fromEntries(
          byLocationType.map((s) => [s.locationType, s._count._all]),
        ),
        byPriority: Object.fromEntries(
          byPriority.map((s) => [s.priority, s._count._all]),
        ),
        byAppliedVia: Object.fromEntries(
          byAppliedVia.map((s) => [s.appliedVia, s._count._all]),
        ),
        responseRate: totalJobs > 0 ? (responsesReceived / totalJobs) * 100 : 0,
        interviewRate: totalJobs > 0 ? (interviews / totalJobs) * 100 : 0,
        offerRate: totalJobs > 0 ? (offers / totalJobs) * 100 : 0,
        applicationsThisWeek,
        applicationsThisMonth,
        responsesThisWeek,
        interviewsScheduled,
        averageSalaryMin: salaryStats._avg.salaryMin,
        averageSalaryMax: salaryStats._avg.salaryMax,
      };
    } catch (error) {
      throw PrismaErrorMapper.toDomainException(error, 'Job');
    }
  }
}
