import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthUtilsService } from './services/auth-utils.service';
import { GoogleOAuthService } from './services/google-oauth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import type { Request } from 'express';
import { CustomLoggerService } from '../common/services/custom-logger.service';
import { AuthGuard } from '../common/guards/auth.guard';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    create: jest.fn(),
    verifyEmail: jest.fn(),
    resendVerificationEmail: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    logoutAllDevices: jest.fn(),
  };

  const mockAuthUtilsService = {
    checkRateLimit: jest.fn(),
    validatePassword: jest.fn(),
    generateVerificationCode: jest.fn(),
    hashToken: jest.fn(),
    createAccessToken: jest.fn(),
    createRefreshToken: jest.fn(),
    generateSecureId: jest.fn(),
  };

  const mockGoogleOAuthService = {
    getAuthorizationUrl: jest.fn(),
    handleCallback: jest.fn(),
    revokeGoogleToken: jest.fn(),
  };

  const mockCustomLoggerService = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: AuthUtilsService,
          useValue: mockAuthUtilsService,
        },
        {
          provide: GoogleOAuthService,
          useValue: mockGoogleOAuthService,
        },
        {
          provide: CustomLoggerService,
          useValue: mockCustomLoggerService,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user with correct payload and metadata', async () => {
      const createAuthDto: CreateAuthDto = {
        username: 'testuser',
        password: 'Test@1234',
        email: 'test@example.com',
      };

      const mockRequest = {
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'Jest Test Agent',
          'x-device': 'test-device',
        },
      } as unknown as Request;

      mockAuthService.create.mockResolvedValue(undefined);

      await controller.create(createAuthDto, mockRequest);

      expect(mockAuthService.create).toHaveBeenCalledWith(createAuthDto, {
        ip: '127.0.0.1',
        userAgent: 'Jest Test Agent',
        device: 'test-device',
      });
      expect(mockAuthService.create).toHaveBeenCalledTimes(1);
    });

    it('should handle missing IP and user agent', async () => {
      const createAuthDto: CreateAuthDto = {
        username: 'testuser',
        password: 'Test@1234',
        email: 'test@example.com',
      };

      const mockRequest = {
        headers: {},
      } as unknown as Request;

      mockAuthService.create.mockResolvedValue(undefined);

      await controller.create(createAuthDto, mockRequest);

      expect(mockAuthService.create).toHaveBeenCalledWith(createAuthDto, {
        ip: 'unknown',
        userAgent: 'unknown',
        device: undefined,
      });
    });

    it('should extract device from x-device-id header if x-device is not present', async () => {
      const createAuthDto: CreateAuthDto = {
        username: 'testuser',
        password: 'Test@1234',
        email: 'test@example.com',
      };

      const mockRequest = {
        ip: '192.168.1.1',
        headers: {
          'user-agent': 'Mobile Agent',
          'x-device-id': 'mobile-device-123',
        },
      } as unknown as Request;

      mockAuthService.create.mockResolvedValue(undefined);

      await controller.create(createAuthDto, mockRequest);

      expect(mockAuthService.create).toHaveBeenCalledWith(createAuthDto, {
        ip: '192.168.1.1',
        userAgent: 'Mobile Agent',
        device: 'mobile-device-123',
      });
    });

    it('should extract device from sec-ch-ua-platform if other device headers are not present', async () => {
      const createAuthDto: CreateAuthDto = {
        username: 'testuser',
        password: 'Test@1234',
        email: 'test@example.com',
      };

      const mockRequest = {
        ip: '10.0.0.1',
        headers: {
          'user-agent': 'Chrome Browser',
          'sec-ch-ua-platform': '"Windows"',
        },
      } as unknown as Request;

      mockAuthService.create.mockResolvedValue(undefined);

      await controller.create(createAuthDto, mockRequest);

      expect(mockAuthService.create).toHaveBeenCalledWith(createAuthDto, {
        ip: '10.0.0.1',
        userAgent: 'Chrome Browser',
        device: '"Windows"',
      });
    });
  });

  describe('verifyEmail', () => {
    it('should verify email with valid code', async () => {
      const email = 'test@example.com';
      const code = '123456';
      const mockRequest = {
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'Jest Test Agent',
        },
      } as unknown as Request;

      const mockResponse = { message: 'Email verified successfully' };
      mockAuthService.verifyEmail.mockResolvedValue(mockResponse);

      const result = await controller.verifyEmail(email, code, mockRequest);

      expect(result).toEqual(mockResponse);
      expect(mockAuthService.verifyEmail).toHaveBeenCalledWith(email, code, {
        ip: '127.0.0.1',
        userAgent: 'Jest Test Agent',
      });
      expect(mockAuthService.verifyEmail).toHaveBeenCalledTimes(1);
    });

    it('should handle missing IP and user agent for verifyEmail', async () => {
      const email = 'test@example.com';
      const code = '123456';
      const mockRequest = {
        headers: {},
      } as unknown as Request;

      const mockResponse = { message: 'Email verified successfully' };
      mockAuthService.verifyEmail.mockResolvedValue(mockResponse);

      await controller.verifyEmail(email, code, mockRequest);

      expect(mockAuthService.verifyEmail).toHaveBeenCalledWith(email, code, {
        ip: 'unknown',
        userAgent: 'unknown',
      });
    });

    it('should handle service errors for verifyEmail', async () => {
      const email = 'test@example.com';
      const code = 'invalid';
      const mockRequest = {
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'Jest Test Agent',
        },
      } as unknown as Request;

      const error = new Error('Invalid verification code');
      mockAuthService.verifyEmail.mockRejectedValue(error);

      await expect(
        controller.verifyEmail(email, code, mockRequest),
      ).rejects.toThrow('Invalid verification code');
      expect(mockAuthService.verifyEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('resendVerificationEmail', () => {
    it('should resend verification email successfully', async () => {
      const email = 'test@example.com';
      const mockRequest = {
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'Jest Test Agent',
        },
      } as unknown as Request;

      const mockResponse = { message: 'Verification email sent successfully' };
      mockAuthService.resendVerificationEmail.mockResolvedValue(mockResponse);

      const result = await controller.resendVerificationEmail(
        email,
        mockRequest,
      );

      expect(result).toEqual(mockResponse);
      expect(mockAuthService.resendVerificationEmail).toHaveBeenCalledWith(
        email,
        {
          ip: '127.0.0.1',
          userAgent: 'Jest Test Agent',
        },
      );
      expect(mockAuthService.resendVerificationEmail).toHaveBeenCalledTimes(1);
    });

    it('should handle missing IP and user agent for resendVerificationEmail', async () => {
      const email = 'test@example.com';
      const mockRequest = {
        headers: {},
      } as unknown as Request;

      const mockResponse = { message: 'Verification email sent successfully' };
      mockAuthService.resendVerificationEmail.mockResolvedValue(mockResponse);

      await controller.resendVerificationEmail(email, mockRequest);

      expect(mockAuthService.resendVerificationEmail).toHaveBeenCalledWith(
        email,
        {
          ip: 'unknown',
          userAgent: 'unknown',
        },
      );
    });

    it('should handle service errors for resendVerificationEmail', async () => {
      const email = 'test@example.com';
      const mockRequest = {
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'Jest Test Agent',
        },
      } as unknown as Request;

      const error = new Error('User not found');
      mockAuthService.resendVerificationEmail.mockRejectedValue(error);

      await expect(
        controller.resendVerificationEmail(email, mockRequest),
      ).rejects.toThrow('User not found');
      expect(mockAuthService.resendVerificationEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('googleOAuthCallback', () => {
    it('should place redirect tokens in the URL fragment', async () => {
      const mockRequest = {
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'Jest Test Agent',
          'x-device': 'test-device',
        },
      } as unknown as Request;
      const mockResponse = {
        redirect: jest.fn(),
      } as unknown as { redirect: jest.Mock };

      mockGoogleOAuthService.handleCallback.mockResolvedValue({
        redirectUrl: 'https://app.example.com/callback?from=google',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: 'user-1', email: 'test@example.com' },
        isNewUser: false,
      });

      await controller.googleOAuthCallback(
        'code',
        'state',
        '',
        '',
        mockRequest,
        mockResponse as never,
      );

      expect(mockResponse.redirect).toHaveBeenCalledTimes(1);
      const redirectedUrl = new URL(mockResponse.redirect.mock.calls[0][0]);

      expect(redirectedUrl.searchParams.get('from')).toBe('google');
      expect(redirectedUrl.searchParams.has('access_token')).toBe(false);
      expect(redirectedUrl.searchParams.has('refresh_token')).toBe(false);

      const fragment = new URLSearchParams(redirectedUrl.hash.slice(1));
      expect(fragment.get('access_token')).toBe('access-token');
      expect(fragment.get('refresh_token')).toBe('refresh-token');
      expect(fragment.get('user_id')).toBe('user-1');
      expect(fragment.get('email')).toBe('test@example.com');
      expect(fragment.get('is_new_user')).toBe('false');
    });
  });

  describe('logout', () => {
    it('should use the authenticated user id instead of a body supplied id', async () => {
      const mockRequest = {
        user: { userId: 'auth-user-1', role: 'USER', tokenVersion: 1 },
      } as Request & {
        user: { userId: string; role: string; tokenVersion: number };
      };

      mockAuthService.logout.mockResolvedValue({
        message: 'Logged out successfully',
      });

      const result = await controller.logout('refresh-token', mockRequest);

      expect(mockAuthService.logout).toHaveBeenCalledWith(
        'refresh-token',
        'auth-user-1',
      );
      expect(result).toEqual({
        success: true,
        message: 'Logged out successfully',
      });
    });
  });

  describe('logoutAll', () => {
    it('should revoke sessions for the authenticated user id only', async () => {
      const mockRequest = {
        user: { userId: 'auth-user-1', role: 'USER', tokenVersion: 1 },
      } as Request & {
        user: { userId: string; role: string; tokenVersion: number };
      };

      mockAuthService.logoutAllDevices.mockResolvedValue({
        message: 'Logged out from all devices successfully',
      });

      const result = await controller.logoutAll(mockRequest);

      expect(mockAuthService.logoutAllDevices).toHaveBeenCalledWith(
        'auth-user-1',
      );
      expect(result).toEqual({
        success: true,
        message: 'Logged out from all devices successfully',
      });
    });
  });
});
