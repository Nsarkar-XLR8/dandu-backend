import { Module } from '@nestjs/common';
import { JobController } from './infrastructure/controllers/job.controller';
import { JobService } from './application/services/job.service';
import { AuthModule } from '../auth/auth.module';

// Repository injection tokens
import { JOB_REPOSITORY_TOKEN } from './domain/repositories/job.repository.interface';
import { JOB_FOLLOW_UP_REPOSITORY_TOKEN } from './domain/repositories/job-follow-up.repository.interface';
import { JOB_NOTE_REPOSITORY_TOKEN } from './domain/repositories/job-note.repository.interface';
import { JOB_TIMELINE_REPOSITORY_TOKEN } from './domain/repositories/job-timeline.repository.interface';
import { ACTIVITY_LOG_REPOSITORY_TOKEN } from '../common/domain/repositories/activity-log.repository.interface';
import { LOGGER_TOKEN } from '../common/domain/interfaces/logger.interface';
import { UNIT_OF_WORK_TOKEN } from '../common/domain/interfaces/unit-of-work.interface';

// Prisma adapters (implementations)
import { PrismaJobRepository } from './infrastructure/persistence/prisma-job.repository';
import { PrismaJobFollowUpRepository } from './infrastructure/persistence/prisma-job-follow-up.repository';
import { PrismaJobNoteRepository } from './infrastructure/persistence/prisma-job-note.repository';
import { PrismaJobTimelineRepository } from './infrastructure/persistence/prisma-job-timeline.repository';
import { PrismaActivityLogRepository } from '../common/infrastructure/persistence/prisma-activity-log.repository';

/**
 * Job Module — Hexagonal Architecture Wiring
 *
 * Uses NestJS provide/useClass to inject Prisma adapters
 * into the repository port tokens. The application service (JobService)
 * only knows about the interfaces, never the implementations.
 *
 * To swap databases: replace useClass values with different adapters.
 */
@Module({
  imports: [AuthModule],
  controllers: [JobController],
  providers: [
    {
      provide: JobService,
      useFactory: (
        jobRepo,
        followUpRepo,
        noteRepo,
        timelineRepo,
        unitOfWork,
        activityLogRepo,
        logger,
      ) =>
        new JobService(
          jobRepo,
          followUpRepo,
          noteRepo,
          timelineRepo,
          unitOfWork,
          activityLogRepo,
          logger,
        ),
      inject: [
        JOB_REPOSITORY_TOKEN,
        JOB_FOLLOW_UP_REPOSITORY_TOKEN,
        JOB_NOTE_REPOSITORY_TOKEN,
        JOB_TIMELINE_REPOSITORY_TOKEN,
        UNIT_OF_WORK_TOKEN,
        ACTIVITY_LOG_REPOSITORY_TOKEN,
        LOGGER_TOKEN,
      ],
    },
    // Port → Adapter bindings
    { provide: JOB_REPOSITORY_TOKEN, useClass: PrismaJobRepository },
    {
      provide: JOB_FOLLOW_UP_REPOSITORY_TOKEN,
      useClass: PrismaJobFollowUpRepository,
    },
    { provide: JOB_NOTE_REPOSITORY_TOKEN, useClass: PrismaJobNoteRepository },
    {
      provide: JOB_TIMELINE_REPOSITORY_TOKEN,
      useClass: PrismaJobTimelineRepository,
    },
    {
      provide: ACTIVITY_LOG_REPOSITORY_TOKEN,
      useClass: PrismaActivityLogRepository,
    },
  ],
  exports: [JobService],
})
export class JobModule {}
