import { Module } from '@nestjs/common';
import { AuthController } from './infrastructure/controllers/auth.controller';
import { AuthUtilsService } from './application/services/auth-utils.service';
import { AccessTokenAuthenticator } from './application/services/access-token-authenticator.service';
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
import { ACTIVITY_RECORDER_TOKEN } from '../common/domain/interfaces/activity-recorder.interface';
import { TOKEN_SIGNER_TOKEN } from '../common/domain/interfaces/token-signer.interface';
import { APP_CONFIG_TOKEN } from '../common/domain/interfaces/app-config.interface';
import { CACHE_STORE_TOKEN } from '../common/domain/interfaces/cache-store.interface';
import { EMAIL_SENDER_TOKEN } from '../common/domain/interfaces/email-sender.interface';
import { LOGGER_TOKEN } from '../common/domain/interfaces/logger.interface';
import { UNIT_OF_WORK_TOKEN } from '../common/domain/interfaces/unit-of-work.interface';

// Prisma adapters (implementations)
import { PrismaAuthUserRepository } from './infrastructure/persistence/prisma-auth-user.repository';
import { PrismaAuthSecurityRepository } from './infrastructure/persistence/prisma-auth-security.repository';
import { PrismaLoginHistoryRepository } from './infrastructure/persistence/prisma-login-history.repository';
import { PrismaEmailHistoryRepository } from './infrastructure/persistence/prisma-email-history.repository';
import { PrismaUserProfileRepository } from './infrastructure/persistence/prisma-user-profile.repository';
import { PrismaActivityLogRepository } from '../common/infrastructure/persistence/prisma-activity-log.repository';
import { PASSWORD_HASHER_TOKEN } from '../common/domain/interfaces/password-hasher.interface';
import { BcryptPasswordHasher } from '../common/infrastructure/security/bcrypt-password-hasher';
import { JsonWebTokenSigner } from '../common/infrastructure/security/jsonwebtoken-token-signer';
import { AuthGuard } from '../common/guards/auth.guard';

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
    ActivityLogService,
    AppConfigService,
    BcryptPasswordHasher,
    JsonWebTokenSigner,
    { provide: PASSWORD_HASHER_TOKEN, useExisting: BcryptPasswordHasher },
    { provide: TOKEN_SIGNER_TOKEN, useExisting: JsonWebTokenSigner },
    { provide: ACTIVITY_RECORDER_TOKEN, useExisting: ActivityLogService },
    // Port → Adapter bindings
    {
      provide: OAUTH_CLIENT_TOKEN,
      useClass: GoogleOAuthAdapter,
    },
    {
      provide: AuthUtilsService,
      useFactory: (cacheStore, appConfig, tokenSigner) =>
        new AuthUtilsService(cacheStore, appConfig, tokenSigner),
      inject: [CACHE_STORE_TOKEN, APP_CONFIG_TOKEN, TOKEN_SIGNER_TOKEN],
    },
    {
      provide: AccessTokenAuthenticator,
      useFactory: (tokenSigner, appConfig, cacheStore, authUserRepo) =>
        new AccessTokenAuthenticator(
          tokenSigner,
          appConfig,
          cacheStore,
          authUserRepo,
        ),
      inject: [
        TOKEN_SIGNER_TOKEN,
        APP_CONFIG_TOKEN,
        CACHE_STORE_TOKEN,
        AUTH_USER_REPOSITORY_TOKEN,
      ],
    },
    AuthGuard,
    {
      provide: TokenService,
      useFactory: (authUtilsService, appConfig, logger, cacheStore, authUserRepo) =>
        new TokenService(
          authUtilsService,
          appConfig,
          logger,
          cacheStore,
          authUserRepo,
        ),
      inject: [
        AuthUtilsService,
        APP_CONFIG_TOKEN,
        LOGGER_TOKEN,
        CACHE_STORE_TOKEN,
        AUTH_USER_REPOSITORY_TOKEN,
      ],
    },
    {
      provide: LoginService,
      useFactory: (
        authUtilsService,
        tokenService,
        logger,
        passwordHasher,
        authUserRepo,
        authSecurityRepo,
        loginHistoryRepo,
      ) =>
        new LoginService(
          authUtilsService,
          tokenService,
          logger,
          passwordHasher,
          authUserRepo,
          authSecurityRepo,
          loginHistoryRepo,
        ),
      inject: [
        AuthUtilsService,
        TokenService,
        LOGGER_TOKEN,
        PASSWORD_HASHER_TOKEN,
        AUTH_USER_REPOSITORY_TOKEN,
        AUTH_SECURITY_REPOSITORY_TOKEN,
        LOGIN_HISTORY_REPOSITORY_TOKEN,
      ],
    },
    {
      provide: RegisterService,
      useFactory: (
        authUtilsService,
        activityRecorder,
        appConfig,
        logger,
        cacheStore,
        emailSender,
        passwordHasher,
        authUserRepo,
        authSecurityRepo,
        emailHistoryRepo,
        unitOfWork,
      ) =>
        new RegisterService(
          authUtilsService,
          activityRecorder,
          appConfig,
          logger,
          cacheStore,
          emailSender,
          passwordHasher,
          authUserRepo,
          authSecurityRepo,
          emailHistoryRepo,
          unitOfWork,
        ),
      inject: [
        AuthUtilsService,
        ACTIVITY_RECORDER_TOKEN,
        APP_CONFIG_TOKEN,
        LOGGER_TOKEN,
        CACHE_STORE_TOKEN,
        EMAIL_SENDER_TOKEN,
        PASSWORD_HASHER_TOKEN,
        AUTH_USER_REPOSITORY_TOKEN,
        AUTH_SECURITY_REPOSITORY_TOKEN,
        EMAIL_HISTORY_REPOSITORY_TOKEN,
        UNIT_OF_WORK_TOKEN,
      ],
    },
    {
      provide: GoogleOAuthService,
      useFactory: (
        logger,
        appConfig,
        cacheStore,
        activityRecorder,
        authUtilsService,
        tokenService,
        loginService,
        authUserRepo,
        authSecurityRepo,
        userProfileRepo,
        unitOfWork,
        oauthClient,
      ) =>
        new GoogleOAuthService(
          logger,
          appConfig,
          cacheStore,
          activityRecorder,
          authUtilsService,
          tokenService,
          loginService,
          authUserRepo,
          authSecurityRepo,
          userProfileRepo,
          unitOfWork,
          oauthClient,
        ),
      inject: [
        LOGGER_TOKEN,
        APP_CONFIG_TOKEN,
        CACHE_STORE_TOKEN,
        ACTIVITY_RECORDER_TOKEN,
        AuthUtilsService,
        TokenService,
        LoginService,
        AUTH_USER_REPOSITORY_TOKEN,
        AUTH_SECURITY_REPOSITORY_TOKEN,
        USER_PROFILE_REPOSITORY_TOKEN,
        UNIT_OF_WORK_TOKEN,
        OAUTH_CLIENT_TOKEN,
      ],
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
    AccessTokenAuthenticator,
    AuthGuard,
    GoogleOAuthService,
    AUTH_USER_REPOSITORY_TOKEN, // Exported for AuthGuard in other modules
  ],
})
export class AuthModule {}
