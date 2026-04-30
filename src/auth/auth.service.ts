import { Inject, Injectable } from '@nestjs/common';
import config from '../common/config/app.config';
import AppError from '../common/errors/app.error';
import { ActivityLogService } from '../common/services/activity-log.service';
import { CustomLoggerService } from '../common/services/custom-logger.service';
import { AUTH_CONFIG } from './config/auth.config';
import { CreateAuthDto } from './dto/create-auth.dto';
import { AuthUserEntity } from './domain/entities/auth-user.entity';
import {
  CACHE_STORE_TOKEN,
  type ICacheStore,
} from '../common/domain/interfaces/cache-store.interface';
import {
  EMAIL_SENDER_TOKEN,
  type IEmailSender,
} from '../common/domain/interfaces/email-sender.interface';
import {
  PASSWORD_HASHER_TOKEN,
  type IPasswordHasher,
} from '../common/domain/interfaces/password-hasher.interface';
import { AUTH_USER_REPOSITORY_TOKEN } from './domain/repositories/auth-user.repository.interface';
import type { IAuthUserRepository } from './domain/repositories/auth-user.repository.interface';
import { AUTH_SECURITY_REPOSITORY_TOKEN } from './domain/repositories/auth-security.repository.interface';
import type { IAuthSecurityRepository } from './domain/repositories/auth-security.repository.interface';
import { EMAIL_HISTORY_REPOSITORY_TOKEN } from './domain/repositories/email-history.repository.interface';
import type { IEmailHistoryRepository } from './domain/repositories/email-history.repository.interface';
import { LOGIN_HISTORY_REPOSITORY_TOKEN } from './domain/repositories/login-history.repository.interface';
import type { ILoginHistoryRepository } from './domain/repositories/login-history.repository.interface';
import { UNIT_OF_WORK_TOKEN } from '../common/domain/interfaces/unit-of-work.interface';
import type { IUnitOfWork } from '../common/domain/interfaces/unit-of-work.interface';
import type {
  ILoginResponse,
  IStoredRefreshToken,
  UserRole,
} from './interfaces/auth.interface';
import { AuthUtilsService } from './services/auth-utils.service';

@Injectable()
export class AuthService {
  private static readonly DUMMY_PASSWORD_HASH =
    '$2b$12$/1ViEnMS3JJ99L.OpLR8pu/iUhTO4gm.segG0raYko6GET68t0MZq';

  constructor(
    private readonly authUtilsService: AuthUtilsService,
    private readonly activityLogService: ActivityLogService,
    private readonly customLogger: CustomLoggerService,
    @Inject(CACHE_STORE_TOKEN)
    private readonly cacheStore: ICacheStore,
    @Inject(EMAIL_SENDER_TOKEN)
    private readonly emailSender: IEmailSender,
    @Inject(PASSWORD_HASHER_TOKEN)
    private readonly passwordHasher: IPasswordHasher,
    @Inject(AUTH_USER_REPOSITORY_TOKEN)
    private readonly authUserRepo: IAuthUserRepository,
    @Inject(AUTH_SECURITY_REPOSITORY_TOKEN)
    private readonly authSecurityRepo: IAuthSecurityRepository,
    @Inject(EMAIL_HISTORY_REPOSITORY_TOKEN)
    private readonly emailHistoryRepo: IEmailHistoryRepository,
    @Inject(LOGIN_HISTORY_REPOSITORY_TOKEN)
    private readonly loginHistoryRepo: ILoginHistoryRepository,
    @Inject(UNIT_OF_WORK_TOKEN)
    private readonly unitOfWork: IUnitOfWork,
  ) {}

