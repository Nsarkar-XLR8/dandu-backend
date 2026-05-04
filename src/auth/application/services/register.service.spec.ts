import { Test, TestingModule } from '@nestjs/testing';
import { RegisterService } from './register.service';
import { AuthUtilsService } from './auth-utils.service';
import AppError from '../../../common/errors/app.error';
import * as bcrypt from 'bcryptjs';
import { ACTIVITY_RECORDER_TOKEN } from '../../../common/domain/interfaces/activity-recorder.interface';
import { APP_CONFIG_TOKEN } from '../../../common/domain/interfaces/app-config.interface';
import { CACHE_STORE_TOKEN } from '../../../common/domain/interfaces/cache-store.interface';
import { EMAIL_SENDER_TOKEN } from '../../../common/domain/interfaces/email-sender.interface';
import { LOGGER_TOKEN } from '../../../common/domain/interfaces/logger.interface';
import { PASSWORD_HASHER_TOKEN } from '../../../common/domain/interfaces/password-hasher.interface';
import { AUTH_USER_REPOSITORY_TOKEN } from '../../domain/repositories/auth-user.repository.interface';
import { AUTH_SECURITY_REPOSITORY_TOKEN } from '../../domain/repositories/auth-security.repository.interface';
import { EMAIL_HISTORY_REPOSITORY_TOKEN } from '../../domain/repositories/email-history.repository.interface';
import { LOGIN_HISTORY_REPOSITORY_TOKEN } from '../../domain/repositories/login-history.repository.interface';
import { UNIT_OF_WORK_TOKEN } from '../../../common/domain/interfaces/unit-of-work.interface';
import { AuthUserEntity } from '../../domain/entities/auth-user.entity';

