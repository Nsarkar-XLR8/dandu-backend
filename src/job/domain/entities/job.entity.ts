/**
 * Job Domain Entity
 *
 * Pure domain object representing a job application.
 * Contains business logic and invariant enforcement — no Prisma types.
 *
 * Design Decisions:
 * - Properties are readonly. State changes go through explicit methods
 *   that enforce business rules (e.g., status transitions).
 * - Dates are stored as Date objects, not strings.
 * - The entity does NOT extend a base class — composition over inheritance.
 */
export interface JobProps {
  id: string | null;
  authId: string;
  company: string;
  companyUrl: string | null;
  companyLinkedin: string | null;
  companyFacebook: string | null;
  companyTwitter: string | null;
  companyLogo: string | null;
  role: string;
  location: string;
  locationType: JobLocationType;
  salaryDisplay: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  appliedDate: Date;
  appliedVia: AppliedVia;
  jobPostingUrl: string | null;
  status: JobStatus;
  responseStatus: ResponseStatus;
  responseDate: Date | null;
  techStack: string[];
  jobDescription: string | null;
  requirements: string | null;
  responsibilities: string | null;
  benefits: string | null;
  interviewScheduled: boolean;
  interviewDate: Date | null;
  interviewType: InterviewType | null;
  interviewRound: number | null;
  interviewLocation: string | null;
  interviewNotes: string | null;
  priority: JobPriority;
  tags: string[];
  isFavorite: boolean;
  isArchived: boolean;
  offerAmount: number | null;
  offerDate: Date | null;
  offerDeadline: Date | null;
  offerNotes: string | null;
  rejectionReason: string | null;
  rejectionDate: Date | null;
  notes: string | null;
  aiParsedData: Record<string, unknown> | null;
  aiConfidenceScore: number | null;
  sourceType: JobSourceType;
  rawJobPosting: string | null;
  nextFollowUpDate: Date | null;
  followUpCount: number;
  lastFollowUpDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type JobPatch = Partial<
  Omit<
    JobProps,
    'id' | 'authId' | 'status' | 'responseStatus' | 'createdAt' | 'updatedAt'
  >
>;

export class JobEntity {
  public readonly id: string | null;
  public readonly authId: string;
  public company: string;
  public companyUrl: string | null;
  public companyLinkedin: string | null;
  public companyFacebook: string | null;
  public companyTwitter: string | null;
  public companyLogo: string | null;
  public role: string;
  public location: string;
  public locationType: JobLocationType;
  public salaryDisplay: string | null;
  public salaryMin: number | null;
  public salaryMax: number | null;
  public salaryCurrency: string;
  public contactPerson: string | null;
  public contactEmail: string | null;
  public contactPhone: string | null;
  public appliedDate: Date;
  public appliedVia: AppliedVia;
  public jobPostingUrl: string | null;
  public status: JobStatus;
  public responseStatus: ResponseStatus;
  public responseDate: Date | null;
  public techStack: string[];
  public jobDescription: string | null;
  public requirements: string | null;
  public responsibilities: string | null;
  public benefits: string | null;
  public interviewScheduled: boolean;
  public interviewDate: Date | null;
  public interviewType: InterviewType | null;
  public interviewRound: number | null;
  public interviewLocation: string | null;
  public interviewNotes: string | null;
  public priority: JobPriority;
  public tags: string[];
  public isFavorite: boolean;
  public isArchived: boolean;
  public offerAmount: number | null;
  public offerDate: Date | null;
  public offerDeadline: Date | null;
  public offerNotes: string | null;
  public rejectionReason: string | null;
  public rejectionDate: Date | null;
  public notes: string | null;
  public aiParsedData: Record<string, unknown> | null;
  public aiConfidenceScore: number | null;
  public sourceType: JobSourceType;
  public rawJobPosting: string | null;
  public nextFollowUpDate: Date | null;
  public followUpCount: number;
  public lastFollowUpDate: Date | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public deletedAt: Date | null;

