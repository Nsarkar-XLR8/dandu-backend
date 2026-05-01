import { Module } from '@nestjs/common';
import { AuthController } from './infrastructure/controllers/auth.controller';
import { AuthUtilsService } from './application/services/auth-utils.service';
import { GoogleOAuthService } from './application/services/google-oauth.service';
import { RegisterService } from './application/services/register.service';
import { LoginService } from './application/services/login.service';
import { TokenService } from './application/services/token.service';
import { ActivityLogService } from '../common/services/activity-log.service';
import { AppConfigService } from '../common/config/app-config.service';
import { GoogleOAuthAdapter } from './infrastructure/external-services/google-oauth.adapter';
import { OAUTH_CLIENT_TOKEN } from './application/ports/oauth-client.interface';
import { QueueModule } from '../common/modules';

// Repository injection tokens
import { AUTH_USER_REPOSITORY_TOKEN } from './domain/repositories/auth-user.repository.interface';
import { AUTH_SECURITY_REPOSITORY_TOKEN } from './domain/repositories/auth-security.repository.interface';
import { LOGIN_HISTORY_REPOSITORY_TOKEN } from './domain/repositories/login-history.repository.interface';
import { EMAIL_HISTORY_REPOSITORY_TOKEN } from './domain/repositories/email-history.repository.interface';
import { USER_PROFILE_REPOSITORY_TOKEN } from './domain/repositories/user-profile.repository.interface';
import { ACTIVITY_LOG_REPOSITORY_TOKEN } from '../common/domain/repositories/activity-log.repository.interface';

// Prisma adapters (implementations)
import { PrismaAuthUserRepository } from './infrastructure/persistence/prisma-auth-user.repository';
import { PrismaAuthSecurityRepository } from './infrastructure/persistence/prisma-auth-security.repository';
import { PrismaLoginHistoryRepository } from './infrastructure/persistence/prisma-login-history.repository';
import { PrismaEmailHistoryRepository } from './infrastructure/persistence/prisma-email-history.repository';
import { PrismaUserProfileRepository } from './infrastructure/persistence/prisma-user-profile.repository';
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
    AuthUtilsService,
    GoogleOAuthService,
    RegisterService,
    LoginService,
    TokenService,
    ActivityLogService,
    AppConfigService,
    BcryptPasswordHasher,
    { provide: PASSWORD_HASHER_TOKEN, useExisting: BcryptPasswordHasher },
    // Port → Adapter bindings
    {
      provide: OAUTH_CLIENT_TOKEN,
      useClass: GoogleOAuthAdapter,
    },
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
