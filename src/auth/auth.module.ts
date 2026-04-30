import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthUtilsService } from './services/auth-utils.service';
import { GoogleOAuthService } from './services/google-oauth.service';
import { ActivityLogService } from '../common/services/activity-log.service';
import { QueueModule } from '../common/modules';

// Repository injection tokens
import { AUTH_USER_REPOSITORY_TOKEN } from './domain/repositories/auth-user.repository.interface';
import { AUTH_SECURITY_REPOSITORY_TOKEN } from './domain/repositories/auth-security.repository.interface';
import { LOGIN_HISTORY_REPOSITORY_TOKEN } from './domain/repositories/login-history.repository.interface';
import { EMAIL_HISTORY_REPOSITORY_TOKEN } from './domain/repositories/email-history.repository.interface';
import { USER_PROFILE_REPOSITORY_TOKEN } from './domain/repositories/user-profile.repository.interface';
import { UNIT_OF_WORK_TOKEN } from '../common/domain/interfaces/unit-of-work.interface';
import { ACTIVITY_LOG_REPOSITORY_TOKEN } from '../common/domain/repositories/activity-log.repository.interface';

// Prisma adapters (implementations)
import { PrismaAuthUserRepository } from './infrastructure/persistence/prisma-auth-user.repository';
import { PrismaAuthSecurityRepository } from './infrastructure/persistence/prisma-auth-security.repository';
import { PrismaLoginHistoryRepository } from './infrastructure/persistence/prisma-login-history.repository';
import { PrismaEmailHistoryRepository } from './infrastructure/persistence/prisma-email-history.repository';
import { PrismaUserProfileRepository } from './infrastructure/persistence/prisma-user-profile.repository';
import { PrismaUnitOfWork } from '../common/infrastructure/persistence/prisma-unit-of-work';
import { PrismaActivityLogRepository } from '../common/infrastructure/persistence/prisma-activity-log.repository';
import { PASSWORD_HASHER_TOKEN } from '../common/domain/interfaces/password-hasher.interface';
import { BcryptPasswordHasher } from '../common/infrastructure/security/bcrypt-password-hasher';

/**
 * Auth Module — Hexagonal Architecture Wiring
 *
 * Application services depend on ports. Infrastructure adapters are bound here,
 * while shared database/cache clients are provided once by global common modules.
 */
@Module({
  imports: [QueueModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthUtilsService,
    GoogleOAuthService,
    ActivityLogService,
    BcryptPasswordHasher,
    { provide: PASSWORD_HASHER_TOKEN, useExisting: BcryptPasswordHasher },
    // Port → Adapter bindings
    { provide: AUTH_USER_REPOSITORY_TOKEN, useClass: PrismaAuthUserRepository },
    {
      provide: AUTH_SECURITY_REPOSITORY_TOKEN,
      useClass: PrismaAuthSecurityRepository,
    },
    {
      provide: LOGIN_HISTORY_REPOSITORY_TOKEN,
      useClass: PrismaLoginHistoryRepository,
    },
    {
      provide: EMAIL_HISTORY_REPOSITORY_TOKEN,
      useClass: PrismaEmailHistoryRepository,
    },
    {
      provide: USER_PROFILE_REPOSITORY_TOKEN,
      useClass: PrismaUserProfileRepository,
    },
    { provide: UNIT_OF_WORK_TOKEN, useClass: PrismaUnitOfWork },
    {
      provide: ACTIVITY_LOG_REPOSITORY_TOKEN,
      useClass: PrismaActivityLogRepository,
    },
  ],
  exports: [
    AuthUtilsService,
    GoogleOAuthService,
    AUTH_USER_REPOSITORY_TOKEN, // Exported for AuthGuard in other modules
  ],
})
export class AuthModule {}