  async create(
    payload: CreateAuthDto,
    meta: { ip: string; userAgent: string; device?: string },
  ): Promise<void> {
    const { ip, userAgent, device } = meta;
    const { email, password, username } = payload;
    const { VERIFICATION } = AUTH_CONFIG.TOKEN_EXPIRY;

    await Promise.all([
      this.authUtilsService.checkRateLimit(
        `register:email:${email}`,
        AUTH_CONFIG.RATE_LIMIT.LOGIN_MAX_ATTEMPTS,
        AUTH_CONFIG.RATE_LIMIT.LOGIN_WINDOW_MS,
      ),
      this.authUtilsService.checkRateLimit(
        `register:ip:${ip}`,
        AUTH_CONFIG.RATE_LIMIT.LOGIN_MAX_ATTEMPTS,
        AUTH_CONFIG.RATE_LIMIT.LOGIN_WINDOW_MS,
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
          'AuthService',
        );
        throw AppError.conflict('Email already exists!');
      }
      if (existingUser.username === username) {
        this.customLogger.warn(
          `Registration failed: Username already exists - ${username}`,
          'AuthService',
        );
        throw AppError.conflict('Username already exists!');
      }
    }

    // Generate verification code
    // Generate verification code
    const verificationCode = this.authUtilsService.generateVerificationCode();
    const expiresAt = new Date(
      Date.now() + this.parseExpiryToSeconds(VERIFICATION) * 1000,
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
        { ip, userAgent, actionedBy: user.id as string, device },
        ctx,
      );

      return user;
    });

    // Store verification code in Redis with expiry
    const verificationKey = `${config.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.VERIFICATION_TOKEN}:${email}`;
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
        'AuthService',
      );
    } catch (error) {
      this.customLogger.error(
        `Failed to queue verification email for ${email}`,
        error instanceof Error ? error.stack : undefined,
        'AuthService',
      );
      // Update email history status to 'failed'
      await this.emailHistoryRepo.updateStatusByAuth(
        newUser.id as string,
        'verification',
        'pending',
        'failed',
        error instanceof Error ? error.message : 'Failed to queue email',
      );
      // Don't throw error, user is created, just email failed
    }
  }

  /**
   * Verify user email with verification code
   */
  async verifyEmail(
    email: string,
    code: string,
    meta: { ip: string; userAgent: string },
  ): Promise<{ message: string }> {
    const { ip, userAgent } = meta;

    this.customLogger.log(
      `Email verification attempt for: ${email}`,
      'AuthService',
    );
    const verificationKey = `${config.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.VERIFICATION_TOKEN}:${email}`;

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
        'AuthService',
      );
      throw AppError.badRequest(
        'Verification code expired or invalid. Please request a new code.',
      );
    }

    // Validate code
    if (verificationData.code !== code) {
      this.customLogger.warn(
        `Verification failed: Invalid code for ${email}`,
        'AuthService',
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
        { ip, userAgent, actionedBy: user.id as string },
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
        'AuthService',
      );
    } catch (error) {
      this.customLogger.error(
        `Verification successful but failed to queue welcome email for ${email}`,
        error instanceof Error ? error.stack : undefined,
        'AuthService',
      );
      // Don't throw, verification is successful
    }

    return { message: 'Email verified successfully' };
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(
    email: string,
    meta: { ip: string; userAgent: string },
  ): Promise<{ message: string }> {
    const { ip, userAgent } = meta;
    const { VERIFICATION } = AUTH_CONFIG.TOKEN_EXPIRY;

    this.customLogger.log(
      `Resend verification email requested for: ${email}`,
      'AuthService',
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
      Date.now() + this.parseExpiryToSeconds(VERIFICATION) * 1000,
    );

    // Store new verification code in Redis
    const verificationKey = `${config.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.VERIFICATION_TOKEN}:${email}`;
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
        'AuthService',
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

  async login(
    payload: { email: string; password: string },
    meta: { ip: string; userAgent: string; device?: string },
  ): Promise<ILoginResponse> {
    const { email, password } = payload;
    const { ip, userAgent, device } = meta;

    const { LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS } = AUTH_CONFIG.RATE_LIMIT;
    const { MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_MS } =
      AUTH_CONFIG.ACCOUNT_LOCKOUT;

    // Rate limiting
    await Promise.all([
      this.authUtilsService.checkRateLimit(
        `login:email:${email}`,
        LOGIN_MAX_ATTEMPTS,
        LOGIN_WINDOW_MS,
      ),
      this.authUtilsService.checkRateLimit(
        `login:ip:${ip}`,
        LOGIN_MAX_ATTEMPTS,
        LOGIN_WINDOW_MS,
      ),
    ]);

    // Fetch user with security data in single optimized query
    const authRecord = await this.authUserRepo.findByEmailWithSecurity(email);
    const user = authRecord?.user;
    const security = authRecord?.security;

    // Generic error message to prevent user enumeration
    const invalidCredentialsError = AppError.unauthorized(
      'Invalid email or password',
    );

    // CRITICAL: Timing attack prevention
    // Always run bcrypt.compare even if user doesn't exist
    // This ensures consistent response time regardless of user existence
    if (!user) {
      // Run fake bcrypt to prevent timing attacks (~200ms)
      await this.passwordHasher.compare(
        password,
        AuthService.DUMMY_PASSWORD_HASH,
      );

      // Log failed attempt (fire-and-forget)
      void this.logLoginAttempt({
        authId: null,
        ip,
        userAgent,
        device,
        success: false,
        failureReason: 'user_not_found',
      });

      throw invalidCredentialsError;
    }

    // Check OAuth provider
    if (user.provider !== 'local') {
      throw AppError.badRequest(
        `Please login using ${user.provider} authentication`,
      );
    }

    // Check account status
    if (user.status === 'BLOCKED' || user.status === 'SUSPENDED') {
      await this.handleLockedLoginFailure(
        user.id as string,
        security?.failedAttempts ?? 0,
        security?.lockExpiresAt as Date,
        ip,
        userAgent,
        device,
      );
      await this.passwordHasher.compare(password, user.password);
      throw invalidCredentialsError;
    }

    // Check account lockout
    if (security?.lockExpiresAt && new Date() < security.lockExpiresAt) {
      const remainingTime = Math.ceil(
        (security.lockExpiresAt.getTime() - Date.now()) / 1000 / 60,
      );
      void this.logLoginAttempt({
        authId: user.id,
        ip,
        userAgent,
        device,
        success: false,
        failureReason: 'account_locked',
        attemptNumber: security.failedAttempts + 1,
      });
      throw AppError.forbidden(
        `Account is temporarily locked. Please try again in ${remainingTime} minutes.`,
      );
    }

    // Verify password (bcrypt uses constant-time comparison internally)
    const isPasswordValid = await this.passwordHasher.compare(
      password,
      user.password,
    );

    if (!isPasswordValid) {
      await this.handleFailedLoginAttempt(
        user.id as string,
        security?.failedAttempts || 0,
        MAX_FAILED_ATTEMPTS,
        LOCKOUT_DURATION_MS,
        { ip, userAgent, device },
      );
      throw invalidCredentialsError;
    }

    // Check email verification
    if (!user.verified) {
      void this.logLoginAttempt({
        authId: user.id as string,
        ip,
        userAgent,
        device,
        success: false,
        failureReason: 'email_not_verified',
      });
      throw AppError.forbidden(
        'Please verify your email address before logging in',
      );
    }

    // Distributed lock to prevent concurrent login race conditions
    const lockKey = `${config.redis_cache_key_prefix}:lock:login:${user.id}`;
    const lockAcquired = await this.cacheStore.setNX(lockKey, '1', 5); // 5 second TTL

    if (!lockAcquired) {
      throw AppError.conflict(
        'Another login is in progress. Please try again in a moment.',
      );
    }

    try {
      // Generate JTI FIRST (cryptographically secure)
      const jti: string = this.authUtilsService.generateSecureId();

      // Create access token (stateless, minimal payload - no email)
      const accessToken: string = this.authUtilsService.createAccessToken({
        userId: user.id as string,
        role: user.role as unknown as UserRole,
        tokenVersion: user.tokenVersion, // Include tokenVersion for hybrid JWT validation
      });

      // Create refresh token with JTI embedded
      const refreshToken: string = this.authUtilsService.createRefreshToken(
        { userId: user.id as string },
        jti,
      );

      // Hash the refresh token for secure storage (never store raw tokens)
      const tokenHash: string = this.authUtilsService.hashToken(refreshToken);

      // Calculate TTL
      const refreshTokenTTL = this.parseExpiryToSeconds(
        AUTH_CONFIG.TOKEN_EXPIRY.REFRESH,
      );

      // Redis key with proper naming convention
      const refreshTokenKey = `${config.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.REFRESH_TOKEN}:${user.id}:${jti}`;

      // Stored token data (with hash, not raw token)
      const storedTokenData: IStoredRefreshToken = {
        userId: user.id as string,
        jti,
        tokenHash, // Store hash, not raw token
        ip,
        userAgent,
        device,
        createdAt: new Date().toISOString(),
      };

      // Execute critical Redis operations with detailed error handling and rollback
      try {
        // CRITICAL: Store refresh token hash in Redis
        await this.cacheStore.set(
          refreshTokenKey,
          storedTokenData,
          refreshTokenTTL,
        );
      } catch (error) {
        this.customLogger.error(
          `Failed to store refresh token for user ${user.id}, jti ${jti}: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
          'AuthService',
        );
        throw AppError.serviceUnavailable(
          'Authentication service temporarily unavailable. Please try again.',
        );
      }

      try {
        // CRITICAL: Track session in user's session list
        await this.addUserSession(user.id as string, jti, refreshTokenTTL);
      } catch (error) {
        this.customLogger.error(
          `Failed to add user session for user ${user.id as string}, jti ${jti}: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
          'AuthService',
        );

        // Rollback: Remove the refresh token we just stored
        await this.cacheStore.del(refreshTokenKey).catch((rollbackError) => {
          this.customLogger.error(
            `CRITICAL: Failed to rollback refresh token for user ${user.id}, jti ${jti}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
            rollbackError instanceof Error ? rollbackError.stack : undefined,
            'AuthService',
          );
        });

        throw AppError.serviceUnavailable(
          'Authentication service temporarily unavailable. Please try again.',
        );
      }

      // NON-CRITICAL: Enforce max devices (log but don't fail login)
      try {
        await this.enforceMaxDevices(
          user.id as string,
          AUTH_CONFIG.SESSION.MAX_DEVICES_PER_USER,
        );
      } catch (error) {
        this.customLogger.warn(
          `Failed to enforce max devices for user ${user.id as string}: ${error instanceof Error ? error.message : String(error)}`,
          'AuthService',
        );
        // Continue - login still succeeds
      }

      // NON-CRITICAL: DB operations (fire-and-forget with detailed logging)
      void Promise.allSettled([
        security
          ? this.authSecurityRepo.resetFailedAttempts(security.id)
          : Promise.resolve(),
        this.logLoginAttempt({
          authId: user.id as string,
          ip,
          userAgent,
          device,
          success: true,
        }),
      ]).then((results) => {
        results.forEach((result) => {
          if (result.status === 'rejected') {
            this.customLogger.error(
              `Non-critical login post-process failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
              result.reason instanceof Error ? result.reason.stack : undefined,
              'AuthService',
            );
          }
        });
      });

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id as string,
          email: user.email,
          username: user.username,
          role: user.role,
          verified: user.verified,
        },
        expiresIn: this.parseExpiryToSeconds(AUTH_CONFIG.TOKEN_EXPIRY.ACCESS),
      };
    } finally {
      // Always release the lock
      await this.cacheStore.del(lockKey);
    }
  }

  /**
   * Refresh access token using refresh token
   * Implements token rotation for security
   */
  async refreshToken(
    refreshToken: string,
    meta: { ip: string; userAgent: string; device?: string },
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const { ip, userAgent, device } = meta;

    // Verify and decode refresh token
    let decoded: { userId: string; jti: string };
    try {
      const payload = this.authUtilsService.verifyRefreshToken(refreshToken);

      // JTI comes from JWT standard claims (set via jwtid option)
      if (!payload.jti) {
        throw new Error('Missing JTI in token');
      }

      decoded = {
        userId: payload.userId,
        jti: payload.jti,
      };
    } catch {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }

    const { userId, jti } = decoded;
    if (!userId || !jti) {
      throw AppError.unauthorized('Invalid refresh token payload');
    }

    // Get stored token data from Redis
    const refreshTokenKey = `${config.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.REFRESH_TOKEN}:${userId}:${jti}`;
    const storedData =
      await this.cacheStore.get<IStoredRefreshToken>(refreshTokenKey);

    if (!storedData) {
      // Token not found - possibly already rotated or revoked
      // This could indicate a replay attack - revoke all user tokens
      await this.revokeAllUserTokens(userId);
      throw AppError.unauthorized(
        'Refresh token has been revoked. Please login again.',
      );
    }

    // Validate token hash (ensures token hasn't been tampered with)
    const tokenHash: string = this.authUtilsService.hashToken(refreshToken);
    if (storedData.tokenHash !== tokenHash) {
      // Token mismatch - potential attack, revoke all tokens
      await this.revokeAllUserTokens(userId);
      throw AppError.unauthorized('Invalid refresh token');
    }

    // Fetch user to get current role (may have changed)
    const user = await this.authUserRepo.findByIdSelect(userId, {
      role: true,
      status: true,
      tokenVersion: true,
    });

    if (user?.status !== 'ACTIVE') {
      await this.revokeAllUserTokens(userId);
      throw AppError.unauthorized('User account is not active');
    }

    // TOKEN ROTATION: Generate new JTI for new refresh token
    const newJti: string = this.authUtilsService.generateSecureId();

    // Create new tokens
    const newAccessToken: string = this.authUtilsService.createAccessToken({
      userId: user.id as string,
      role: user.role as unknown as UserRole,
      tokenVersion: user.tokenVersion ?? 0, // Include tokenVersion for hybrid JWT validation
    });

    const newRefreshToken: string = this.authUtilsService.createRefreshToken(
      { userId: user.id as string },
      newJti,
    );

    const newTokenHash: string =
      this.authUtilsService.hashToken(newRefreshToken);
    const refreshTokenTTL = this.parseExpiryToSeconds(
      AUTH_CONFIG.TOKEN_EXPIRY.REFRESH,
    );

    const newRefreshTokenKey = `${config.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.REFRESH_TOKEN}:${userId}:${newJti}`;

    const newStoredData: IStoredRefreshToken = {
      userId,
      jti: newJti,
      tokenHash: newTokenHash,
      ip,
      userAgent,
      device,
      createdAt: new Date().toISOString(),
      rotatedFrom: jti, // Track rotation chain
    };

    // Atomic rotation: delete old token and create new one
    await Promise.all([
      // Delete old refresh token
      this.cacheStore.del(refreshTokenKey),
      // Remove old JTI from session list
      this.removeUserSession(userId, jti),
      // Store new refresh token
      this.cacheStore.set(newRefreshTokenKey, newStoredData, refreshTokenTTL),
      // Add new JTI to session list
      this.addUserSession(userId, newJti, refreshTokenTTL),
    ]);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.parseExpiryToSeconds(AUTH_CONFIG.TOKEN_EXPIRY.ACCESS),
    };
  }

  /**
   * Logout user by revoking their refresh token
   */
  async logout(
    refreshToken: string,
    userId: string,
  ): Promise<{ message: string }> {
    // Verify refresh token
    let decoded: ReturnType<AuthUtilsService['verifyRefreshToken']>;
    try {
      decoded = this.authUtilsService.verifyRefreshToken(refreshToken);
    } catch {
      // Token already invalid, just return success
      return { message: 'Logged out successfully' };
    }

    if (decoded.userId !== userId) {
      throw AppError.unauthorized('Invalid token');
    }

    const { jti } = decoded;
    if (jti) {
      const refreshTokenKey = `${config.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.REFRESH_TOKEN}:${userId}:${jti}`;

      await Promise.all([
        this.cacheStore.del(refreshTokenKey),
        this.removeUserSession(userId, jti),
      ]);
    }

    return { message: 'Logged out successfully' };
  }

  /**
   * Logout from all devices by revoking all refresh tokens
   */
  async logoutAllDevices(userId: string): Promise<{ message: string }> {
    await this.revokeAllUserTokens(userId);
    // Increment tokenVersion to immediately invalidate all access tokens
    await this.incrementTokenVersion(userId);
    return { message: 'Logged out from all devices successfully' };
  }

  /**
   * Add a session (JTI) to user's session list
   */
  private async addUserSession(
    userId: string,
    jti: string,
    ttl: number,
  ): Promise<void> {
    const userSessionsKey = `${config.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.USER_SESSIONS}:${userId}`;

    // Get current sessions
    const sessions =
      (await this.cacheStore.get<string[]>(userSessionsKey)) || [];

    // Add new session
    sessions.push(jti);

    // Store updated sessions
    await this.cacheStore.set(userSessionsKey, sessions, ttl);
  }

  /**
   * Remove a session from user's session list
   */
  private async removeUserSession(userId: string, jti: string): Promise<void> {
    const userSessionsKey = `${config.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.USER_SESSIONS}:${userId}`;

    const sessions =
      (await this.cacheStore.get<string[]>(userSessionsKey)) || [];
    const updatedSessions = sessions.filter((s) => s !== jti);

    if (updatedSessions.length > 0) {
      const ttl = this.parseExpiryToSeconds(AUTH_CONFIG.TOKEN_EXPIRY.REFRESH);
      await this.cacheStore.set(userSessionsKey, updatedSessions, ttl);
    } else {
      await this.cacheStore.del(userSessionsKey);
    }
  }

  /**
   * Enforce maximum devices per user
   * Removes oldest sessions when limit exceeded
   */
  private async enforceMaxDevices(
    userId: string,
    maxDevices: number,
  ): Promise<void> {
    const userSessionsKey = `${config.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.USER_SESSIONS}:${userId}`;

    const sessions =
      (await this.cacheStore.get<string[]>(userSessionsKey)) || [];

    if (sessions.length <= maxDevices) {
      return;
    }

    // Remove oldest sessions (first in list)
    const sessionsToRemove = sessions.slice(
      0,
      sessions.length - maxDevices + 1,
    );

    await Promise.all(
      sessionsToRemove.map(async (jti) => {
        const tokenKey = `${config.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.REFRESH_TOKEN}:${userId}:${jti}`;
        await this.cacheStore.del(tokenKey);
      }),
    );

    // Keep only the most recent sessions
    const updatedSessions = sessions.slice(sessions.length - maxDevices + 1);
    const ttl = this.parseExpiryToSeconds(AUTH_CONFIG.TOKEN_EXPIRY.REFRESH);
    await this.cacheStore.set(userSessionsKey, updatedSessions, ttl);
  }

  /**
   * Revoke all refresh tokens for a user (security measure)
   */
  private async revokeAllUserTokens(userId: string): Promise<void> {
    const userSessionsKey = `${config.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.USER_SESSIONS}:${userId}`;

    const sessions =
      (await this.cacheStore.get<string[]>(userSessionsKey)) || [];

    // Delete all refresh tokens
    await Promise.all([
      ...sessions.map((jti) => {
        const tokenKey = `${config.redis_cache_key_prefix}:${AUTH_CONFIG.CACHE_PREFIXES.REFRESH_TOKEN}:${userId}:${jti}`;
        return this.cacheStore.del(tokenKey);
      }),
      this.cacheStore.del(userSessionsKey),
    ]);
  }

  /**
   * Handle failed login attempt with account lockout
   */
  private async handleFailedLoginAttempt(
    userId: string,
    currentFailedAttempts: number,
    maxAttempts: number,
    lockoutDuration: number,
    meta: { ip: string; userAgent: string; device?: string },
  ): Promise<void> {
    const newFailedAttempts = currentFailedAttempts + 1;
    const shouldLock = newFailedAttempts >= maxAttempts;

    await Promise.all([
      this.authSecurityRepo.updateFailedAttempts(
        userId,
        newFailedAttempts,
        shouldLock ? new Date(Date.now() + lockoutDuration) : undefined,
      ),
      this.logLoginAttempt({
        authId: userId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        device: meta.device,
        success: false,
        failureReason: shouldLock ? 'account_locked' : 'invalid_password',
        attemptNumber: newFailedAttempts,
      }),
    ]);

    // On account lock, increment tokenVersion to immediately invalidate all access tokens
    if (shouldLock) {
      await this.incrementTokenVersion(userId);
    }
  }

  /**
   * Log login attempt (fire-and-forget for non-blocking writes)
   */
  private logLoginAttempt(data: {
    authId: string | null;
    ip: string;
    userAgent: string;
    device?: string;
    success: boolean;
    failureReason?: string;
    attemptNumber?: number;
    isSuspicious?: boolean;
  }): Promise<void> {
    if (!data.authId) {
      return Promise.resolve();
    }

    return this.loginHistoryRepo
      .create({
        authId: data.authId,
        ipAddress: data.ip,
        userAgent: data.userAgent,
        device_id: data.device,
        action: 'login',
        success: data.success,
        failureReason: data.failureReason,
        attemptNumber: data.attemptNumber || 1,
        isSuspicious: data.isSuspicious || false,
      })
      .then(() => undefined)
      .catch((error) => {
        this.customLogger.error(
          `Failed to log login attempt: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
          'AuthService',
        );
      });
  }

  private handleLockedLoginFailure(
    userId: string,
    failedAttempts: number,
    lockExpiresAt: Date,
    ip: string,
    userAgent: string,
    device?: string,
  ): Promise<void> {
    const remainingTime = Math.ceil(
      (lockExpiresAt.getTime() - Date.now()) / 1000 / 60,
    );

    void this.logLoginAttempt({
      authId: userId,
      ip,
      userAgent,
      device,
      success: false,
      failureReason: 'account_locked',
      attemptNumber: failedAttempts + 1,
    });

    throw AppError.forbidden(
      `Account is temporarily locked. Please try again in ${remainingTime} minutes.`,
    );
  }

  /**
   * Parse token expiry string to seconds
   */
  private parseExpiryToSeconds(expiry: string): number {
    const match = /^(\d+)([smhd])?$/.exec(expiry);
    if (!match) {
      return 3600;
    }

    const value = Number.parseInt(match[1], 10);
    const unit = match[2] || 's';

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 60 * 60 * 24;
      default:
        return value;
    }
  }

  /**
   * Increment token version for a user to immediately invalidate all access tokens.
   * Called on security-critical events: password change, role change, admin block, force logout.
   * Clears Redis cache to ensure AuthGuard will fetch new version from DB.
   *
   * @param userId - The user whose token version to increment
   */
  async incrementTokenVersion(userId: string): Promise<void> {
    // Increment in database
    const current = await this.authUserRepo.findByIdSelect(userId, {
      tokenVersion: true,
    });
    await this.authUserRepo.updateTokenVersion(
      userId,
      (current?.tokenVersion || 0) + 1,
    );

    // Invalidate Redis cache so next guard check fetches new version
    const cacheKey = `${config.redis_cache_key_prefix}:token_version:${userId}`;
    await this.cacheStore.del(cacheKey);

    this.customLogger.log(
      `Token version incremented for user ${userId}`,
      'AuthService.incrementTokenVersion',
    );
  }
}
