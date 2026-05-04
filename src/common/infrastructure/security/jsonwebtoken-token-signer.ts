import { Injectable } from '@nestjs/common';
import jwt, { SignOptions } from 'jsonwebtoken';
import {
  ITokenSigner,
  TokenVerificationException,
  TokenVerificationFailureReason,
  TokenSignOptions,
} from '../../domain/interfaces/token-signer.interface';

@Injectable()
export class JsonWebTokenSigner implements ITokenSigner {
  sign(
    payload: Record<string, unknown>,
    secret: string,
    options: TokenSignOptions = {},
  ): string {
    return jwt.sign(payload, secret, options as SignOptions);
  }

  verify<T extends object>(token: string, secret: string): T {
    try {
      return jwt.verify(token, secret) as T;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenVerificationException(
          TokenVerificationFailureReason.EXPIRED,
        );
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new TokenVerificationException(
          TokenVerificationFailureReason.INVALID,
        );
      }
      throw error;
    }
  }
}
