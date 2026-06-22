import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LinnworksConfig {
  readonly applicationId: string;
  readonly applicationSecret: string;
  readonly installationToken: string;
  readonly initialSessionToken?: string;
  readonly initialServer: string;

  constructor(config: ConfigService) {
    this.applicationId = config.getOrThrow<string>('LINNWORKS_APPLICATION_ID');
    this.applicationSecret = config.getOrThrow<string>('LINNWORKS_APPLICATION_SECRET');
    this.installationToken =
      config.get<string>('LINNWORKS_INSTALLATION_TOKEN') ??
      config.get<string>('LINNWORKS_AUTH_TOKEN') ??
      config.getOrThrow<string>('LINNWORKS_INSTALLATION_ID');
    this.initialSessionToken = config.get<string>('LINNWORKS_SESSION_TOKEN');
    this.initialServer = config.get<string>('LINNWORKS_API_SERVER') ?? 'https://api.linnworks.net';
  }
}
