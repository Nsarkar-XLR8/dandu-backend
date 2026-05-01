import { ITransactionContext } from '../../../common/domain/interfaces/unit-of-work.interface';

export interface IUserProfileRepository {
  create(data: CreateUserProfileData, ctx?: ITransactionContext): Promise<void>;
}

export interface CreateUserProfileData {
  authId: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

export const USER_PROFILE_REPOSITORY_TOKEN = Symbol('IUserProfileRepository');
