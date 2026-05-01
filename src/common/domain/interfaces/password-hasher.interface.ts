export interface IPasswordHasher {
  hash(plainText: string, saltRounds?: number): Promise<string>;
  compare(plainText: string, hash: string): Promise<boolean>;
}

export const PASSWORD_HASHER_TOKEN = Symbol('IPasswordHasher');
