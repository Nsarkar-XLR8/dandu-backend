import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccessTokenAuthenticator } from '../../auth/application/services/access-token-authenticator.service';

/**
 * HTTP adapter guard. Authentication rules live in AccessTokenAuthenticator.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authenticator: AccessTokenAuthenticator) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No token found');
    }

    try {
      const principal = await this.authenticator.authenticate(token);
      Object.assign(request, { user: principal });
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(
        error instanceof Error ? error.message : 'Authentication failed',
      );
    }
  }

  /**
   * Extract token from Authorization header
   * Format: Bearer <token>
   */
  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }

}
