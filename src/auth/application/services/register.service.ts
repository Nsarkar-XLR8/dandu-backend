import AppError from '../../../common/errors/app.error';
import { AUTH_POLICY } from '../policies/auth.policy';
import { AuthUserEntity } from '../../domain/entities/auth-user.entity';
import { RegisterUserCommand } from '../commands/register.commands';
import type { IActivityRecorder } from '../../../common/domain/interfaces/activity-recorder.interface';
import type { IAppConfig } from '../../../common/domain/interfaces/app-config.interface';
import type { ICacheStore } from '../../../common/domain/interfaces/cache-store.interface';
import type { IEmailSender } from '../../../common/domain/interfaces/email-sender.interface';
import type { IPasswordHasher } from '../../../common/domain/interfaces/password-hasher.interface';
import type { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.interface';
import type { IAuthSecurityRepository } from '../../domain/repositories/auth-security.repository.interface';
import type { IEmailHistoryRepository } from '../../domain/repositories/email-history.repository.interface';
import type { IUnitOfWork } from '../../../common/domain/interfaces/unit-of-work.interface';
import type { ILogger } from '../../../common/domain/interfaces/logger.interface';
import { AuthUtilsService } from './auth-utils.service';

export class RegisterService {
  constructor(
    private readonly authUtilsService: AuthUtilsService,
    private readonly activityLogService: IActivityRecorder,
    private readonly appConfig: IAppConfig,
    private readonly customLogger: ILogger,
    private readonly cacheStore: ICacheStore,
    private readonly emailSender: IEmailSender,
    private readonly passwordHasher: IPasswordHasher,
    private readonly authUserRepo: IAuthUserRepository,
    private readonly authSecurityRepo: IAuthSecurityRepository,
    private readonly emailHistoryRepo: IEmailHistoryRepository,
    private readonly unitOfWork: IUnitOfWork,
  ) {}

  async create(
    payload: RegisterUserCommand,
    meta: { ip: string; userAgent: string; device?: string; requestId?: string },
  ): Promise<void> {
    const { ip, userAgent, device } = meta;
    const { email, password, username } = payload;
    const { VERIFICATION } = AUTH_POLICY.TOKEN_EXPIRY;

    await Promise.all([
      this.authUtilsService.checkRateLimit(
        `register:email:${email}`,
        AUTH_POLICY.RATE_LIMIT.LOGIN_MAX_ATTEMPTS,
        AUTH_POLICY.RATE_LIMIT.LOGIN_WINDOW_MS,
      ),
      this.authUtilsService.checkRateLimit(
        `register:ip:${ip}`,
        AUTH_POLICY.RATE_LIMIT.LOGIN_MAX_ATTEMPTS,
        AUTH_POLICY.RATE_LIMIT.LOGIN_WINDOW_MS,
      ),
    ]);

    // Validate password strength
    if (!this.authUtilsService.validatePassword(password)) {
      throw AppError.badRequest('Password does not meet security requirements');
    }

    // Check if user already exists with email or username
    const existingUser = await this.authUserRepo.findByEmailOrUsername(
      email,
      username,
    );

    if (existingUser) {
      if (existingUser.email === email) {
        this.customLogger.warn(
          `Registration failed: Email already exists - ${email}`,
          'RegisterService',
        );
        throw AppError.conflict('Email already exists!');
      }
      if (existingUser.username === username) {
        this.customLogger.warn(
          `Registration failed: Username already exists - ${username}`,
          'RegisterService',
        );
        throw AppError.conflict('Username already exists!');
      }
    }

    // Generate verification code
    const verificationCode = this.authUtilsService.generateVerificationCode();
    const expiresAt = new Date(
      Date.now() + this.authUtilsService.parseExpiryToSeconds(VERIFICATION) * 1000,
    );

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await this.passwordHasher.hash(password, saltRounds);

    // Create user with auth security in a transaction
    const newUser = await this.unitOfWork.execute(async (ctx) => {
      const userEntity = new AuthUserEntity(
        null,
        email,
        hashedPassword,
        username,
        'USER',
        false,
        'ACTIVE',
        0,
        null,
        'local',
        null,
        new Date(),
        new Date(),
      );

      const user = await this.authUserRepo.save(userEntity, ctx);

      await this.authSecurityRepo.create(
        {
          authId: user.id as string,
          failedAttempts: 0,
          mfaEnabled: false,
          lastPasswordChange: new Date(),
        },
        ctx,
      );

      await this.emailHistoryRepo.create(
        {
          authId: user.id as string,
          emailTo: email,
          emailType: 'verification',
          subject: 'Verify your email address',
          messageId: `verify-${user.id}-${Date.now()}`,
          emailStatus: 'pending',
          ipAddress: ip,
          userAgent,
        },
        ctx,
      );

      await this.activityLogService.logCreate(
        'authUser',
        user.id as string,
        {
          email,
          username,
          role: 'USER',
          status: 'ACTIVE',
          verified: 'false',
          provider: 'local',
        },
        { ip, userAgent, actionedBy: user.id as string, device, requestId: meta.requestId },
        ctx,
      );

      return user;
    });

    // Store verification code in Redis with expiry
    const verificationKey = `${this.appConfig.redis_cache_key_prefix}:${AUTH_POLICY.CACHE_PREFIXES.VERIFICATION_TOKEN}:${email}`;
    const ttlSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

    await this.cacheStore.set(
      verificationKey,
      {
        code: verificationCode,
        userId: newUser.id,
        email: newUser.email,
        expiresAt: expiresAt.toISOString(),
      },
      ttlSeconds,
    );

    // Queue verification email for async processing
    try {
      await this.emailSender.sendVerificationEmail(
        email,
        username,
        verificationCode,
        newUser.id as string,
      );
      this.customLogger.log(
        `User registered successfully: ${email}, verification email queued`,
        'RegisterService',
      );
    } catch (error) {
      this.customLogger.error(
        `Failed to queue verification email for ${email}`,
        error instanceof Error ? error.stack : undefined,
        'RegisterService',
      );
      // Update email history status to 'failed'
      await this.emailHistoryRepo.updateStatusByAuth(
        newUser.id as string,
        'verification',
        'pending',
        'failed',
        error instanceof Error ? error.message : 'Failed to queue email',
      );
    }
  }

  async verifyEmail(
    email: string,
    code: string,
    meta: { ip: string; userAgent: string; requestId?: string },
  ): Promise<{ message: string }> {
    const { ip, userAgent } = meta;

    this.customLogger.log(
      `Email verification attempt for: ${email}`,
      'RegisterService',
    );
    const verificationKey = `${this.appConfig.redis_cache_key_prefix}:${AUTH_POLICY.CACHE_PREFIXES.VERIFICATION_TOKEN}:${email}`;

    // Get verification data from Redis
    const verificationData = await this.cacheStore.get<{
      code: string;
      userId: string;
      email: string;
      expiresAt: string;
    }>(verificationKey);

    if (!verificationData) {
      this.customLogger.warn(
        `Verification failed: Code expired or invalid for ${email}`,
        'RegisterService',
      );
      throw AppError.badRequest(
        'Verification code expired or invalid. Please request a new code.',
      );
    }

    // Validate code
    if (verificationData.code !== code) {
      this.customLogger.warn(
        `Verification failed: Invalid code for ${email}`,
        'RegisterService',
      );
      throw AppError.badRequest('Invalid verification code');
    }

    // Find user
    const user = await this.authUserRepo.findByEmail(email);

    if (!user) {
      throw AppError.notFound('User not found');
    }

    if (user.verified) {
      throw AppError.badRequest('Email already verified');
    }

    // Update user as verified
    await this.unitOfWork.execute(async (ctx) => {
      await this.authUserRepo.updateVerified(user.id as string, true, ctx);

      await this.activityLogService.logCustomEvent(
        'authUser',
        user.id as string,
        'profile_update',
        { ip, userAgent, actionedBy: user.id as string, requestId: meta.requestId },
        [
          {
            fieldName: 'verified',
            oldValue: 'false',
            newValue: 'true',
          },
        ],
        ctx,
      );
    });

    // Delete verification code from Redis
    await this.cacheStore.del(verificationKey);

    // Queue welcome email for async processing
    try {
      await this.emailSender.sendWelcomeEmail(
        email,
        user.username,
        user.id as string,
      );
      this.customLogger.log(
        `Email verified successfully for: ${email}, welcome email queued`,
        'RegisterService',
      );
    } catch (error) {
      this.customLogger.error(
        `Verification successful but failed to queue welcome email for ${email}`,
        error instanceof Error ? error.stack : undefined,
        'RegisterService',
      );
    }

    return { message: 'Email verified successfully' };
  }

  async resendVerificationEmail(
    email: string,
    meta: { ip: string; userAgent: string; requestId?: string },
  ): Promise<{ message: string }> {
    const { ip, userAgent } = meta;
    const { VERIFICATION } = AUTH_POLICY.TOKEN_EXPIRY;

    this.customLogger.log(
      `Resend verification email requested for: ${email}`,
      'RegisterService',
    );

    // Check rate limiting
    await this.authUtilsService.checkRateLimit(
      `resend:verification:${email}`,
      3, // Max 3 attempts
      15 * 60 * 1000, // 15 minutes
    );

    const user = await this.authUserRepo.findByEmail(email);

    if (!user) {
      throw AppError.notFound('User not found');
    }

    if (user.verified) {
      throw AppError.badRequest('Email already verified');
    }

    // Generate new verification code
    const verificationCode = this.authUtilsService.generateVerificationCode();
    const expiresAt = new Date(
      Date.now() + this.authUtilsService.parseExpiryToSeconds(VERIFICATION) * 1000,
    );

    // Store new verification code in Redis
    const verificationKey = `${this.appConfig.redis_cache_key_prefix}:${AUTH_POLICY.CACHE_PREFIXES.VERIFICATION_TOKEN}:${email}`;
    const ttlSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

    await this.cacheStore.set(
      verificationKey,
      {
        code: verificationCode,
        userId: user.id,
        email: user.email,
        expiresAt: expiresAt.toISOString(),
      },
      ttlSeconds,
    );

    await this.emailHistoryRepo.create({
      authId: user.id as string,
      emailTo: email,
      emailType: 'verification',
      subject: 'Verify your email address',
      messageId: `verify-resend-${user.id}-${Date.now()}`,
      emailStatus: 'pending',
      ipAddress: ip,
      userAgent: userAgent,
    });

    // Queue verification email for async processing
    try {
      await this.emailSender.sendVerificationEmail(
        email,
        user.username,
        verificationCode,
        user.id as string,
      );
    } catch (error) {
      this.customLogger.error(
        `Failed to queue verification email for ${email}`,
        error instanceof Error ? error.stack : undefined,
        'RegisterService',
      );
      // Update email history status to 'failed'
      await this.emailHistoryRepo.updateStatusByAuth(
        user.id as string,
        'verification',
        'pending',
        'failed',
        error instanceof Error ? error.message : 'Failed to queue email',
      );
      throw AppError.badRequest('Failed to send verification email');
    }

    return { message: 'Verification email sent successfully' };
  }
}
