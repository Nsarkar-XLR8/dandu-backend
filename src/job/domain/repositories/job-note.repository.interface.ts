import { JobNoteEntity } from '../entities/job-note.entity';

/**
 * JobNote Repository Interface (Port)
 */
export interface IJobNoteRepository {
  findById(id: string): Promise<JobNoteEntity | null>;
  findAllByJob(jobId: string): Promise<JobNoteEntity[]>;
  save(entity: JobNoteEntity): Promise<JobNoteEntity>;
  delete(id: string): Promise<void>;
}

export const JOB_NOTE_REPOSITORY_TOKEN = Symbol('IJobNoteRepository');
