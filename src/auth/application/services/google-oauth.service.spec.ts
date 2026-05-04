import { Test, TestingModule } from '@nestjs/testing';
import { GoogleOAuthService } from './google-oauth.service';
import { TokenService } from './token.service';
import { LoginService } from './login.service';
import { OAUTH_CLIENT_TOKEN } from '../ports/oauth-client.interface';
import { RedisService } from '../../../common/services/redis.service';
import { PrismaService } from '../../../common/services/prisma.service';
import { AuthUtilsService } from './auth-utils.service';
import { ACTIVITY_RECORDER_TOKEN } from '../../../common/domain/interfaces/activity-recorder.interface';
import { APP_CONFIG_TOKEN } from '../../../common/domain/interfaces/app-config.interface';
import { CACHE_STORE_TOKEN } from '../../../common/domain/interfaces/cache-store.interface';
import { LOGGER_TOKEN } from '../../../common/domain/interfaces/logger.interface';
import { AUTH_USER_REPOSITORY_TOKEN } from '../../domain/repositories/auth-user.repository.interface';
import { AUTH_SECURITY_REPOSITORY_TOKEN } from '../../domain/repositories/auth-security.repository.interface';
import { LOGIN_HISTORY_REPOSITORY_TOKEN } from '../../domain/repositories/login-history.repository.interface';
import { USER_PROFILE_REPOSITORY_TOKEN } from '../../domain/repositories/user-profile.repository.interface';
import { UNIT_OF_WORK_TOKEN } from '../../../common/domain/interfaces/unit-of-work.interface';