  constructor(props: JobProps) {
    Object.assign(this, props);
  }

  applyPatch(patch: JobPatch): void {
    if (patch.company !== undefined) this.company = patch.company;
    if (patch.companyUrl !== undefined) this.companyUrl = patch.companyUrl;
    if (patch.companyLinkedin !== undefined)
      this.companyLinkedin = patch.companyLinkedin;
    if (patch.companyFacebook !== undefined)
      this.companyFacebook = patch.companyFacebook;
    if (patch.companyTwitter !== undefined)
      this.companyTwitter = patch.companyTwitter;
    if (patch.companyLogo !== undefined) this.companyLogo = patch.companyLogo;
    if (patch.role !== undefined) this.role = patch.role;
    if (patch.location !== undefined) this.location = patch.location;
    if (patch.locationType !== undefined)
      this.locationType = patch.locationType;
    if (patch.salaryDisplay !== undefined)
      this.salaryDisplay = patch.salaryDisplay;
    if (patch.salaryMin !== undefined) this.salaryMin = patch.salaryMin;
    if (patch.salaryMax !== undefined) this.salaryMax = patch.salaryMax;
    if (patch.salaryCurrency !== undefined)
      this.salaryCurrency = patch.salaryCurrency;
    if (patch.contactPerson !== undefined)
      this.contactPerson = patch.contactPerson;
    if (patch.contactEmail !== undefined)
      this.contactEmail = patch.contactEmail;
    if (patch.contactPhone !== undefined)
      this.contactPhone = patch.contactPhone;
    if (patch.appliedDate !== undefined) this.appliedDate = patch.appliedDate;
    if (patch.appliedVia !== undefined) this.appliedVia = patch.appliedVia;
    if (patch.jobPostingUrl !== undefined)
      this.jobPostingUrl = patch.jobPostingUrl;
    if (patch.responseDate !== undefined)
      this.responseDate = patch.responseDate;
    if (patch.techStack !== undefined) this.techStack = patch.techStack;
    if (patch.jobDescription !== undefined)
      this.jobDescription = patch.jobDescription;
    if (patch.requirements !== undefined)
      this.requirements = patch.requirements;
    if (patch.responsibilities !== undefined)
      this.responsibilities = patch.responsibilities;
    if (patch.benefits !== undefined) this.benefits = patch.benefits;
    if (patch.interviewScheduled !== undefined)
      this.interviewScheduled = patch.interviewScheduled;
    if (patch.interviewDate !== undefined)
      this.interviewDate = patch.interviewDate;
    if (patch.interviewType !== undefined)
      this.interviewType = patch.interviewType;
    if (patch.interviewRound !== undefined)
      this.interviewRound = patch.interviewRound;
    if (patch.interviewLocation !== undefined)
      this.interviewLocation = patch.interviewLocation;
    if (patch.interviewNotes !== undefined)
      this.interviewNotes = patch.interviewNotes;
    if (patch.priority !== undefined) this.priority = patch.priority;
    if (patch.tags !== undefined) this.tags = patch.tags;
    if (patch.isFavorite !== undefined) this.isFavorite = patch.isFavorite;
    if (patch.isArchived !== undefined) this.isArchived = patch.isArchived;
    if (patch.offerAmount !== undefined) this.offerAmount = patch.offerAmount;
    if (patch.offerDate !== undefined) this.offerDate = patch.offerDate;
    if (patch.offerDeadline !== undefined)
      this.offerDeadline = patch.offerDeadline;
    if (patch.offerNotes !== undefined) this.offerNotes = patch.offerNotes;
    if (patch.rejectionReason !== undefined)
      this.rejectionReason = patch.rejectionReason;
    if (patch.rejectionDate !== undefined)
      this.rejectionDate = patch.rejectionDate;
    if (patch.notes !== undefined) this.notes = patch.notes;
    if (patch.aiParsedData !== undefined)
      this.aiParsedData = patch.aiParsedData;
    if (patch.aiConfidenceScore !== undefined)
      this.aiConfidenceScore = patch.aiConfidenceScore;
    if (patch.sourceType !== undefined) this.sourceType = patch.sourceType;
    if (patch.rawJobPosting !== undefined)
      this.rawJobPosting = patch.rawJobPosting;
    if (patch.nextFollowUpDate !== undefined)
      this.nextFollowUpDate = patch.nextFollowUpDate;
    if (patch.followUpCount !== undefined)
      this.followUpCount = patch.followUpCount;
    if (patch.lastFollowUpDate !== undefined)
      this.lastFollowUpDate = patch.lastFollowUpDate;
    if (patch.deletedAt !== undefined) this.deletedAt = patch.deletedAt;
  }

