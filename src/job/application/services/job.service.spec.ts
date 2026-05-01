import { Test, TestingModule } from '@nestjs/testing';
import { CustomLoggerService } from '../../../common/services/custom-logger.service';
import { ACTIVITY_LOG_REPOSITORY_TOKEN } from '../../../common/domain/repositories/activity-log.repository.interface';
import {
  ITransactionContext,
  UNIT_OF_WORK_TOKEN,
} from '../../../common/domain/interfaces/unit-of-work.interface';
import { AuthorizationException } from '../../../common/domain/exceptions/domain.exception';
import {
  AppliedVia,
  JobEntity,
  JobLocationType,
  JobPriority,
  JobSourceType,
  JobStatus,
  ResponseStatus,
} from '../../domain/entities/job.entity';
import { JOB_FOLLOW_UP_REPOSITORY_TOKEN } from '../../domain/repositories/job-follow-up.repository.interface';
import { JOB_NOTE_REPOSITORY_TOKEN } from '../../domain/repositories/job-note.repository.interface';
import { JOB_REPOSITORY_TOKEN } from '../../domain/repositories/job.repository.interface';
import { JOB_TIMELINE_REPOSITORY_TOKEN } from '../../domain/repositories/job-timeline.repository.interface';
import { JobService } from './job.service';

const txContext: ITransactionContext = { __brand: 'TransactionContext' };

const createJob = (overrides: Partial<JobEntity> = {}) =>
  Object.assign(
    new JobEntity({
      id: 'job-1',
      authId: 'auth-1',
      company: 'Acme',
      companyUrl: null,
      companyLinkedin: null,
      companyFacebook: null,
      companyTwitter: null,
      companyLogo: null,
      role: 'Backend Engineer',
      location: 'Remote',
      locationType: JobLocationType.REMOTE,
      salaryDisplay: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: 'USD',
      contactPerson: null,
      contactEmail: null,
      contactPhone: null,
      appliedDate: new Date('2026-01-01T00:00:00.000Z'),
      appliedVia: AppliedVia.LINKEDIN,
      jobPostingUrl: null,
      status: JobStatus.APPLIED,
      responseStatus: ResponseStatus.NO_RESPONSE,
      responseDate: null,
      techStack: [],
      jobDescription: null,
      requirements: null,
      responsibilities: null,
      benefits: null,
      interviewScheduled: false,
      interviewDate: null,
      interviewType: null,
      interviewRound: null,
      interviewLocation: null,
      interviewNotes: null,
      priority: JobPriority.MEDIUM,
      tags: [],
      isFavorite: false,
      isArchived: false,
      offerAmount: null,
      offerDate: null,
      offerDeadline: null,
      offerNotes: null,
      rejectionReason: null,
      rejectionDate: null,
      notes: null,
      aiParsedData: null,
      aiConfidenceScore: null,
      sourceType: JobSourceType.MANUAL,
      rawJobPosting: null,
      nextFollowUpDate: null,
      followUpCount: 0,
      lastFollowUpDate: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
    }),
    overrides,
  );

describe('JobService', () => {
  let service: JobService;

  const jobRepo = {
    findById: jest.fn(),
    save: jest.fn(),
    saveInTransaction: jest.fn(),
    findAllByUser: jest.fn(),
    softDelete: jest.fn(),
    hardDelete: jest.fn(),
    bulkUpdate: jest.fn(),
    findManyByIds: jest.fn(),
    getStatistics: jest.fn(),
  };

  const followUpRepo = {
    findById: jest.fn(),
    findAllByJob: jest.fn(),
    findNextPending: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const noteRepo = {
    findById: jest.fn(),
    findAllByJob: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const timelineRepo = {
    findAllByJob: jest.fn(),
    save: jest.fn(),
  };

  const unitOfWork = {
    execute: jest.fn((work: (ctx: ITransactionContext) => Promise<unknown>) =>
      work(txContext),
    ),
  };

  const activityLogRepo = {
    logActivity: jest.fn(),
  };

  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobService,
        { provide: JOB_REPOSITORY_TOKEN, useValue: jobRepo },
        { provide: JOB_FOLLOW_UP_REPOSITORY_TOKEN, useValue: followUpRepo },
        { provide: JOB_NOTE_REPOSITORY_TOKEN, useValue: noteRepo },
        { provide: JOB_TIMELINE_REPOSITORY_TOKEN, useValue: timelineRepo },
        { provide: UNIT_OF_WORK_TOKEN, useValue: unitOfWork },
        { provide: ACTIVITY_LOG_REPOSITORY_TOKEN, useValue: activityLogRepo },
        { provide: CustomLoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get(JobService);
  });

  it('prevents access to another user job', async () => {
    jobRepo.findById.mockResolvedValue(createJob({ authId: 'other-user' }));

    await expect(service.findJobById('auth-1', 'job-1')).rejects.toBeInstanceOf(
      AuthorizationException,
    );
  });

  it('updates a job through the entity patch and records status timeline', async () => {
    const job = createJob();
    jobRepo.findById.mockResolvedValue(job);
    jobRepo.saveInTransaction.mockImplementation((entity: JobEntity) =>
      Promise.resolve(entity),
    );
    timelineRepo.save.mockImplementation((entity) => Promise.resolve(entity));
    activityLogRepo.logActivity.mockResolvedValue(undefined);

    const result = await service.updateJob(
      'auth-1',
      'job-1',
      {
        company: 'Globex',
        status: JobStatus.INTERVIEW,
        responseStatus: ResponseStatus.RESPONSE_RECEIVED,
      },
      { ip: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result.company).toBe('Globex');
    expect(result.status).toBe(JobStatus.INTERVIEW);
    expect(result.responseStatus).toBe(ResponseStatus.RESPONSE_RECEIVED);
    expect(jobRepo.saveInTransaction).toHaveBeenCalledWith(job, txContext);
    expect(timelineRepo.save).toHaveBeenCalledTimes(2);
    expect(activityLogRepo.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'Job',
        recordId: 'job-1',
        action: 'update',
      }),
      txContext,
    );
  });

  it('creates a job with initial timeline and activity log', async () => {
    const savedJob = createJob();
    jobRepo.saveInTransaction.mockResolvedValue(savedJob);
    timelineRepo.save.mockImplementation((entity) => Promise.resolve(entity));
    activityLogRepo.logActivity.mockResolvedValue(undefined);

    const result = await service.createJob(
      'auth-1',
      {
        company: 'Acme',
        role: 'Backend Engineer',
        location: 'Remote',
        appliedDate: '2026-01-01',
        appliedVia: AppliedVia.LINKEDIN,
      },
      { ip: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result).toBe(savedJob);
    expect(jobRepo.saveInTransaction).toHaveBeenCalledWith(
      expect.any(JobEntity),
      txContext,
    );
    expect(timelineRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'APPLIED' }),
      txContext,
    );
    expect(activityLogRepo.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'Job',
        recordId: 'job-1',
        action: 'create',
      }),
      txContext,
    );
  });
});
