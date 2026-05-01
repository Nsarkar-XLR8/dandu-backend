import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';
import { JobFollowUpEntity } from '../entities/job-follow-up.entity';

/**
 * JobFollowUp Repository Interface (Port)
 */
export interface IJobFollowUpRepository {
  findById(id: string): Promise<JobFollowUpEntity | null>;
  findAllByJob(jobId: string): Promise<JobFollowUpEntity[]>;
  findNextPending(jobId: string): Promise<JobFollowUpEntity | null>;
  save(
    entity: JobFollowUpEntity,
    ctx?: ITransactionContext,
  ): Promise<JobFollowUpEntity>;
  delete(id: string): Promise<void>;
}

export const JOB_FOLLOW_UP_REPOSITORY_TOKEN = Symbol('IJobFollowUpRepository');
