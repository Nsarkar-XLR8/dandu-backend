import { Injectable, Inject } from '@nestjs/common';
import { CustomLoggerService } from '../../../common/services/custom-logger.service';
import { JOB_REPOSITORY_TOKEN } from '../../domain/repositories/job.repository.interface';
import { JOB_FOLLOW_UP_REPOSITORY_TOKEN } from '../../domain/repositories/job-follow-up.repository.interface';
import { JOB_NOTE_REPOSITORY_TOKEN } from '../../domain/repositories/job-note.repository.interface';
import { JOB_TIMELINE_REPOSITORY_TOKEN } from '../../domain/repositories/job-timeline.repository.interface';
import { UNIT_OF_WORK_TOKEN } from '../../../common/domain/interfaces/unit-of-work.interface';
import { ACTIVITY_LOG_REPOSITORY_TOKEN } from '../../../common/domain/repositories/activity-log.repository.interface';
import type { IJobRepository } from '../../domain/repositories/job.repository.interface';
import type { IJobFollowUpRepository } from '../../domain/repositories/job-follow-up.repository.interface';
import type { IJobNoteRepository } from '../../domain/repositories/job-note.repository.interface';
import type { IJobTimelineRepository } from '../../domain/repositories/job-timeline.repository.interface';
import type { IUnitOfWork } from '../../../common/domain/interfaces/unit-of-work.interface';
import type {
  IActivityLogRepository,
  ActivityLogMetadata,
} from '../../../common/domain/repositories/activity-log.repository.interface';
import {
  AuthorizationException,
  EntityNotFoundException,
} from '../../../common/domain/exceptions/domain.exception';
import { JobEntity, type JobPatch } from '../../domain/entities/job.entity';
import { JobFollowUpEntity } from '../../domain/entities/job-follow-up.entity';
import { JobNoteEntity } from '../../domain/entities/job-note.entity';
import { JobTimelineEventEntity } from '../../domain/entities/job-timeline-event.entity';
import {
  CreateJobDto,
  UpdateJobDto,
  JobFilterDto,
  CreateJobFollowUpDto,
  UpdateJobFollowUpDto,
  CompleteJobFollowUpDto,
  CreateJobNoteDto,
  UpdateJobNoteDto,
} from '../../dto';

/**
 * Job Application Service (Application Layer)
 *
 * Orchestrates domain logic and infrastructure ports.
 * No Prisma types — only domain entities and repository interfaces.
 *
 * Key architectural decisions:
 * - Injects repository PORTS (interfaces) not implementations
 * - Uses IUnitOfWork for transactions instead of prisma.$transaction
 * - Activity logging goes through the IActivityLogRepository port
 * - All business logic stays in domain entities where possible
 */
@Injectable()
export class JobService {
  constructor(
    @Inject(JOB_REPOSITORY_TOKEN)
    private readonly jobRepo: IJobRepository,
    @Inject(JOB_FOLLOW_UP_REPOSITORY_TOKEN)
    private readonly followUpRepo: IJobFollowUpRepository,
    @Inject(JOB_NOTE_REPOSITORY_TOKEN)
    private readonly noteRepo: IJobNoteRepository,
    @Inject(JOB_TIMELINE_REPOSITORY_TOKEN)
    private readonly timelineRepo: IJobTimelineRepository,
    @Inject(UNIT_OF_WORK_TOKEN)
    private readonly unitOfWork: IUnitOfWork,
    @Inject(ACTIVITY_LOG_REPOSITORY_TOKEN)
    private readonly activityLogRepo: IActivityLogRepository,
    private readonly customLogger: CustomLoggerService,
  ) {}

  // ================================
  // Job CRUD Operations
  // ================================

