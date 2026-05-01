import { IGoogleTokenResponse, IGoogleUserInfo } from '../../interfaces/google-oauth.interface';

/**
 * IOAuthClient Port
 * Interface for interacting with external OAuth providers
 */
export interface IOAuthClient {
  /**
   * Exchange authorization code for tokens
   */
  exchangeCodeForTokens(code: string, codeVerifier: string): Promise<IGoogleTokenResponse>;

  /**
   * Fetch user info from provider using access token
   */
  getUserInfo(accessToken: string): Promise<IGoogleUserInfo>;

  /**
   * Revoke provider access token
   */
  revokeToken(token: string): Promise<void>;

  /**
   * Verify ID token signature and claims
   */
  verifyIdToken(idToken: string): Promise<any>;
}

export const OAUTH_CLIENT_TOKEN = Symbol('IOAuthClient');
