import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { IOAuthClient } from '../../application/ports/oauth-client.interface';
import { IGoogleTokenResponse, IGoogleUserInfo, IGoogleIdTokenClaims } from '../../interfaces/google-oauth.interface';
import { GOOGLE_OAUTH_CONFIG, getGoogleOAuthCredentials } from '../../config/google-oauth.config';
import AppError from '../../../common/errors/app.error';
import { CustomLoggerService } from '../../../common/services/custom-logger.service';

@Injectable()
export class GoogleOAuthAdapter implements IOAuthClient {
  private readonly jwksClient: JwksClient;

  constructor(private readonly customLogger: CustomLoggerService) {
    this.jwksClient = new JwksClient({
      jwksUri: GOOGLE_OAUTH_CONFIG.ENDPOINTS.JWKS,
      cache: true,
      cacheMaxAge: 86400000,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }

  async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<IGoogleTokenResponse> {
    const { clientId, clientSecret, redirectUri } = getGoogleOAuthCredentials();

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: GOOGLE_OAUTH_CONFIG.GRANT_TYPES.AUTHORIZATION_CODE,
      redirect_uri: redirectUri,
    });

    const response = await fetch(GOOGLE_OAUTH_CONFIG.ENDPOINTS.TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      this.customLogger.error(`Failed to exchange Google code: ${JSON.stringify(errorData)}`, undefined, 'GoogleOAuthAdapter');
      throw AppError.unauthorized('Failed to authenticate with Google');
    }

    return response.json() as Promise<IGoogleTokenResponse>;
  }

  async getUserInfo(accessToken: string): Promise<IGoogleUserInfo> {
    const response = await fetch(GOOGLE_OAUTH_CONFIG.ENDPOINTS.USERINFO, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorData = await response.json();
      this.customLogger.error(`Failed to fetch Google user info: ${JSON.stringify(errorData)}`, undefined, 'GoogleOAuthAdapter');
      throw AppError.unauthorized('Failed to get user information from Google');
    }

    return response.json() as Promise<IGoogleUserInfo>;
  }

  async revokeToken(token: string): Promise<void> {
    try {
      const response = await fetch(`${GOOGLE_OAUTH_CONFIG.ENDPOINTS.REVOKE}?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (!response.ok) {
        this.customLogger.warn('Failed to revoke Google token', 'GoogleOAuthAdapter');
      }
    } catch (error) {
      this.customLogger.error(`Error revoking Google token: ${error instanceof Error ? error.message : String(error)}`, undefined, 'GoogleOAuthAdapter');
    }
  }

  async verifyIdToken(idToken: string): Promise<IGoogleIdTokenClaims> {
    try {
      const { clientId } = getGoogleOAuthCredentials();
      const decoded = jwt.decode(idToken, { complete: true });

      if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
        throw new Error('Invalid token format');
      }

      const key = await this.jwksClient.getSigningKey(decoded.header.kid);
      const publicKey = key.getPublicKey();

      const payload = jwt.verify(idToken, publicKey, {
        algorithms: ['RS256'],
        issuer: ['accounts.google.com', 'https://accounts.google.com'],
        audience: clientId,
        clockTolerance: 60,
      }) as IGoogleIdTokenClaims;

      if (!payload.email_verified) {
        throw new Error('Email not verified by Google');
      }

      return payload;
    } catch (error) {
      this.customLogger.error(`ID token verification failed: ${error instanceof Error ? error.message : String(error)}`, undefined, 'GoogleOAuthAdapter');
      throw AppError.unauthorized('Failed to verify Google ID token');
    }
  }
}