  async createJob(
    authId: string,
    createJobDto: CreateJobDto,
    meta: ActivityLogMetadata,
  ) {
    this.customLogger.log(
      `Creating job application for user: ${authId}, company: ${createJobDto.company}`,
      'JobService',
    );

    const job = await this.unitOfWork.execute(async (ctx) => {
      // Build domain entity
      const jobEntity = new JobEntity({
        id: null,
        authId,
        company: createJobDto.company,
        companyUrl: createJobDto.companyUrl ?? null,
        companyLinkedin: createJobDto.companyLinkedin ?? null,
        companyFacebook: createJobDto.companyFacebook ?? null,
        companyTwitter: createJobDto.companyTwitter ?? null,
        companyLogo: createJobDto.companyLogo ?? null,
        role: createJobDto.role,
        location: createJobDto.location,
        locationType: createJobDto.locationType || 'REMOTE',
        salaryDisplay: createJobDto.salaryDisplay ?? null,
        salaryMin: createJobDto.salaryMin ?? null,
        salaryMax: createJobDto.salaryMax ?? null,
        salaryCurrency: createJobDto.salaryCurrency || 'USD',
        contactPerson: createJobDto.contactPerson ?? null,
        contactEmail: createJobDto.contactEmail ?? null,
        contactPhone: createJobDto.contactPhone ?? null,
        appliedDate: new Date(createJobDto.appliedDate),
        appliedVia: createJobDto.appliedVia,
        jobPostingUrl: createJobDto.jobPostingUrl ?? null,
        status: createJobDto.status || 'APPLIED',
        responseStatus: createJobDto.responseStatus || 'NO_RESPONSE',
        responseDate: createJobDto.responseDate
          ? new Date(createJobDto.responseDate)
          : null,
        techStack: createJobDto.techStack || [],
        jobDescription: createJobDto.jobDescription ?? null,
        requirements: createJobDto.requirements ?? null,
        responsibilities: createJobDto.responsibilities ?? null,
        benefits: createJobDto.benefits ?? null,
        interviewScheduled: createJobDto.interviewScheduled || false,
        interviewDate: createJobDto.interviewDate
          ? new Date(createJobDto.interviewDate)
          : null,
        interviewType: createJobDto.interviewType ?? null,
        interviewRound: createJobDto.interviewRound ?? null,
        interviewLocation: createJobDto.interviewLocation ?? null,
        interviewNotes: createJobDto.interviewNotes ?? null,
        priority: createJobDto.priority || 'MEDIUM',
        tags: createJobDto.tags || [],
        isFavorite: createJobDto.isFavorite || false,
        isArchived: createJobDto.isArchived || false,
        offerAmount: createJobDto.offerAmount ?? null,
        offerDate: createJobDto.offerDate
          ? new Date(createJobDto.offerDate)
          : null,
        offerDeadline: createJobDto.offerDeadline
          ? new Date(createJobDto.offerDeadline)
          : null,
        offerNotes: createJobDto.offerNotes ?? null,
        rejectionReason: createJobDto.rejectionReason ?? null,
        rejectionDate: createJobDto.rejectionDate
          ? new Date(createJobDto.rejectionDate)
          : null,
        notes: createJobDto.notes ?? null,
        aiParsedData:
          (createJobDto.aiParsedData as Record<string, unknown>) ?? null,
        aiConfidenceScore: createJobDto.aiConfidenceScore ?? null,
        sourceType: createJobDto.sourceType || 'MANUAL',
        rawJobPosting: createJobDto.rawJobPosting ?? null,
        nextFollowUpDate: createJobDto.nextFollowUpDate
          ? new Date(createJobDto.nextFollowUpDate)
          : null,
        followUpCount: 0,
        lastFollowUpDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const savedJob = await this.jobRepo.saveInTransaction(jobEntity, ctx);

      // Create initial timeline event
      const timelineEvent = new JobTimelineEventEntity(
        null,
        savedJob.id!,
        'APPLIED',
        'Application Submitted',
        `Applied to ${createJobDto.company} for ${createJobDto.role} position via ${createJobDto.appliedVia}`,
        {
          appliedVia: createJobDto.appliedVia,
          location: createJobDto.location,
          locationType: createJobDto.locationType,
        },
        new Date(),
      );
      await this.timelineRepo.save(timelineEvent, ctx);

      // Log activity
      await this.activityLogRepo.logActivity(
        {
          tableName: 'Job',
          recordId: savedJob.id!,
          action: 'create',
          eventType: 'create',
          changes: [
            {
              fieldName: 'company',
              oldValue: null,
              newValue: savedJob.company,
            },
            { fieldName: 'role', oldValue: null, newValue: savedJob.role },
            { fieldName: 'status', oldValue: null, newValue: savedJob.status },
          ],
          metadata: { ...meta, actionedBy: authId },
        },
        ctx,
      );

      return savedJob;
    });

    this.customLogger.log(
      `Job application created successfully: ${job.id}`,
      'JobService',
    );
    return job;
  }

  async findAllJobs(authId: string, filterDto: JobFilterDto) {
    return this.jobRepo.findAllByUser(authId, filterDto);
  }

  async findJobById(authId: string, jobId: string, includeRelations = false) {
    const job = await this.jobRepo.findById(jobId);

    if (!job) throw new EntityNotFoundException('Job', jobId);
    if (job.authId !== authId)
      throw new AuthorizationException('You do not have access to this job');
    if (job.isDeleted) throw new EntityNotFoundException('Job', jobId);

    // If relations requested, fetch them separately
    if (includeRelations) {
      const [followUps, notes, timeline] = await Promise.all([
        this.followUpRepo.findAllByJob(jobId),
        this.noteRepo.findAllByJob(jobId),
        this.timelineRepo.findAllByJob(jobId),
      ]);
      return { ...job, followUps, jobNotes: notes, timeline };
    }

    return job;
  }

  async updateJob(
    authId: string,
    jobId: string,
    updateJobDto: UpdateJobDto,
    meta: ActivityLogMetadata,
  ) {
    const existingJob = await this.findJobById(authId, jobId);
    const jobEntity = existingJob as JobEntity;

    this.customLogger.log(
      `Updating job: ${jobId} for user: ${authId}`,
      'JobService',
    );

    const updatedJob = await this.unitOfWork.execute(async (ctx) => {
      jobEntity.applyPatch(this.toJobPatch(updateJobDto));

      // Handle status change via domain method
      if (
        updateJobDto.status !== undefined &&
        updateJobDto.status !== (existingJob as JobEntity).status
      ) {
        const previousStatus = (existingJob as JobEntity).status;
        const timelineEventType = jobEntity.changeStatus(updateJobDto.status);

        await this.timelineRepo.save(
          new JobTimelineEventEntity(
            null,
            jobId,
            timelineEventType,
            `Status changed to ${updateJobDto.status}`,
            `Job status changed from ${previousStatus} to ${updateJobDto.status}`,
            { previousStatus, newStatus: updateJobDto.status },
            new Date(),
          ),
          ctx,
        );
      }

      // Handle response status change
      if (updateJobDto.responseStatus !== undefined) {
        const changed = jobEntity.updateResponseStatus(
          updateJobDto.responseStatus,
        );
        if (changed && updateJobDto.responseStatus === 'RESPONSE_RECEIVED') {
          await this.timelineRepo.save(
            new JobTimelineEventEntity(
              null,
              jobId,
              'RESPONSE_RECEIVED',
              'Response Received',
              `Received a response from ${jobEntity.company}`,
              null,
              new Date(),
            ),
            ctx,
          );
        }
      }

      // Handle interview scheduled
      if (
        updateJobDto.interviewScheduled &&
        !(existingJob as JobEntity).interviewScheduled &&
        updateJobDto.interviewDate
      ) {
        await this.timelineRepo.save(
          new JobTimelineEventEntity(
            null,
            jobId,
            'INTERVIEW_SCHEDULED',
            'Interview Scheduled',
            `Interview scheduled for ${new Date(updateJobDto.interviewDate).toLocaleDateString()}`,
            {
              interviewDate: updateJobDto.interviewDate,
              interviewType: updateJobDto.interviewType,
              interviewRound: updateJobDto.interviewRound,
            },
            new Date(),
          ),
          ctx,
        );
      }

      const saved = await this.jobRepo.saveInTransaction(jobEntity, ctx);

      // Log activity
      await this.activityLogRepo.logActivity(
        {
          tableName: 'Job',
          recordId: jobId,
          action: 'update',
          eventType: 'update',
          metadata: { ...meta, actionedBy: authId },
        },
        ctx,
      );

      return saved;
    });

    this.customLogger.log(`Job updated successfully: ${jobId}`, 'JobService');
    return updatedJob;
  }

  async deleteJob(authId: string, jobId: string, meta: ActivityLogMetadata) {
    const existingJob = await this.findJobById(authId, jobId);

    this.customLogger.log(
      `Soft deleting job: ${jobId} for user: ${authId}`,
      'JobService',
    );

    await this.unitOfWork.execute(async (ctx) => {
      await this.jobRepo.softDelete(jobId, ctx);
      await this.activityLogRepo.logActivity(
        {
          tableName: 'Job',
          recordId: jobId,
          action: 'delete',
          eventType: 'delete',
          changes: [
            {
              fieldName: 'company',
              oldValue: (existingJob as JobEntity).company,
              newValue: null,
            },
            {
              fieldName: 'role',
              oldValue: (existingJob as JobEntity).role,
              newValue: null,
            },
          ],
          metadata: { ...meta, actionedBy: authId },
        },
        ctx,
      );
    });

    return { message: 'Job deleted successfully' };
  }

  async hardDeleteJob(authId: string, jobId: string) {
    const job = await this.jobRepo.findById(jobId);
    if (!job || job.authId !== authId)
      throw new EntityNotFoundException('Job', jobId);
    await this.jobRepo.hardDelete(jobId);
    return { message: 'Job permanently deleted' };
  }

  async toggleArchiveJob(
    authId: string,
    jobId: string,
    meta: ActivityLogMetadata,
  ) {
    void meta;
    const existingJob = (await this.findJobById(authId, jobId)) as JobEntity;
    existingJob.toggleArchive();
    return this.jobRepo.save(existingJob);
  }

  async toggleFavoriteJob(authId: string, jobId: string) {
    const existingJob = (await this.findJobById(authId, jobId)) as JobEntity;
    existingJob.toggleFavorite();
    return this.jobRepo.save(existingJob);
  }

  async bulkArchiveJobs(authId: string, jobIds: string[]) {
    const jobs = await this.jobRepo.findManyByIds(jobIds, authId);
    if (jobs.length !== jobIds.length) {
      throw new AuthorizationException(
        'Some jobs were not found or you do not have access',
      );
    }
    await this.jobRepo.bulkUpdate(jobIds, authId, { isArchived: true });
    return { message: `${jobIds.length} jobs archived successfully` };
  }

  async bulkDeleteJobs(authId: string, jobIds: string[]) {
    const jobs = await this.jobRepo.findManyByIds(jobIds, authId);
    if (jobs.length !== jobIds.length) {
      throw new AuthorizationException(
        'Some jobs were not found or you do not have access',
      );
    }
    await this.jobRepo.bulkUpdate(jobIds, authId, { deletedAt: new Date() });
    return { message: `${jobIds.length} jobs deleted successfully` };
  }

  // ================================
  // Follow-Up Operations
  // ================================

  async createFollowUp(
    authId: string,
    jobId: string,
    dto: CreateJobFollowUpDto,
  ) {
    await this.findJobById(authId, jobId);

    return this.unitOfWork.execute(async (ctx) => {
      const entity = new JobFollowUpEntity(
        null,
        jobId,
        new Date(dto.scheduledDate),
        null,
        'PENDING',
        dto.type,
        dto.subject ?? null,
        dto.message ?? null,
        null,
        new Date(),
        new Date(),
      );
      const saved = await this.followUpRepo.save(entity, ctx);

      // Update job's next follow-up date
      const nextPending = await this.followUpRepo.findNextPending(jobId);
      if (nextPending) {
        const job = (await this.jobRepo.findById(jobId))!;
        job.applyPatch({ nextFollowUpDate: nextPending.scheduledDate });
        await this.jobRepo.saveInTransaction(job, ctx);
      }

      await this.timelineRepo.save(
        new JobTimelineEventEntity(
          null,
          jobId,
          'FOLLOW_UP_SENT',
          'Follow-up Scheduled',
          `${dto.type} follow-up scheduled for ${new Date(dto.scheduledDate).toLocaleDateString()}`,
          { followUpId: saved.id, type: dto.type },
          new Date(),
        ),
        ctx,
      );

      return saved;
    });
  }

  async getFollowUps(authId: string, jobId: string) {
    await this.findJobById(authId, jobId);
    return this.followUpRepo.findAllByJob(jobId);
  }

  async updateFollowUp(
    authId: string,
    jobId: string,
    followUpId: string,
    dto: UpdateJobFollowUpDto,
  ) {
    await this.findJobById(authId, jobId);
    const followUp = await this.followUpRepo.findById(followUpId);
    if (!followUp || followUp.jobId !== jobId)
      throw new EntityNotFoundException('Follow-up', followUpId);

    if (dto.scheduledDate) followUp.scheduledDate = new Date(dto.scheduledDate);
    if (dto.completedDate) followUp.completedDate = new Date(dto.completedDate);
    if (dto.status) followUp.status = dto.status;
    if (dto.type) followUp.type = dto.type;
    if (dto.subject !== undefined) followUp.subject = dto.subject ?? null;
    if (dto.message !== undefined) followUp.message = dto.message ?? null;
    if (dto.response !== undefined) followUp.response = dto.response ?? null;

    return this.followUpRepo.save(followUp);
  }

  async completeFollowUp(
    authId: string,
    jobId: string,
    followUpId: string,
    dto: CompleteJobFollowUpDto,
  ) {
    await this.findJobById(authId, jobId);
    const followUp = await this.followUpRepo.findById(followUpId);
    if (!followUp || followUp.jobId !== jobId)
      throw new EntityNotFoundException('Follow-up', followUpId);

    return this.unitOfWork.execute(async (ctx) => {
      followUp.complete(dto.response);
      if (dto.status) followUp.status = dto.status;
      const saved = await this.followUpRepo.save(followUp, ctx);

      // Update job follow-up tracking
      const job = (await this.jobRepo.findById(jobId))!;
      const nextPending = await this.followUpRepo.findNextPending(jobId);
      job.recordFollowUpCompleted(nextPending?.scheduledDate ?? null);
      await this.jobRepo.saveInTransaction(job, ctx);

      return saved;
    });
  }

  async deleteFollowUp(authId: string, jobId: string, followUpId: string) {
    await this.findJobById(authId, jobId);
    const followUp = await this.followUpRepo.findById(followUpId);
    if (!followUp || followUp.jobId !== jobId)
      throw new EntityNotFoundException('Follow-up', followUpId);
    await this.followUpRepo.delete(followUpId);
    return { message: 'Follow-up deleted successfully' };
  }

  // ================================
  // Note Operations
  // ================================

  async createNote(authId: string, jobId: string, dto: CreateJobNoteDto) {
    await this.findJobById(authId, jobId);

    return this.unitOfWork.execute(async (ctx) => {
      const entity = new JobNoteEntity(
        null,
        jobId,
        dto.title,
        dto.content,
        dto.isPinned || false,
        dto.category ?? null,
        new Date(),
        new Date(),
      );
      const saved = await this.noteRepo.save(entity);

      await this.timelineRepo.save(
        new JobTimelineEventEntity(
          null,
          jobId,
          'NOTE_ADDED',
          'Note Added',
          dto.title,
          { noteId: saved.id, category: dto.category },
          new Date(),
        ),
        ctx,
      );

      return saved;
    });
  }

  async getNotes(authId: string, jobId: string) {
    await this.findJobById(authId, jobId);
    return this.noteRepo.findAllByJob(jobId);
  }

  async updateNote(
    authId: string,
    jobId: string,
    noteId: string,
    dto: UpdateJobNoteDto,
  ) {
    await this.findJobById(authId, jobId);
    const note = await this.noteRepo.findById(noteId);
    if (!note || note.jobId !== jobId)
      throw new EntityNotFoundException('Note', noteId);

    if (dto.title !== undefined) note.title = dto.title;
    if (dto.content !== undefined) note.content = dto.content;
    if (dto.isPinned !== undefined) note.isPinned = dto.isPinned;
    if (dto.category !== undefined) note.category = dto.category ?? null;

    return this.noteRepo.save(note);
  }

  async togglePinNote(authId: string, jobId: string, noteId: string) {
    await this.findJobById(authId, jobId);
    const note = await this.noteRepo.findById(noteId);
    if (!note || note.jobId !== jobId)
      throw new EntityNotFoundException('Note', noteId);
    note.togglePin();
    return this.noteRepo.save(note);
  }

  async deleteNote(authId: string, jobId: string, noteId: string) {
    await this.findJobById(authId, jobId);
    const note = await this.noteRepo.findById(noteId);
    if (!note || note.jobId !== jobId)
      throw new EntityNotFoundException('Note', noteId);
    await this.noteRepo.delete(noteId);
    return { message: 'Note deleted successfully' };
  }

  // ================================
  // Timeline & Statistics
  // ================================

  async getTimeline(authId: string, jobId: string) {
    await this.findJobById(authId, jobId);
    return this.timelineRepo.findAllByJob(jobId);
  }

  async addTimelineEvent(
    authId: string,
    jobId: string,
    title: string,
    description?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.findJobById(authId, jobId);
    return this.timelineRepo.save(
      new JobTimelineEventEntity(
        null,
        jobId,
        'CUSTOM',
        title,
        description ?? null,
        metadata ?? null,
        new Date(),
      ),
    );
  }

  async getStatistics(authId: string) {
    return this.jobRepo.getStatistics(authId);
  }

  private toJobPatch(dto: UpdateJobDto): JobPatch {
    return {
      company: dto.company,
      companyUrl:
        dto.companyUrl !== undefined ? (dto.companyUrl ?? null) : undefined,
      companyLinkedin:
        dto.companyLinkedin !== undefined
          ? (dto.companyLinkedin ?? null)
          : undefined,
      companyFacebook:
        dto.companyFacebook !== undefined
          ? (dto.companyFacebook ?? null)
          : undefined,
      companyTwitter:
        dto.companyTwitter !== undefined
          ? (dto.companyTwitter ?? null)
          : undefined,
      companyLogo:
        dto.companyLogo !== undefined ? (dto.companyLogo ?? null) : undefined,
      role: dto.role,
      location: dto.location,
      locationType: dto.locationType,
      salaryDisplay:
        dto.salaryDisplay !== undefined
          ? (dto.salaryDisplay ?? null)
          : undefined,
      salaryMin:
        dto.salaryMin !== undefined ? (dto.salaryMin ?? null) : undefined,
      salaryMax:
        dto.salaryMax !== undefined ? (dto.salaryMax ?? null) : undefined,
      salaryCurrency: dto.salaryCurrency,
      contactPerson:
        dto.contactPerson !== undefined
          ? (dto.contactPerson ?? null)
          : undefined,
      contactEmail:
        dto.contactEmail !== undefined ? (dto.contactEmail ?? null) : undefined,
      contactPhone:
        dto.contactPhone !== undefined ? (dto.contactPhone ?? null) : undefined,
      appliedDate:
        dto.appliedDate !== undefined ? new Date(dto.appliedDate) : undefined,
      appliedVia: dto.appliedVia,
      jobPostingUrl:
        dto.jobPostingUrl !== undefined
          ? (dto.jobPostingUrl ?? null)
          : undefined,
      responseDate:
        dto.responseDate !== undefined ? new Date(dto.responseDate) : undefined,
      techStack: dto.techStack,
      jobDescription:
        dto.jobDescription !== undefined
          ? (dto.jobDescription ?? null)
          : undefined,
      requirements:
        dto.requirements !== undefined ? (dto.requirements ?? null) : undefined,
      responsibilities:
        dto.responsibilities !== undefined
          ? (dto.responsibilities ?? null)
          : undefined,
      benefits: dto.benefits !== undefined ? (dto.benefits ?? null) : undefined,
      interviewScheduled: dto.interviewScheduled,
      interviewDate:
        dto.interviewDate !== undefined
          ? new Date(dto.interviewDate)
          : undefined,
      interviewType:
        dto.interviewType !== undefined
          ? (dto.interviewType ?? null)
          : undefined,
      interviewRound:
        dto.interviewRound !== undefined
          ? (dto.interviewRound ?? null)
          : undefined,
      interviewLocation:
        dto.interviewLocation !== undefined
          ? (dto.interviewLocation ?? null)
          : undefined,
      interviewNotes:
        dto.interviewNotes !== undefined
          ? (dto.interviewNotes ?? null)
          : undefined,
      priority: dto.priority,
      tags: dto.tags,
      isFavorite: dto.isFavorite,
      isArchived: dto.isArchived,
      offerAmount:
        dto.offerAmount !== undefined ? (dto.offerAmount ?? null) : undefined,
      offerDate:
        dto.offerDate !== undefined ? new Date(dto.offerDate) : undefined,
      offerDeadline:
        dto.offerDeadline !== undefined
          ? new Date(dto.offerDeadline)
          : undefined,
      offerNotes:
        dto.offerNotes !== undefined ? (dto.offerNotes ?? null) : undefined,
      rejectionReason:
        dto.rejectionReason !== undefined
          ? (dto.rejectionReason ?? null)
          : undefined,
      rejectionDate:
        dto.rejectionDate !== undefined
          ? new Date(dto.rejectionDate)
          : undefined,
      notes: dto.notes !== undefined ? (dto.notes ?? null) : undefined,
      aiParsedData:
        dto.aiParsedData !== undefined ? (dto.aiParsedData ?? null) : undefined,
      aiConfidenceScore:
        dto.aiConfidenceScore !== undefined
          ? (dto.aiConfidenceScore ?? null)
          : undefined,
      sourceType: dto.sourceType,
      rawJobPosting:
        dto.rawJobPosting !== undefined
          ? (dto.rawJobPosting ?? null)
          : undefined,
      nextFollowUpDate:
        dto.nextFollowUpDate !== undefined
          ? new Date(dto.nextFollowUpDate)
          : undefined,
      followUpCount: dto.followUpCount,
      lastFollowUpDate:
        dto.lastFollowUpDate !== undefined
          ? new Date(dto.lastFollowUpDate)
          : undefined,
    };
  }
}
