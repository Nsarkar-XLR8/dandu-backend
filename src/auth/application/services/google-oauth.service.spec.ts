import { Test, TestingModule } from '@nestjs/testing';
import { GoogleOAuthService } from './google-oauth.service';
import { TokenService } from './token.service';
import { LoginService } from './login.service';
import { OAUTH_CLIENT_TOKEN } from '../ports/oauth-client.interface';
import { CustomLoggerService } from '../../../common/services/custom-logger.service';
import { RedisService } from '../../../common/services/redis.service';
import { AppConfigService } from '../../../common/config/app-config.service';
import { PrismaService } from '../../../common/services/prisma.service';
import { ActivityLogService } from '../../../common/services/activity-log.service';
import { AuthUtilsService } from './auth-utils.service';
import { CACHE_STORE_TOKEN } from '../../../common/domain/interfaces/cache-store.interface';
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
    getTokens: jest.fn(),
    verifyIdToken: jest.fn(),
    getUserProfile: jest.fn(),
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
        GoogleOAuthService,
        {
          provide: CustomLoggerService,
          useValue: mockCustomLoggerService,
        },
        {
          provide: AppConfigService,
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
          provide: ActivityLogService,
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
        AppConfigService,
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