  // ================================
  // Business Methods
  // ================================

  /**
   * Archive or unarchive the job.
   * Returns the new archive state for convenience.
   */
  toggleArchive(): boolean {
    this.isArchived = !this.isArchived;
    return this.isArchived;
  }

  /**
   * Toggle favorite status.
   */
  toggleFavorite(): boolean {
    this.isFavorite = !this.isFavorite;
    return this.isFavorite;
  }

  /**
   * Soft-delete the job.
   */
  softDelete(): void {
    this.deletedAt = new Date();
  }

  /**
   * Check if the job is soft-deleted.
   */
  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  /**
   * Change the job status with business rule validation.
   *
   * Returns the timeline event type that should be recorded.
   * The caller (service) is responsible for actually creating the timeline event.
   */
  changeStatus(newStatus: JobStatus): JobTimelineEventType {
    if (newStatus === this.status) {
      return 'STATUS_CHANGED'; // No-op, but don't throw
    }

    this.status = newStatus;

    return JobEntity.mapStatusToTimelineEvent(newStatus);
  }

  /**
   * Update response status and set response date if newly received.
   */
  updateResponseStatus(newStatus: ResponseStatus): boolean {
    if (newStatus === this.responseStatus) {
      return false;
    }

    const previousStatus = this.responseStatus;
    this.responseStatus = newStatus;

    if (newStatus === 'RESPONSE_RECEIVED' && !this.responseDate) {
      this.responseDate = new Date();
    }

    return previousStatus !== newStatus;
  }

  /**
   * Schedule an interview.
   */
  scheduleInterview(
    date: Date,
    type?: InterviewType,
    round?: number,
    location?: string,
  ): void {
    this.interviewScheduled = true;
    this.interviewDate = date;
    if (type) this.interviewType = type;
    if (round) this.interviewRound = round;
    if (location) this.interviewLocation = location;
  }

  /**
   * Update follow-up tracking counters.
   */
  recordFollowUpCompleted(nextFollowUpDate: Date | null): void {
    this.followUpCount += 1;
    this.lastFollowUpDate = new Date();
    this.nextFollowUpDate = nextFollowUpDate;
  }

  // ================================
  // Static Helpers
  // ================================