describe('GoogleOAuthService', () => {
  let service: GoogleOAuthService;

  const mockCustomLoggerService = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    setNX: jest.fn(),
  };

  const mockPrismaService = {
    authUser: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    authSecurity: {
      create: jest.fn(),
    },
    userProfile: {
      create: jest.fn(),
    },
    loginHistory: {
      create: jest.fn(),
    },

    $transaction: jest.fn((fn) => fn(mockPrismaService)),
  };

  const mockActivityLogService = {
    logCreate: jest.fn(),
    logCustomEvent: jest.fn(),
  };

  const mockAuthUtilsService = {
    generateSecureId: jest.fn().mockReturnValue('test-jti-id'),
    createAccessToken: jest.fn().mockReturnValue('test-access-token'),
    createRefreshToken: jest.fn().mockReturnValue('test-refresh-token'),
    hashToken: jest.fn().mockReturnValue('hashed-token'),
  };

  const mockAuthUserRepo = {
    findByEmail: jest.fn(),
    findByProvider: jest.fn(),
    save: jest.fn(),
  };

  const mockAuthSecurityRepo = {
    create: jest.fn(),
  };

  const mockLoginHistoryRepo = {
    create: jest.fn(),
  };

  const mockUserProfileRepo = {
    create: jest.fn(),
  };

  const mockUnitOfWork = {
    execute: jest.fn((work: any) => work({})),
  };

  const mockAppConfigService = {
    redis_cache_key_prefix: 'test-prefix',
  };

  const mockTokenService = {
    createSession: jest.fn(),
  };

  const mockLoginService = {
    logLoginAttempt: jest.fn(),
  };

  const mockOAuthClient = {
    createAuthorizationUrl: jest.fn(
      ({ state, codeChallenge }: { state: string; codeChallenge: string }) =>
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client-id&redirect_uri=http%3A%2F%2Flocalhost%3A5000%2Fauth%2Fgoogle%2Fcallback&response_type=code&scope=openid+email+profile&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}`,
    ),
    exchangeCodeForTokens: jest.fn(),
    getUserInfo: jest.fn(),
    verifyIdToken: jest.fn(),
    revokeToken: jest.fn(),
  };

  beforeEach(async () => {
    // Set environment variables for tests
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_REDIRECT_URI =
      'http://localhost:5000/auth/google/callback';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: GoogleOAuthService,
          useFactory: (
            logger,
            appConfig,
            cacheStore,
            activityRecorder,
            authUtilsService,
            tokenService,
            loginService,
            authUserRepo,
            authSecurityRepo,
            userProfileRepo,
            unitOfWork,
            oauthClient,
          ) =>
            new GoogleOAuthService(
              logger,
              appConfig,
              cacheStore,
              activityRecorder,
              authUtilsService,
              tokenService,
              loginService,
              authUserRepo,
              authSecurityRepo,
              userProfileRepo,
              unitOfWork,
              oauthClient,
            ),
          inject: [
            LOGGER_TOKEN,
            APP_CONFIG_TOKEN,
            CACHE_STORE_TOKEN,
            ACTIVITY_RECORDER_TOKEN,
            AuthUtilsService,
            TokenService,
            LoginService,
            AUTH_USER_REPOSITORY_TOKEN,
            AUTH_SECURITY_REPOSITORY_TOKEN,
            USER_PROFILE_REPOSITORY_TOKEN,
            UNIT_OF_WORK_TOKEN,
            OAUTH_CLIENT_TOKEN,
          ],
        },
        {
          provide: LOGGER_TOKEN,
          useValue: mockCustomLoggerService,
        },
        {
          provide: APP_CONFIG_TOKEN,
          useValue: mockAppConfigService,
        },
        {
          provide: TokenService,
          useValue: mockTokenService,
        },
        {
          provide: LoginService,
          useValue: mockLoginService,
        },
        {
          provide: OAUTH_CLIENT_TOKEN,
          useValue: mockOAuthClient,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: CACHE_STORE_TOKEN,
          useValue: mockRedisService,
        },
        {
          provide: PrismaService,

          useValue: mockPrismaService,
        },
        {
          provide: ACTIVITY_RECORDER_TOKEN,
          useValue: mockActivityLogService,
        },
        {
          provide: AuthUtilsService,
          useValue: mockAuthUtilsService,
        },
        {
          provide: AUTH_USER_REPOSITORY_TOKEN,
          useValue: mockAuthUserRepo,
        },
        {
          provide: AUTH_SECURITY_REPOSITORY_TOKEN,
          useValue: mockAuthSecurityRepo,
        },
        {
          provide: LOGIN_HISTORY_REPOSITORY_TOKEN,
          useValue: mockLoginHistoryRepo,
        },
        {
          provide: USER_PROFILE_REPOSITORY_TOKEN,
          useValue: mockUserProfileRepo,
        },
        {
          provide: UNIT_OF_WORK_TOKEN,
          useValue: mockUnitOfWork,
        },
      ],
    }).compile();

    service = module.get<GoogleOAuthService>(GoogleOAuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAuthorizationUrl', () => {
    it('should generate a valid authorization URL with state', async () => {
      mockRedisService.set.mockResolvedValue(undefined);

      const meta = { ip: '127.0.0.1', userAgent: 'test-agent' };
      const result = await service.getAuthorizationUrl(meta);

      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('state');
      expect(result.url).toContain(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(result.url).toContain('client_id=test-client-id');
      expect(result.url).toContain('redirect_uri=');
      expect(result.url).toContain('response_type=code');
      expect(result.url).toContain('scope=');
      expect(result.url).toContain('code_challenge=');
      expect(result.url).toContain('code_challenge_method=S256');
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should include optional redirectUrl if provided', async () => {
      mockRedisService.set.mockResolvedValue(undefined);

      const meta = { ip: '127.0.0.1', userAgent: 'test-agent' };
      const redirectUrl = 'http://localhost:3000/dashboard';
      const result = await service.getAuthorizationUrl(meta, redirectUrl);

      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('state');
      // The redirectUrl should be stored in Redis state data
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ redirectUrl }),
        expect.any(Number),
      );
    });
  });

  describe('handleCallback', () => {
    it('should throw error for invalid or expired state', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const meta = { ip: '127.0.0.1', userAgent: 'test-agent' };

      await expect(
        service.handleCallback('test-code', 'invalid-state', meta),
      ).rejects.toThrow('Invalid or expired OAuth state');
    });

    it('should throw error for state mismatch', async () => {
      mockRedisService.get.mockResolvedValue({
        state: 'different-state',
        codeVerifier: 'test-verifier',
        ip: '127.0.0.1',
        userAgent: 'test-agent',
        createdAt: new Date().toISOString(),
      });
      mockRedisService.del.mockResolvedValue(undefined);

      const meta = { ip: '127.0.0.1', userAgent: 'test-agent' };

      await expect(
        service.handleCallback('test-code', 'test-state', meta),
      ).rejects.toThrow('Invalid OAuth state');
    });
  });
});
