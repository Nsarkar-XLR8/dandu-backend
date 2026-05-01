import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JobService } from '../../application/services/job.service';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { userRole } from '../../../auth/interfaces/auth.interface';
import { CustomLoggerService } from '../../../common/services/custom-logger.service';
import { THROTTLER_CONFIG } from '../../../common/config/throttler.config';
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

interface AuthenticatedRequest extends Request {
  user: { userId: string; role: string; tokenVersion: number };
}

@ApiTags('Jobs')
@ApiBearerAuth()
@Controller('jobs')
@UseGuards(AuthGuard, RolesGuard)
@Roles(userRole.CUSTOMER, userRole.ADMIN, userRole.SUPER_ADMIN)
export class JobController {
  constructor(
    private readonly jobService: JobService,
    private readonly customLogger: CustomLoggerService,
  ) {}

  @Post()
  @Throttle({ default: THROTTLER_CONFIG.DEFAULT })
  @ApiOperation({ summary: 'Create a new job application record' })
  @ApiResponse({ status: 201, description: 'Job successfully created' })
  async createJob(
    @Body() createJobDto: CreateJobDto,
    @Req() req: AuthenticatedRequest,
  ) {
    this.customLogger.log(
      `Creating job for user: ${req.user.userId}`,
      'JobController',
    );
    const meta = {
      ip: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };
    return this.jobService.createJob(req.user.userId, createJobDto, meta);
  }

  @Get()
  @ApiOperation({ summary: 'Get all jobs for the authenticated user' })
  @ApiResponse({ status: 200, description: 'List of jobs returned' })
  async findAllJobs(
    @Query() filterDto: JobFilterDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.findAllJobs(req.user.userId, filterDto);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get job application statistics' })
  @ApiResponse({ status: 200, description: 'Statistics returned successfully' })
  async getStatistics(@Req() req: AuthenticatedRequest) {
    return this.jobService.getStatistics(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific job' })
  @ApiResponse({ status: 200, description: 'Job details returned' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async findJobById(
    @Param('id') id: string,
    @Query('include') include: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const includeRelations = include === 'all' || include === 'true';
    return this.jobService.findJobById(req.user.userId, id, includeRelations);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Fully update a job record' })
  @ApiResponse({ status: 200, description: 'Job successfully updated' })
  async updateJob(
    @Param('id') id: string,
    @Body() updateJobDto: UpdateJobDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const meta = {
      ip: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };
    return this.jobService.updateJob(req.user.userId, id, updateJobDto, meta);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update a job record' })
  @ApiResponse({ status: 200, description: 'Job successfully patched' })
  async patchJob(
    @Param('id') id: string,
    @Body() updateJobDto: UpdateJobDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const meta = {
      ip: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };
    return this.jobService.updateJob(req.user.userId, id, updateJobDto, meta);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteJob(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const meta = {
      ip: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };
    return this.jobService.deleteJob(req.user.userId, id, meta);
  }

  @Patch(':id/archive')
  async toggleArchive(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const meta = {
      ip: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };
    return this.jobService.toggleArchiveJob(req.user.userId, id, meta);
  }

  @Patch(':id/favorite')
  async toggleFavorite(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.toggleFavoriteJob(req.user.userId, id);
  }

  @Post('bulk/archive')
  async bulkArchive(
    @Body('jobIds') jobIds: string[],
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.bulkArchiveJobs(req.user.userId, jobIds);
  }

  @Post('bulk/delete')
  async bulkDelete(
    @Body('jobIds') jobIds: string[],
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.bulkDeleteJobs(req.user.userId, jobIds);
  }

  // Follow-Up Endpoints
  @Post(':jobId/follow-ups')
  async createFollowUp(
    @Param('jobId') jobId: string,
    @Body() dto: CreateJobFollowUpDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.createFollowUp(req.user.userId, jobId, dto);
  }

  @Get(':jobId/follow-ups')
  async getFollowUps(
    @Param('jobId') jobId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.getFollowUps(req.user.userId, jobId);
  }

  @Put(':jobId/follow-ups/:followUpId')
  async updateFollowUp(
    @Param('jobId') jobId: string,
    @Param('followUpId') followUpId: string,
    @Body() dto: UpdateJobFollowUpDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.updateFollowUp(
      req.user.userId,
      jobId,
      followUpId,
      dto,
    );
  }

  @Patch(':jobId/follow-ups/:followUpId/complete')
  async completeFollowUp(
    @Param('jobId') jobId: string,
    @Param('followUpId') followUpId: string,
    @Body() dto: CompleteJobFollowUpDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.completeFollowUp(
      req.user.userId,
      jobId,
      followUpId,
      dto,
    );
  }

  @Delete(':jobId/follow-ups/:followUpId')
  @HttpCode(HttpStatus.OK)
  async deleteFollowUp(
    @Param('jobId') jobId: string,
    @Param('followUpId') followUpId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.deleteFollowUp(req.user.userId, jobId, followUpId);
  }

  // Note Endpoints
  @Post(':jobId/notes')
  async createNote(
    @Param('jobId') jobId: string,
    @Body() dto: CreateJobNoteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.createNote(req.user.userId, jobId, dto);
  }

  @Get(':jobId/notes')
  async getNotes(
    @Param('jobId') jobId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.getNotes(req.user.userId, jobId);
  }

  @Put(':jobId/notes/:noteId')
  async updateNote(
    @Param('jobId') jobId: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateJobNoteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.updateNote(req.user.userId, jobId, noteId, dto);
  }

  @Patch(':jobId/notes/:noteId/pin')
  async togglePinNote(
    @Param('jobId') jobId: string,
    @Param('noteId') noteId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.togglePinNote(req.user.userId, jobId, noteId);
  }

  @Delete(':jobId/notes/:noteId')
  @HttpCode(HttpStatus.OK)
  async deleteNote(
    @Param('jobId') jobId: string,
    @Param('noteId') noteId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.deleteNote(req.user.userId, jobId, noteId);
  }

  // Timeline Endpoints
  @Get(':jobId/timeline')
  async getTimeline(
    @Param('jobId') jobId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.getTimeline(req.user.userId, jobId);
  }

  @Post(':jobId/timeline')
  async addTimelineEvent(
    @Param('jobId') jobId: string,
    @Body()
    body: {
      title: string;
      description?: string;
      metadata?: Record<string, unknown>;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.jobService.addTimelineEvent(
      req.user.userId,
      jobId,
      body.title,
      body.description,
      body.metadata,
    );
  }
}
