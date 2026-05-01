import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';
import { JobTimelineEventEntity } from '../entities/job-timeline-event.entity';

/**
 * JobTimeline Repository Interface (Port)
 */
export interface IJobTimelineRepository {
  findAllByJob(jobId: string): Promise<JobTimelineEventEntity[]>;
  save(
    entity: JobTimelineEventEntity,
    ctx?: ITransactionContext,
  ): Promise<JobTimelineEventEntity>;
}

export const JOB_TIMELINE_REPOSITORY_TOKEN = Symbol('IJobTimelineRepository');
