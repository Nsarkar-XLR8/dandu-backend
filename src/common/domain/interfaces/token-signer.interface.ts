export interface TokenSignOptions {
  expiresIn?: string | number;
  algorithm?: 'HS256';
  jwtid?: string;
}

export interface ITokenSigner {
  sign(
    payload: Record<string, unknown>,
    secret: string,
    options?: TokenSignOptions,
  ): string;
  verify<T extends object>(token: string, secret: string): T;
}

export enum TokenVerificationFailureReason {
  EXPIRED = 'EXPIRED',
  INVALID = 'INVALID',
}

export class TokenVerificationException extends Error {
  constructor(public readonly reason: TokenVerificationFailureReason) {
    super(reason === TokenVerificationFailureReason.EXPIRED ? 'Token expired' : 'Token invalid');
    this.name = 'TokenVerificationException';
  }
}

export const TOKEN_SIGNER_TOKEN = Symbol('ITokenSigner');
