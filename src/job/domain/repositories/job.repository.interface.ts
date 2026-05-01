import {
  IRepository,
  PaginatedResult,
} from '../../../common/domain/interfaces/repository.base';
import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';
import { JobEntity } from '../entities/job.entity';

/**
 * Job Repository Interface (Port)
 *
 * Defines all persistence operations the application layer needs for Jobs.
 * The infrastructure layer (Prisma adapter) implements this.
 */
export interface IJobRepository extends IRepository<JobEntity> {
  /**
   * Find all jobs for a user with filtering, pagination, and sorting.
   */
  findAllByUser(
    authId: string,
    filter: JobFilterParams,
  ): Promise<PaginatedResult<JobEntity>>;

  /**
   * Save a job within a transaction context.
   */
  saveInTransaction(
    entity: JobEntity,
    ctx: ITransactionContext,
  ): Promise<JobEntity>;

  /**
   * Soft-delete a job (set deletedAt timestamp).
   */
  softDelete(id: string, ctx?: ITransactionContext): Promise<void>;

  /**
   * Hard-delete a job (permanent removal).
   */
  hardDelete(id: string): Promise<void>;

  /**
   * Bulk update multiple jobs.
   * Returns the count of updated records.
   */
  bulkUpdate(
    ids: string[],
    authId: string,
    data: Partial<Pick<JobEntity, 'isArchived' | 'deletedAt'>>,
  ): Promise<number>;

  /**
   * Find multiple jobs by IDs, scoped to a user.
   */
  findManyByIds(ids: string[], authId: string): Promise<JobEntity[]>;

  /**
   * Get aggregated statistics for a user's jobs.
   */
  getStatistics(authId: string): Promise<JobStatistics>;
}

/**
 * Filter parameters for job listing.
 * These are domain-level filter concepts (not Prisma types).
 */
export interface JobFilterParams {
  search?: string;
  status?: string[];
  responseStatus?: string[];
  priority?: string[];
  locationType?: string[];
  location?: string;
  appliedVia?: string[];
  appliedDateFrom?: string;
  appliedDateTo?: string;
  responseDateFrom?: string;
  responseDateTo?: string;
  salaryMinFrom?: number;
  salaryMaxTo?: number;
  isFavorite?: boolean;
  isArchived?: boolean;
  interviewScheduled?: boolean;
  tags?: string[];
  techStack?: string[];
  company?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Aggregated job statistics.
 */
export interface JobStatistics {
  totalJobs: number;
  byStatus: Record<string, number>;
  byResponseStatus: Record<string, number>;
  byLocationType: Record<string, number>;
  byPriority: Record<string, number>;
  byAppliedVia: Record<string, number>;
  responseRate: number;
  interviewRate: number;
  offerRate: number;
  applicationsThisWeek: number;
  applicationsThisMonth: number;
  responsesThisWeek: number;
  interviewsScheduled: number;
  averageSalaryMin: number | null;
  averageSalaryMax: number | null;
}

/**
 * NestJS DI injection token
 */
export const JOB_REPOSITORY_TOKEN = Symbol('IJobRepository');
