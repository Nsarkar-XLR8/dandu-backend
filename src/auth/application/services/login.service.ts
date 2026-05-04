import AppError from '../../../common/errors/app.error';
import { AUTH_POLICY } from '../policies/auth.policy';
import type { ILogger } from '../../../common/domain/interfaces/logger.interface';
import type { IPasswordHasher } from '../../../common/domain/interfaces/password-hasher.interface';
import type { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.interface';
import type { IAuthSecurityRepository } from '../../domain/repositories/auth-security.repository.interface';
import type { ILoginHistoryRepository } from '../../domain/repositories/login-history.repository.interface';
import { AuthUtilsService } from './auth-utils.service';
import { TokenService } from './token.service';
import type { ILoginResponse } from '../../interfaces/auth.interface';

export class LoginService {
  private static readonly DUMMY_PASSWORD_HASH =
    '$2b$12$/1ViEnMS3JJ99L.OpLR8pu/iUhTO4gm.segG0raYko6GET68t0MZq';

  constructor(
    private readonly authUtilsService: AuthUtilsService,
    private readonly tokenService: TokenService,
    private readonly customLogger: ILogger,
    private readonly passwordHasher: IPasswordHasher,
    private readonly authUserRepo: IAuthUserRepository,
    private readonly authSecurityRepo: IAuthSecurityRepository,
    private readonly loginHistoryRepo: ILoginHistoryRepository,
  ) {}

  async login(
    payload: { email: string; password: string },
    meta: { ip: string; userAgent: string; device?: string; requestId?: string },
  ): Promise<ILoginResponse> {
    const { email, password } = payload;
    const { ip, userAgent, device } = meta;

    const { LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS } = AUTH_POLICY.RATE_LIMIT;
    const { MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_MS } = AUTH_POLICY.ACCOUNT_LOCKOUT;

    // Rate limiting
    await Promise.all([
      this.authUtilsService.checkRateLimit(`login:email:${email}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS),
      this.authUtilsService.checkRateLimit(`login:ip:${ip}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS),
    ]);

    const authRecord = await this.authUserRepo.findByEmailWithSecurity(email);
    const user = authRecord?.user;
    const security = authRecord?.security;

    const invalidCredentialsError = AppError.unauthorized('Invalid email or password');

    if (!user) {
      await this.passwordHasher.compare(password, LoginService.DUMMY_PASSWORD_HASH);
      void this.logLoginAttempt({ authId: null, ip, userAgent, device, success: false, failureReason: 'user_not_found', requestId: meta.requestId });
      throw invalidCredentialsError;
    }

    if (user.provider !== 'local') {
      throw AppError.badRequest(`Please login using ${user.provider} authentication`);
    }

    if (user.status === 'BLOCKED' || user.status === 'SUSPENDED') {
      await this.handleLockedLoginFailure(user.id as string, security?.failedAttempts ?? 0, security?.lockExpiresAt as Date, ip, userAgent, device, meta.requestId);
      await this.passwordHasher.compare(password, user.password);
      throw invalidCredentialsError;
    }

    if (security?.lockExpiresAt && new Date() < security.lockExpiresAt) {
      const remainingTime = Math.ceil((security.lockExpiresAt.getTime() - Date.now()) / 1000 / 60);
      void this.logLoginAttempt({ authId: user.id, ip, userAgent, device, success: false, failureReason: 'account_locked', attemptNumber: security.failedAttempts + 1, requestId: meta.requestId });
      throw AppError.forbidden(`Account is temporarily locked. Try again in ${remainingTime} minutes.`);
    }

    const isPasswordValid = await this.passwordHasher.compare(password, user.password);

    if (!isPasswordValid) {
      await this.handleFailedLoginAttempt(user.id as string, security?.failedAttempts || 0, MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_MS, { ip, userAgent, device, requestId: meta.requestId });
      throw invalidCredentialsError;
    }

    if (!user.verified) {
      void this.logLoginAttempt({ authId: user.id as string, ip, userAgent, device, success: false, failureReason: 'email_not_verified', requestId: meta.requestId });
      throw AppError.forbidden('Please verify your email address before logging in');
    }

    // Delegate session creation to TokenService
    const result = await this.tokenService.createSession(
      { id: user.id as string, email: user.email, username: user.username, role: user.role, tokenVersion: user.tokenVersion },
      { ip, userAgent, device }
    );

    // Non-critical post-process
    void Promise.allSettled([
      security ? this.authSecurityRepo.resetFailedAttempts(security.id) : Promise.resolve(),
      this.logLoginAttempt({ authId: user.id as string, ip, userAgent, device, success: true, requestId: meta.requestId }),
    ]);

    return result;
  }

  private async handleFailedLoginAttempt(
    userId: string,
    currentFailedAttempts: number,
    maxAttempts: number,
    lockoutDurationMs: number,
    meta: { ip: string; userAgent: string; device?: string; requestId?: string },
  ): Promise<void> {
    const newFailedAttempts = currentFailedAttempts + 1;
    let lockExpiresAt: Date | null = null;

    if (newFailedAttempts >= maxAttempts) {
      lockExpiresAt = new Date(Date.now() + lockoutDurationMs);
    }

    await this.authSecurityRepo.updateFailedAttempts(userId, newFailedAttempts, lockExpiresAt);

    void this.logLoginAttempt({
      authId: userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      device: meta.device,
      success: false,
      failureReason: lockExpiresAt ? 'account_locked' : 'invalid_credentials',
      attemptNumber: newFailedAttempts,
      requestId: meta.requestId,
    });
  }

  private async handleLockedLoginFailure(
    userId: string,
    failedAttempts: number,
    lockExpiresAt: Date,
    ip: string,
    userAgent: string,
    device?: string,
    requestId?: string,
  ): Promise<void> {
    const remainingTime = Math.ceil((lockExpiresAt.getTime() - Date.now()) / 1000 / 60);
    void this.logLoginAttempt({ authId: userId, ip, userAgent, device, success: false, failureReason: 'account_locked', attemptNumber: failedAttempts + 1, requestId });
    throw AppError.forbidden(`Account is temporarily locked. Try again in ${remainingTime} minutes.`);
  }

  public async logLoginAttempt(data: {
    authId: string | null;
    ip: string;
    userAgent: string;
    device?: string;
    success: boolean;
    failureReason?: string;
    attemptNumber?: number;
    isSuspicious?: boolean;
    provider?: string;
    requestId?: string;
  }): Promise<void> {
    if (!data.authId) return;
    await this.loginHistoryRepo.create({
      authId: data.authId,
      ipAddress: data.ip,
      userAgent: data.userAgent,
      device_id: data.device,
      action: 'login',
      success: data.success,
      failureReason: data.failureReason,
      attemptNumber: data.attemptNumber || 1,
      isSuspicious: data.isSuspicious || false,
      requestId: data.requestId,
    }).catch(err => this.customLogger.error(`Failed to log login: ${err.message}`, undefined, 'LoginService'));
  }
}