  static mapStatusToTimelineEvent(status: JobStatus): JobTimelineEventType {
    const statusMap: Record<JobStatus, JobTimelineEventType> = {
      APPLIED: 'APPLIED',
      SCREENING: 'STATUS_CHANGED',
      INTERVIEW: 'INTERVIEW_SCHEDULED',
      OFFER: 'OFFER_RECEIVED',
      REJECTED: 'REJECTED',
      ACCEPTED: 'OFFER_ACCEPTED',
      DECLINED: 'OFFER_DECLINED',
      WITHDRAWN: 'WITHDRAWN',
    };
    return statusMap[status] || 'STATUS_CHANGED';
  }
}

// ================================
// Domain Enums (mirrored from Prisma for domain independence)
// ================================
// These mirror the Prisma enums but exist in the domain layer so
// domain entities don't import from @prisma/client.

export const JobStatus = {
  APPLIED: 'APPLIED',
  SCREENING: 'SCREENING',
  INTERVIEW: 'INTERVIEW',
  OFFER: 'OFFER',
  REJECTED: 'REJECTED',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const ResponseStatus = {
  NO_RESPONSE: 'NO_RESPONSE',
  RESPONSE_RECEIVED: 'RESPONSE_RECEIVED',
  AWAITING_RESPONSE: 'AWAITING_RESPONSE',
} as const;
export type ResponseStatus =
  (typeof ResponseStatus)[keyof typeof ResponseStatus];

export const JobLocationType = {
  REMOTE: 'REMOTE',
  HYBRID: 'HYBRID',
  ONSITE: 'ONSITE',
} as const;
export type JobLocationType =
  (typeof JobLocationType)[keyof typeof JobLocationType];

export const AppliedVia = {
  LINKEDIN: 'LINKEDIN',
  INDEED: 'INDEED',
  COMPANY_WEBSITE: 'COMPANY_WEBSITE',
  REFERRAL: 'REFERRAL',
  RECRUITER: 'RECRUITER',
  JOB_BOARD: 'JOB_BOARD',
  CAREER_FAIR: 'CAREER_FAIR',
  OTHER: 'OTHER',
} as const;
export type AppliedVia = (typeof AppliedVia)[keyof typeof AppliedVia];

export const InterviewType = {
  PHONE_SCREEN: 'PHONE_SCREEN',
  TECHNICAL: 'TECHNICAL',
  BEHAVIORAL: 'BEHAVIORAL',
  SYSTEM_DESIGN: 'SYSTEM_DESIGN',
  ONSITE: 'ONSITE',
  PANEL: 'PANEL',
  FINAL: 'FINAL',
  OTHER: 'OTHER',
} as const;
export type InterviewType = (typeof InterviewType)[keyof typeof InterviewType];

export const JobPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type JobPriority = (typeof JobPriority)[keyof typeof JobPriority];

export const JobSourceType = {
  MANUAL: 'MANUAL',
  AI_URL_PARSED: 'AI_URL_PARSED',
  AI_DESCRIPTION_PARSED: 'AI_DESCRIPTION_PARSED',
  IMPORTED: 'IMPORTED',
  EXTENSION: 'EXTENSION',
} as const;
export type JobSourceType = (typeof JobSourceType)[keyof typeof JobSourceType];

export const JobTimelineEventType = {
  APPLIED: 'APPLIED',
  RESPONSE_RECEIVED: 'RESPONSE_RECEIVED',
  INTERVIEW_SCHEDULED: 'INTERVIEW_SCHEDULED',
  INTERVIEW_COMPLETED: 'INTERVIEW_COMPLETED',
  OFFER_RECEIVED: 'OFFER_RECEIVED',
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  OFFER_DECLINED: 'OFFER_DECLINED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  FOLLOW_UP_SENT: 'FOLLOW_UP_SENT',
  NOTE_ADDED: 'NOTE_ADDED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  DOCUMENT_ADDED: 'DOCUMENT_ADDED',
  CUSTOM: 'CUSTOM',
} as const;
export type JobTimelineEventType =
  (typeof JobTimelineEventType)[keyof typeof JobTimelineEventType];

export const FollowUpStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
} as const;
export type FollowUpStatus =
  (typeof FollowUpStatus)[keyof typeof FollowUpStatus];

export const FollowUpType = {
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  LINKEDIN: 'LINKEDIN',
  OTHER: 'OTHER',
} as const;
export type FollowUpType = (typeof FollowUpType)[keyof typeof FollowUpType];

export const JobDocumentType = {
  RESUME: 'RESUME',
  COVER_LETTER: 'COVER_LETTER',
  PORTFOLIO: 'PORTFOLIO',
  OFFER_LETTER: 'OFFER_LETTER',
  CONTRACT: 'CONTRACT',
  OTHER: 'OTHER',
} as const;
export type JobDocumentType =
  (typeof JobDocumentType)[keyof typeof JobDocumentType];
