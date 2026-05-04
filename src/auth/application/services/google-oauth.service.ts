import crypto from 'node:crypto';
import { AuthUtilsService } from './auth-utils.service';
import { TokenService } from './token.service';
import { LoginService } from './login.service';
import type { ICacheStore } from '../../../common/domain/interfaces/cache-store.interface';
import type { IActivityRecorder } from '../../../common/domain/interfaces/activity-recorder.interface';
import type { IAppConfig } from '../../../common/domain/interfaces/app-config.interface';
import type { ILogger } from '../../../common/domain/interfaces/logger.interface';
import type { IOAuthClient } from '../ports/oauth-client.interface';
import { GOOGLE_OAUTH_POLICY } from '../policies/google-oauth.policy';
import {
  IGoogleUserInfo,
  IGoogleOAuthState,
  IGoogleOAuthLoginResponse,
} from '../../interfaces/google-oauth.interface';
import AppError from '../../../common/errors/app.error';
import type { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.interface';
import type { IAuthSecurityRepository } from '../../domain/repositories/auth-security.repository.interface';
import type { IUserProfileRepository } from '../../domain/repositories/user-profile.repository.interface';
import type { IUnitOfWork } from '../../../common/domain/interfaces/unit-of-work.interface';
import { AuthUserEntity } from '../../domain/entities/auth-user.entity';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/**
 * Google OAuth Service
 * Implements Google OAuth 2.0 with PKCE (Proof Key for Code Exchange)
 */
export class GoogleOAuthService {
  private readonly context = 'GoogleOAuthService';

  constructor(
    private readonly customLogger: ILogger,
    private readonly appConfig: IAppConfig,
    private readonly cacheStore: ICacheStore,
    private readonly activityLogService: IActivityRecorder,
    private readonly authUtilsService: AuthUtilsService,
    private readonly tokenService: TokenService,
    private readonly loginService: LoginService,
    private readonly authUserRepo: IAuthUserRepository,
    private readonly authSecurityRepo: IAuthSecurityRepository,
    private readonly userProfileRepo: IUserProfileRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly oauthClient: IOAuthClient,
  ) {}

  /**
   * Generate a cryptographically secure random state token
   * Used to prevent CSRF attacks
   */
  private generateStateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate PKCE code verifier
   * A high-entropy cryptographic random string using unreserved characters
   * RFC 7636 compliant (43-128 characters)
   */
  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge from verifier
   * SHA256 hash of the code verifier, base64url encoded
   */
  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * Generate a unique username from Google profile
   */
  private generateUsername(googleUser: IGoogleUserInfo): string {
    const baseName =
      googleUser.given_name || googleUser.name?.split(' ')[0] || 'user';
    const sanitized = baseName.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
    const uniqueSuffix = crypto.randomBytes(4).toString('hex');
    return `${sanitized}_${uniqueSuffix}`;
  }



  /**
   * Generate Google OAuth authorization URL
   * Implements PKCE for enhanced security
   */
  async getAuthorizationUrl(
    meta: { ip: string; userAgent: string },
    redirectUrl?: string,
  ): Promise<{ url: string; state: string }> {
    // Generate state and PKCE parameters
    const state = this.generateStateToken();
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    // Store state and code verifier in Redis for validation
    const stateData: IGoogleOAuthState = {
      state,
      codeVerifier,
      redirectUrl,
      ip: meta.ip,
      userAgent: meta.userAgent,
      createdAt: new Date().toISOString(),
    };

    const stateKey = `${this.appConfig.redis_cache_key_prefix}:${GOOGLE_OAUTH_POLICY.STATE.CACHE_PREFIX}:${state}`;
    await this.cacheStore.set(
      stateKey,
      stateData,
      GOOGLE_OAUTH_POLICY.STATE.TTL_SECONDS,
    );

    const authUrl = this.oauthClient.createAuthorizationUrl({
      state,
      codeChallenge,
    });

    this.customLogger.log(
      `Generated Google OAuth authorization URL for IP: ${meta.ip}`,
      this.context,
    );

    return { url: authUrl, state };
  }



  /**
   * Handle Google OAuth callback
   * Validates state, exchanges code for tokens, and creates/updates user
   */
  async handleCallback(
    code: string,
    state: string,
    meta: { ip: string; userAgent: string; device?: string },
  ): Promise<IGoogleOAuthLoginResponse> {
    const { ip, userAgent, device } = meta;

    // Validate state parameter
    const stateKey = `${this.appConfig.redis_cache_key_prefix}:${GOOGLE_OAUTH_POLICY.STATE.CACHE_PREFIX}:${state}`;
    const stateData = await this.cacheStore.get<IGoogleOAuthState>(stateKey);

    if (!stateData) {
      this.customLogger.warn(
        `Invalid or expired OAuth state: ${state}`,
        this.context,
      );
      throw AppError.badRequest(
        'Invalid or expired OAuth state. Please try again.',
      );
    }

    // Delete state from Redis (single-use)
    await this.cacheStore.del(stateKey);

    // Validate state matches
    if (stateData.state !== state) {
      this.customLogger.warn('OAuth state mismatch', this.context);
      throw AppError.badRequest('Invalid OAuth state');
    }

    // Exchange code for tokens using PKCE
    const tokenResponse = await this.oauthClient.exchangeCodeForTokens(
      code,
      stateData.codeVerifier,
    );

    // Extract user info from ID token with signature verification (most secure)
    let googleUser: IGoogleUserInfo | null = null;

    if (tokenResponse.id_token) {
      try {
        // Verify token signature using Google's public keys
        const idTokenClaims = await this.oauthClient.verifyIdToken(tokenResponse.id_token);
        googleUser = {
          sub: idTokenClaims.sub,
          email: idTokenClaims.email,
          email_verified: idTokenClaims.email_verified,
          name: idTokenClaims.name || '',
          given_name: idTokenClaims.given_name,
          family_name: idTokenClaims.family_name,
          picture: idTokenClaims.picture,
        };
      } catch (error) {
        // Signature verification failed - do NOT fallback to userinfo
        // This is a security violation
        this.customLogger.error(
          'ID token verification failed - possible forgery attempt',
          error instanceof Error ? error.stack : undefined,
          this.context,
        );
        throw AppError.unauthorized(
          'Failed to verify ID token. Please try again.',
        );
      }
    } else {
      // No ID token provided, fallback to userinfo endpoint
      googleUser = await this.oauthClient.getUserInfo(tokenResponse.access_token);
    }

    // Validate email is verified
    if (!googleUser.email_verified) {
      this.customLogger.warn(
        `Google user email not verified: ${googleUser.email}`,
        this.context,
      );
      throw AppError.forbidden(
        'Please verify your Google email address before signing in.',
      );
    }

    // Find or create user
    const result = await this.findOrCreateUser(googleUser, {
      ip,
      userAgent,
      device,
    });

    this.customLogger.log(
      `Google OAuth ${result.isNewUser ? 'sign-up' : 'sign-in'} successful for: ${googleUser.email}`,
      this.context,
    );

    // Include redirectUrl from state if it exists
    return {
      ...result,
      redirectUrl: stateData.redirectUrl,
    };
  }

  /**
   * Find existing user or create new one from Google profile
   */
  private async findOrCreateUser(
    googleUser: IGoogleUserInfo,
    meta: { ip: string; userAgent: string; device?: string },
  ): Promise<IGoogleOAuthLoginResponse> {
    const { ip, userAgent, device } = meta;

    // Check if user exists by provider ID (Google's sub)
    let user = await this.authUserRepo.findByProvider('google', googleUser.sub);

    let isNewUser = false;

    if (user === null) {
      // Check if user exists with same email but different provider
      const existingUserWithEmail = await this.authUserRepo.findByEmail(
        googleUser.email,
      );

      if (existingUserWithEmail) {
        // Link Google account to existing user
        if (existingUserWithEmail.provider === 'local') {
          this.customLogger.warn(
            `Email ${googleUser.email} already registered with local provider`,
            this.context,
          );
          throw AppError.conflict(
            'An account with this email already exists. Please sign in with your email and password, then link your Google account in settings.',
          );
        } else {
          throw AppError.conflict(
            `This email is already associated with a ${existingUserWithEmail.provider} account.`,
          );
        }
      }

      // Create new user
      const username = this.generateUsername(googleUser);

      user = await this.unitOfWork.execute(async (ctx) => {
        const newUser = await this.authUserRepo.save(
          new AuthUserEntity(
            null,
            googleUser.email,
            '',
            username,
            'USER',
            true,
            'ACTIVE',
            0,
            null,
            'google',
            googleUser.sub,
            new Date(),
            new Date(),
          ),
          ctx,
        );

        await this.authSecurityRepo.create(
          {
            authId: newUser.id as string,
            failedAttempts: 0,
            mfaEnabled: false,
          },
          ctx,
        );

        await this.userProfileRepo.create(
          {
            authId: newUser.id as string,
            firstName:
              googleUser.given_name || googleUser.name?.split(' ')[0] || '',
            lastName: googleUser.family_name || '',
            avatarUrl: googleUser.picture || null,
          },
          ctx,
        );

        await this.activityLogService.logCreate(
          'authUser',
          newUser.id as string,
          {
            email: googleUser.email,
            username,
            role: 'USER',
            status: 'ACTIVE',
            verified: 'true',
            provider: 'google',
          },
          { ip, userAgent, actionedBy: newUser.id as string, device },
          ctx,
        );

        return newUser;
      });

      isNewUser = true;

      this.customLogger.log(
        `New user created via Google OAuth: ${googleUser.email}`,
        this.context,
      );
    } else {
      // Check account status
      if (user.status === 'BLOCKED' || user.status === 'SUSPENDED') {
        throw AppError.forbidden(
          `Your account has been ${user.status.toLowerCase()}. Please contact support.`,
        );
      }

      if (user.status === 'DELETED' || user.status === 'INACTIVE') {
        throw AppError.unauthorized('Invalid credentials');
      }
    }

    // Delegate session creation to TokenService
    const result = await this.tokenService.createSession(
      {
        id: user.id as string,
        email: user.email,
        username: user.username,
        role: user.role,
        tokenVersion: user.tokenVersion ?? 0,
      },
      { ip, userAgent, device }
    );

    // Non-critical post-process: log login attempt
    void this.loginService.logLoginAttempt({
      authId: user.id as string,
      ip,
      userAgent,
      device,
      success: true,
      provider: 'google',
    });

    return {
      ...result,
      user: {
        ...result.user,
        provider: user.provider,
        providerId: user.providerId || '',
      },
      isNewUser,
    };
  }



  /**
   * Revoke Google OAuth token (for logout)
   */
  async revokeGoogleToken(token: string): Promise<void> {
    await this.oauthClient.revokeToken(token);
  }
}
