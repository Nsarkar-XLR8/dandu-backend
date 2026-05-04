import { Test, TestingModule } from '@nestjs/testing';
import { AuthUtilsService } from './auth-utils.service';
import { RedisService } from '../../../common/services/redis.service';
import { CACHE_STORE_TOKEN } from '../../../common/domain/interfaces/cache-store.interface';
import { APP_CONFIG_TOKEN } from '../../../common/domain/interfaces/app-config.interface';
import { TOKEN_SIGNER_TOKEN } from '../../../common/domain/interfaces/token-signer.interface';

describe('AuthUtilsService', () => {
  let service: AuthUtilsService;

  const mockRedisService = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };

  const mockAppConfig = {
    jwt_access_secret: 'access-secret',
    jwt_refresh_secret: 'refresh-secret',
    redis_cache_key_prefix: 'test',
  };

  const mockTokenSigner = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: AuthUtilsService,
          useFactory: (cacheStore, appConfig, tokenSigner) =>
            new AuthUtilsService(cacheStore, appConfig, tokenSigner),
          inject: [CACHE_STORE_TOKEN, APP_CONFIG_TOKEN, TOKEN_SIGNER_TOKEN],
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
          provide: APP_CONFIG_TOKEN,
          useValue: mockAppConfig,
        },
        {
          provide: TOKEN_SIGNER_TOKEN,
          useValue: mockTokenSigner,
        },
      ],
    }).compile();

    service = module.get<AuthUtilsService>(AuthUtilsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validatePassword', () => {
    it('should return false for password shorter than minimum length', () => {
      expect(service.validatePassword('Short1!')).toBe(false);
    });

    it('should return false for password without uppercase', () => {
      expect(service.validatePassword('password1!')).toBe(false);
    });

    it('should return false for password without lowercase', () => {
      expect(service.validatePassword('PASSWORD1!')).toBe(false);
    });

    it('should return false for password without numbers', () => {
      expect(service.validatePassword('Password!')).toBe(false);
    });

    it('should return false for password without special characters', () => {
      expect(service.validatePassword('Password1')).toBe(false);
    });

    it('should return true for valid password', () => {
      expect(service.validatePassword('Password1!')).toBe(true);
    });
  });
});
