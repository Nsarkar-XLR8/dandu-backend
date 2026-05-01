import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Query,
  Res,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RegisterService } from '../../application/services/register.service';
import { LoginService } from '../../application/services/login.service';
import { TokenService } from '../../application/services/token.service';
import { GoogleOAuthService } from '../../application/services/google-oauth.service';
import { CreateAuthDto } from '../../dto/create-auth.dto';
import {
  GoogleOAuthInitDto,
  GoogleOAuthCallbackDto,
} from '../../dto/google-oauth.dto';
import type { Request, Response } from 'express';
import { CustomLoggerService } from '../../../common/services/custom-logger.service';
import { THROTTLER_CONFIG } from '../../../common/config/throttler.config';
import { AuthGuard } from '../../../common/guards/auth.guard';
import {
  RequestMeta,
  type RequestMetadata,
} from '../../../common/decorators/request-metadata.decorator';

interface AuthenticatedRequest extends Request {
  user: { userId: string; role: string; tokenVersion: number };
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerService: RegisterService,
    private readonly loginService: LoginService,
    private readonly tokenService: TokenService,
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly customLogger: CustomLoggerService,
  ) {}

  // Strict rate limit for registration: 5 requests per 15 minutes
  @Throttle({ default: THROTTLER_CONFIG.AUTH })
  @Post()
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Validation failed or User already exists' })
  create(@Body() payload: CreateAuthDto, @RequestMeta() meta: RequestMetadata) {
    this.customLogger.log(
      `Registration attempt for email: ${payload.email}`,
      'AuthController',
    );
    return this.registerService.create(payload, meta);
  }

  // Strict rate limit for verification: 5 requests per 15 minutes
  @Throttle({ default: THROTTLER_CONFIG.AUTH })
  @Post('verify-email')
  @ApiOperation({ summary: 'Verify user email with the provided code' })
  @ApiResponse({ status: 200, description: 'Email successfully verified' })
  @ApiResponse({ status: 400, description: 'Invalid or expired verification code' })
  verifyEmail(
    @Body('email') email: string,
    @Body('code') code: string,
    @RequestMeta(false) meta: RequestMetadata,
  ) {
    this.customLogger.log(
      `Email verification attempt for: ${email}`,
      'AuthController',
    );
    return this.registerService.verifyEmail(email, code, meta);
  }

  // Strict rate limit: 5 requests per 15 minutes
  @Throttle({ default: THROTTLER_CONFIG.AUTH })
  @Post('resend-verification-email')
  @ApiOperation({ summary: 'Resend email verification code' })
  @ApiResponse({ status: 200, description: 'Verification code resent successfully' })
  resendVerificationEmail(
    @Body('email') email: string,
    @RequestMeta(false) meta: RequestMetadata,
  ) {
    return this.registerService.resendVerificationEmail(email, meta);
  }

  // ==========================================
  // Google OAuth Endpoints
  // ==========================================

  /**
   * Initiate Google OAuth flow
   * Returns the Google authorization URL for the client to redirect to
   *
   * @example GET /auth/google
   * @example GET /auth/google?redirectUrl=http://localhost:3000/dashboard
   */
  @Get('google')
  @ApiOperation({ summary: 'Initiate Google OAuth flow' })
  @ApiResponse({ status: 302, description: 'Redirects to Google consent screen' })
  async googleOAuthInit(
    @Query() query: GoogleOAuthInitDto,
    @RequestMeta(false) meta: RequestMetadata,
  ) {
    this.customLogger.log(
      'Google OAuth initialization requested',
      'AuthController',
    );

    const { url, state } = await this.googleOAuthService.getAuthorizationUrl(
      meta,
      query.redirectUrl,
    );

    return {
      url,
      state,
      message: 'Redirect to the provided URL to authenticate with Google',
    };
  }

  /**
   * Google OAuth callback handler
   * This endpoint is called by Google after user authentication
   *
   * For browser-based flows, this redirects to the frontend
   * For API-based flows, returns JSON with tokens
   */
  @Get('google/callback')
  async googleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @RequestMeta() meta: RequestMetadata,

    @Res({ passthrough: true }) res: Response,
  ) {
    // Handle OAuth errors
    if (error) {
      this.customLogger.warn(
        `Google OAuth error: ${error} - ${errorDescription}`,
        'AuthController',
      );
      Logger.warn(
        `Google OAuth error: ${error} - ${errorDescription}`,
        'AuthController',
      );

      // For browser redirect, you might want to redirect to an error page
      return {
        success: false,
        error,
        errorDescription,
        message: 'Google authentication failed',
      };
    }

    if (!code || !state) {
      return {
        success: false,
        error: 'missing_parameters',
        message: 'Missing authorization code or state parameter',
      };
    }

    this.customLogger.log('Google OAuth callback received', 'AuthController');
    Logger.log('Google OAuth callback received', 'AuthController');

    const result = await this.googleOAuthService.handleCallback(
      code,
      state,
      meta,
    );

    // If redirectUrl is provided, put tokens in the fragment so they are not
    // sent back to servers in request URLs or Referer headers.
    if (result.redirectUrl) {
      const redirectUrl = new URL(result.redirectUrl);
      redirectUrl.hash = new URLSearchParams({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
        user_id: result.user.id,
        email: result.user.email,
        is_new_user: result.isNewUser.toString(),
      }).toString();

      return res.redirect(redirectUrl.toString());
    }

    // Otherwise return JSON response
    return {
      success: true,
      message: result.isNewUser
        ? 'Account created successfully via Google'
        : 'Signed in successfully via Google',
      data: result,
    };
  }

  /**
   * Alternative POST endpoint for Google OAuth callback
   * Useful for mobile apps or SPAs that handle the callback differently
   */
  @Post('google/callback')
  @ApiOperation({ summary: 'Alternative POST endpoint for Google OAuth callback' })
  @ApiResponse({ status: 200, description: 'Google OAuth callback processed' })
  async googleOAuthCallbackPost(
    @Body() body: GoogleOAuthCallbackDto,
    @RequestMeta() meta: RequestMetadata,
  ) {
    this.customLogger.log(
      'Google OAuth callback (POST) received',
      'AuthController',
    );

    const result = await this.googleOAuthService.handleCallback(
      body.code,
      body.state,
      meta,
    );

    return {
      success: true,
      message: result.isNewUser
        ? 'Account created successfully via Google'
        : 'Signed in successfully via Google',
      data: result,
    };
  }

  // ==========================================
  // Login/Logout Endpoints
  // ==========================================

  /**
   * Login with email and password
   */
  // Strict rate limit for login: 5 requests per 15 minutes per IP
  @Throttle({ default: THROTTLER_CONFIG.AUTH })
  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body('email') email: string,
    @Body('password') password: string,
    @RequestMeta() meta: RequestMetadata,
  ) {
    this.customLogger.log(
      `Login attempt for email: ${email}`,
      'AuthController',
    );

    const result = await this.loginService.login({ email, password }, meta);

    return {
      success: true,
      message: 'Login successful',
      data: result,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  @Post('refresh-token')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshToken(
    @Body('refreshToken') refreshToken: string,
    @RequestMeta() meta: RequestMetadata,
  ) {
    this.customLogger.log('Token refresh requested', 'AuthController');

    const result = await this.tokenService.refreshToken(refreshToken, meta);

    return {
      success: true,
      message: 'Token refreshed successfully',
      data: result,
    };
  }

  /**
   * Logout current session
   */
  @UseGuards(AuthGuard)
  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @Body('refreshToken') refreshToken: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.customLogger.log('Logout requested', 'AuthController');

    const result = await this.tokenService.logout(refreshToken, req.user.userId);

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Logout from all devices
   */
  @UseGuards(AuthGuard)
  @Post('logout-all')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from all devices' })
  @ApiResponse({ status: 200, description: 'Logged out from all devices successfully' })
  async logoutAll(@Req() req: AuthenticatedRequest) {
    this.customLogger.log(
      `Logout all devices requested for user: ${req.user.userId}`,
      'AuthController',
    );

    const result = await this.tokenService.logoutAllDevices(req.user.userId);

    return {
      success: true,
      ...result,
    };
  }
}
