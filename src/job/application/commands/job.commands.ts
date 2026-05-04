import {
  AppliedVia,
  FollowUpStatus,
  FollowUpType,
  InterviewType,
  JobLocationType,
  JobPriority,
  JobSourceType,
  JobStatus,
  ResponseStatus,
} from '../../domain/entities/job.entity';
import { JobFilterParams } from '../../domain/repositories/job.repository.interface';

export type JobFilterCommand = JobFilterParams;

export interface CreateJobCommand {
  company: string;
  role: string;
  location: string;
  appliedDate: string;
  appliedVia: AppliedVia;
  companyUrl?: string | null;
  companyLinkedin?: string | null;
  companyFacebook?: string | null;
  companyTwitter?: string | null;
  companyLogo?: string | null;
  locationType?: JobLocationType;
  salaryDisplay?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  jobPostingUrl?: string | null;
  status?: JobStatus;
  responseStatus?: ResponseStatus;
  responseDate?: string | null;
  techStack?: string[];
  jobDescription?: string | null;
  requirements?: string | null;
  responsibilities?: string | null;
  benefits?: string | null;
  interviewScheduled?: boolean;
  interviewDate?: string | null;
  interviewType?: InterviewType | null;
  interviewRound?: number | null;
  interviewLocation?: string | null;
  interviewNotes?: string | null;
  priority?: JobPriority;
  tags?: string[];
  isFavorite?: boolean;
  isArchived?: boolean;
  offerAmount?: number | null;
  offerDate?: string | null;
  offerDeadline?: string | null;
  offerNotes?: string | null;
  rejectionReason?: string | null;
  rejectionDate?: string | null;
  notes?: string | null;
  aiParsedData?: Record<string, unknown> | null;
  aiConfidenceScore?: number | null;
  sourceType?: JobSourceType;
  rawJobPosting?: string | null;
  nextFollowUpDate?: string | null;
}

export interface UpdateJobCommand extends Partial<CreateJobCommand> {
  followUpCount?: number;
  lastFollowUpDate?: string | null;
}

export interface CreateJobFollowUpCommand {
  scheduledDate: string;
  type: FollowUpType;
  subject?: string | null;
  message?: string | null;
}

export interface UpdateJobFollowUpCommand
  extends Partial<CreateJobFollowUpCommand> {
  completedDate?: string | null;
  status?: FollowUpStatus;
  response?: string | null;
}

export interface CompleteJobFollowUpCommand {
  response?: string | null;
  status?: FollowUpStatus;
}

export interface CreateJobNoteCommand {
  title: string;
  content: string;
  isPinned?: boolean;
  category?: string | null;
}

export type UpdateJobNoteCommand = Partial<CreateJobNoteCommand>;
