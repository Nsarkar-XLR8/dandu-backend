import { Test, TestingModule } from '@nestjs/testing';
import { JobController } from './job.controller';
import { JobService } from '../../application/services/job.service';
import { CustomLoggerService } from '../../../common/services/custom-logger.service';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { CreateJobDto } from '../../dto';
import { JobStatus, AppliedVia } from '../../domain/entities/job.entity';
import { ExecutionContext } from '@nestjs/common';

describe('JobController', () => {
  let controller: JobController;
  let jobService: jest.Mocked<JobService>;

  const mockUser = { userId: 'user-123', role: 'USER', tokenVersion: 1 };
  const mockRequest = {
    user: mockUser,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' },
  } as any;

  beforeEach(async () => {
    const mockJobService = {
      createJob: jest.fn(),
      findAllJobs: jest.fn(),
      getStatistics: jest.fn(),
      findJobById: jest.fn(),
      updateJob: jest.fn(),
      deleteJob: jest.fn(),
      toggleArchiveJob: jest.fn(),
      toggleFavoriteJob: jest.fn(),
      bulkArchiveJobs: jest.fn(),
      bulkDeleteJobs: jest.fn(),
      createFollowUp: jest.fn(),
      getFollowUps: jest.fn(),
      updateFollowUp: jest.fn(),
      completeFollowUp: jest.fn(),
      deleteFollowUp: jest.fn(),
      createNote: jest.fn(),
      getNotes: jest.fn(),
      updateNote: jest.fn(),
      togglePinNote: jest.fn(),
      deleteNote: jest.fn(),
      getTimeline: jest.fn(),
      addTimelineEvent: jest.fn(),
    };

    const mockCustomLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobController],
      providers: [
        { provide: JobService, useValue: mockJobService },
        { provide: CustomLoggerService, useValue: mockCustomLoggerService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: (context: ExecutionContext) => true })
      .compile();

    controller = module.get<JobController>(JobController);
    jobService = module.get(JobService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createJob', () => {
    it('should create a job', async () => {
      const dto: CreateJobDto = {
        company: 'Test Company',
        role: 'Developer',
        location: 'Remote',
        appliedDate: new Date().toISOString(),
        appliedVia: AppliedVia.LINKEDIN,
        status: JobStatus.APPLIED,
      };

      jobService.createJob.mockResolvedValue({ id: 'job-1', ...dto } as any);

      const result = await controller.createJob(dto, mockRequest);

      expect(result).toBeDefined();
      expect(jobService.createJob).toHaveBeenCalledWith(
        mockUser.userId,
        dto,
        expect.objectContaining({ ip: '127.0.0.1' }),
      );
    });
  });

  describe('findAllJobs', () => {
    it('should return all jobs for a user', async () => {
      jobService.findAllJobs.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0, hasNextPage: false, hasPreviousPage: false } });

      const result = await controller.findAllJobs({}, mockRequest);

      expect(result).toEqual({ data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0, hasNextPage: false, hasPreviousPage: false } });
      expect(jobService.findAllJobs).toHaveBeenCalledWith(mockUser.userId, {});
    });
  });

  describe('getStatistics', () => {
    it('should return job statistics', async () => {
      const stats = { total: 10, applied: 5 };
      jobService.getStatistics.mockResolvedValue(stats as any);

      const result = await controller.getStatistics(mockRequest);

      expect(result).toEqual(stats);
      expect(jobService.getStatistics).toHaveBeenCalledWith(mockUser.userId);
    });
  });
});
