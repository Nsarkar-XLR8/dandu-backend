import {
  AppliedVia,
  InterviewType,
  JobEntity,
  JobLocationType,
  JobPriority,
  JobSourceType,
  JobStatus,
  ResponseStatus,
} from './job.entity';

const createJob = (overrides: Partial<JobEntity> = {}) => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const job = new JobEntity({
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
    appliedDate: now,
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
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  return Object.assign(job, overrides);
};

describe('JobEntity', () => {
  it('maps status changes to timeline events', () => {
    const job = createJob();

    expect(job.changeStatus(JobStatus.INTERVIEW)).toBe('INTERVIEW_SCHEDULED');
    expect(job.status).toBe(JobStatus.INTERVIEW);

    expect(job.changeStatus(JobStatus.OFFER)).toBe('OFFER_RECEIVED');
    expect(job.status).toBe(JobStatus.OFFER);
  });

  it('keeps same-status changes as a no-op event', () => {
    const job = createJob({ status: JobStatus.APPLIED });

    expect(job.changeStatus(JobStatus.APPLIED)).toBe('STATUS_CHANGED');
    expect(job.status).toBe(JobStatus.APPLIED);
  });

  it('sets response date only when a response is first received', () => {
    const existingDate = new Date('2026-02-01T00:00:00.000Z');
    const job = createJob();

    expect(job.updateResponseStatus(ResponseStatus.RESPONSE_RECEIVED)).toBe(
      true,
    );
    expect(job.responseDate).toBeInstanceOf(Date);

    job.responseDate = existingDate;
    expect(job.updateResponseStatus(ResponseStatus.RESPONSE_RECEIVED)).toBe(
      false,
    );
    expect(job.responseDate).toBe(existingDate);
  });

  it('toggles archive/favorite state and soft deletes', () => {
    const job = createJob();

    expect(job.toggleArchive()).toBe(true);
    expect(job.toggleFavorite()).toBe(true);

    job.softDelete();
    expect(job.isDeleted).toBe(true);
    expect(job.deletedAt).toBeInstanceOf(Date);
  });

  it('applies partial patches without clobbering omitted fields', () => {
    const job = createJob();

    job.applyPatch({
      company: 'Globex',
      companyUrl: null,
      salaryMin: 120000,
      tags: ['backend', 'remote'],
    });

    expect(job.company).toBe('Globex');
    expect(job.companyUrl).toBeNull();
    expect(job.salaryMin).toBe(120000);
    expect(job.tags).toEqual(['backend', 'remote']);
    expect(job.role).toBe('Backend Engineer');
  });

  it('schedules interviews and records completed follow-ups', () => {
    const job = createJob();
    const interviewDate = new Date('2026-03-01T10:00:00.000Z');
    const nextFollowUpDate = new Date('2026-03-05T10:00:00.000Z');

    job.scheduleInterview(
      interviewDate,
      InterviewType.TECHNICAL,
      2,
      'Google Meet',
    );
    job.recordFollowUpCompleted(nextFollowUpDate);

    expect(job.interviewScheduled).toBe(true);
    expect(job.interviewDate).toBe(interviewDate);
    expect(job.interviewType).toBe(InterviewType.TECHNICAL);
    expect(job.interviewRound).toBe(2);
    expect(job.interviewLocation).toBe('Google Meet');
    expect(job.followUpCount).toBe(1);
    expect(job.lastFollowUpDate).toBeInstanceOf(Date);
    expect(job.nextFollowUpDate).toBe(nextFollowUpDate);
  });
});