describe('RegisterService', () => {
  let service: RegisterService;
  let authUtilsService: jest.Mocked<AuthUtilsService>;
  let authUserRepo: any;
  let authSecurityRepo: any;
  let emailHistoryRepo: any;
  let cacheStore: any;
  let emailSender: any;
  let unitOfWork: any;

  beforeEach(async () => {
    const mockAuthUtilsService = {
      checkRateLimit: jest.fn().mockResolvedValue(undefined),
      validatePassword: jest.fn().mockReturnValue(true),
      generateVerificationCode: jest.fn().mockReturnValue('123456'),
      parseExpiryToSeconds: jest.fn().mockReturnValue(3600),
      hashToken: jest.fn().mockReturnValue('hashed-token'),
      createAccessToken: jest.fn().mockReturnValue('access-token'),
      createRefreshToken: jest.fn().mockReturnValue('refresh-token'),
      generateSecureId: jest.fn().mockReturnValue('secure-id'),
      verifyRefreshToken: jest.fn(),
    };

    const mockActivityLogService = {
      logCreate: jest.fn().mockResolvedValue(undefined),
      logUpdate: jest.fn().mockResolvedValue(undefined),
      logCustomEvent: jest.fn().mockResolvedValue(undefined),
    };

    const mockCacheStore = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
      setNX: jest.fn().mockResolvedValue(true),
    };

    const mockEmailSender = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    };

    const mockPasswordHasher = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      compare: jest.fn().mockResolvedValue(true),
    };

    const mockAuthUserRepo = {
      findByEmailOrUsername: jest.fn(),
      findByEmail: jest.fn(),
      findByIdSelect: jest.fn(),
      findByEmailWithSecurity: jest.fn(),
      save: jest.fn(),
      updateVerified: jest.fn(),
    };

    const mockAuthSecurityRepo = {
      create: jest.fn().mockResolvedValue({}),
      resetFailedAttempts: jest.fn().mockResolvedValue(undefined),
    };

    const mockEmailHistoryRepo = {
      create: jest.fn().mockResolvedValue({}),
      updateStatusByAuth: jest.fn().mockResolvedValue(undefined),
    };

    const mockLoginHistoryRepo = {
      create: jest.fn().mockResolvedValue({}),
    };

    const mockUnitOfWork = {
      execute: jest.fn((work: any) => work({})),
    };

    const mockCustomLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const mockAppConfig = {
      redis_cache_key_prefix: 'test',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: RegisterService,
          useFactory: (
            authUtilsService,
            activityRecorder,
            appConfig,
            logger,
            cacheStore,
            emailSender,
            passwordHasher,
            authUserRepo,
            authSecurityRepo,
            emailHistoryRepo,
            unitOfWork,
          ) =>
            new RegisterService(
              authUtilsService,
              activityRecorder,
              appConfig,
              logger,
              cacheStore,
              emailSender,
              passwordHasher,
              authUserRepo,
              authSecurityRepo,
              emailHistoryRepo,
              unitOfWork,
            ),
          inject: [
            AuthUtilsService,
            ACTIVITY_RECORDER_TOKEN,
            APP_CONFIG_TOKEN,
            LOGGER_TOKEN,
            CACHE_STORE_TOKEN,
            EMAIL_SENDER_TOKEN,
            PASSWORD_HASHER_TOKEN,
            AUTH_USER_REPOSITORY_TOKEN,
            AUTH_SECURITY_REPOSITORY_TOKEN,
            EMAIL_HISTORY_REPOSITORY_TOKEN,
            UNIT_OF_WORK_TOKEN,
          ],
        },
        { provide: AuthUtilsService, useValue: mockAuthUtilsService },
        { provide: ACTIVITY_RECORDER_TOKEN, useValue: mockActivityLogService },
        { provide: CACHE_STORE_TOKEN, useValue: mockCacheStore },
        { provide: EMAIL_SENDER_TOKEN, useValue: mockEmailSender },
        { provide: PASSWORD_HASHER_TOKEN, useValue: mockPasswordHasher },
        { provide: AUTH_USER_REPOSITORY_TOKEN, useValue: mockAuthUserRepo },
        { provide: AUTH_SECURITY_REPOSITORY_TOKEN, useValue: mockAuthSecurityRepo },
        { provide: EMAIL_HISTORY_REPOSITORY_TOKEN, useValue: mockEmailHistoryRepo },
        { provide: LOGIN_HISTORY_REPOSITORY_TOKEN, useValue: mockLoginHistoryRepo },
        { provide: UNIT_OF_WORK_TOKEN, useValue: mockUnitOfWork },
        { provide: LOGGER_TOKEN, useValue: mockCustomLoggerService },
        { provide: APP_CONFIG_TOKEN, useValue: mockAppConfig },
      ],
    }).compile();

    service = module.get<RegisterService>(RegisterService);
    authUtilsService = module.get(AuthUtilsService);
    authUserRepo = module.get(AUTH_USER_REPOSITORY_TOKEN);
    authSecurityRepo = module.get(AUTH_SECURITY_REPOSITORY_TOKEN);
    emailHistoryRepo = module.get(EMAIL_HISTORY_REPOSITORY_TOKEN);
    cacheStore = module.get(CACHE_STORE_TOKEN);
    emailSender = module.get(EMAIL_SENDER_TOKEN);
    unitOfWork = module.get(UNIT_OF_WORK_TOKEN);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createAuthDto = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'Password123!',
    };

    const meta = { ip: '127.0.0.1', userAgent: 'test' };

    it('should create a new user successfully', async () => {
      authUserRepo.findByEmailOrUsername.mockResolvedValue(null);
      authUserRepo.save.mockResolvedValue({ id: 'user-id', email: createAuthDto.email });

      await service.create(createAuthDto, meta);

      expect(authUserRepo.save).toHaveBeenCalled();
      expect(authSecurityRepo.create).toHaveBeenCalled();
      expect(emailHistoryRepo.create).toHaveBeenCalled();
      expect(cacheStore.set).toHaveBeenCalled();
      expect(emailSender.sendVerificationEmail).toHaveBeenCalled();
    });

    it('should throw conflict error if user already exists', async () => {
      authUserRepo.findByEmailOrUsername.mockResolvedValue({ email: createAuthDto.email });

      await expect(service.create(createAuthDto, meta)).rejects.toThrow(AppError);
      expect(AppError.conflict).toBeDefined();
    });
  });

  describe('verifyEmail', () => {
    const email = 'test@example.com';
    const code = '123456';
    const meta = { ip: '127.0.0.1', userAgent: 'test' };

    it('should verify email successfully', async () => {
      cacheStore.get.mockResolvedValue({
        code,
        userId: 'user-id',
        email,
        expiresAt: new Date(Date.now() + 10000).toISOString(),
      });
      authUserRepo.findByEmail.mockResolvedValue({ id: 'user-id', verified: false });

      await service.verifyEmail(email, code, meta);

      expect(authUserRepo.updateVerified).toHaveBeenCalledWith('user-id', true, expect.anything());
      expect(cacheStore.del).toHaveBeenCalled();
    });

    it('should throw error if code is invalid', async () => {
      cacheStore.get.mockResolvedValue({ code: 'wrong-code' });
      await expect(service.verifyEmail(email, code, meta)).rejects.toThrow(AppError);
    });
  });
});
