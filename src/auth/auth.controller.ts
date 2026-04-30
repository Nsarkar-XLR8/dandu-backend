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
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './services/google-oauth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
// import { UpdateAuthDto } from './dto/update-auth.dto';
import {
  GoogleOAuthInitDto,
  GoogleOAuthCallbackDto,
} from './dto/google-oauth.dto';
import type { Request, Response } from 'express';
import { CustomLoggerService } from '../common/services/custom-logger.service';
import { THROTTLER_CONFIG } from '../common/config/throttler.config';
import { AuthGuard } from '../common/guards/auth.guard';

interface AuthenticatedRequest extends Request {
  user: { userId: string; role: string; tokenVersion: number };
}

interface RequestMetadata {
  ip: string;
  userAgent: string;
  device?: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly customLogger: CustomLoggerService,
  ) {}

  // Strict rate limit for registration: 5 requests per 15 minutes
  @Throttle({ default: THROTTLER_CONFIG.AUTH })
  @Post()
  create(@Body() payload: CreateAuthDto, @Req() req: Request) {
    this.customLogger.log(
      `Registration attempt for email: ${payload.email}`,
      'AuthController',
    );
    const meta = this.extractRequestMetadata(req);
    return this.authService.create(payload, meta);
  }

  // Strict rate limit for verification: 5 requests per 15 minutes
  @Throttle({ default: THROTTLER_CONFIG.AUTH })
  @Post('verify-email')
  verifyEmail(
    @Body('email') email: string,
    @Body('code') code: string,
    @Req() req: Request,
  ) {
    this.customLogger.log(
      `Email verification attempt for: ${email}`,
      'AuthController',
    );
    const meta = this.extractRequestMetadata(req, false);
    return this.authService.verifyEmail(email, code, meta);
  }

  // Strict rate limit: 5 requests per 15 minutes
  @Throttle({ default: THROTTLER_CONFIG.AUTH })
  @Post('resend-verification-email')
  resendVerificationEmail(@Body('email') email: string, @Req() req: Request) {
    const meta = this.extractRequestMetadata(req, false);
    return this.authService.resendVerificationEmail(email, meta);
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
  async googleOAuthInit(
    @Query() query: GoogleOAuthInitDto,
    @Req() req: Request,
  ) {
    this.customLogger.log(
      'Google OAuth initialization requested',
      'AuthController',
    );

    const meta = this.extractRequestMetadata(req, false);

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
    @Req() req: Request,

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

    const meta = this.extractRequestMetadata(req);

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
  async googleOAuthCallbackPost(
    @Body() body: GoogleOAuthCallbackDto,
    @Req() req: Request,
  ) {
    this.customLogger.log(
      'Google OAuth callback (POST) received',
      'AuthController',
    );

    const meta = this.extractRequestMetadata(req);

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
  async login(
    @Body('email') email: string,
    @Body('password') password: string,
    @Req() req: Request,
  ) {
    this.customLogger.log(
      `Login attempt for email: ${email}`,
      'AuthController',
    );

    const meta = this.extractRequestMetadata(req);

    const result = await this.authService.login({ email, password }, meta);

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
  async refreshToken(
    @Body('refreshToken') refreshToken: string,
    @Req() req: Request,
  ) {
    this.customLogger.log('Token refresh requested', 'AuthController');

    const meta = this.extractRequestMetadata(req);

    const result = await this.authService.refreshToken(refreshToken, meta);

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
  async logout(
    @Body('refreshToken') refreshToken: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.customLogger.log('Logout requested', 'AuthController');

    const result = await this.authService.logout(refreshToken, req.user.userId);

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
  async logoutAll(@Req() req: AuthenticatedRequest) {
    this.customLogger.log(
      `Logout all devices requested for user: ${req.user.userId}`,
      'AuthController',
    );

    const result = await this.authService.logoutAllDevices(req.user.userId);

    return {
      success: true,
      ...result,
    };
  }

  private extractRequestMetadata(
    req: Request,
    includeDevice = true,
  ): RequestMetadata {
    const meta: RequestMetadata = {
      ip: req.ip || 'unknown',
      userAgent: this.firstHeaderValue(req.headers['user-agent']) || 'unknown',
    };

    if (includeDevice) {
      meta.device =
        this.firstHeaderValue(req.headers['x-device']) ||
        this.firstHeaderValue(req.headers['x-device-id']) ||
        this.firstHeaderValue(req.headers['sec-ch-ua-platform']);
    }

    return meta;
  }

  private firstHeaderValue(
    value: Request['headers'][string],
  ): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
