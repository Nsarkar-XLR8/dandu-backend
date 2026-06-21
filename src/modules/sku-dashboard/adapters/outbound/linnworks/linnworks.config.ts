import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LinnworksConfig {
  readonly applicationId: string;
  readonly applicationSecret: string;
  readonly installationId: string;
  /** Pre-fetched auth token from .env — used as the initial token before first renewal */
  readonly initialAuthToken: string;

  constructor(config: ConfigService) {
    this.applicationId = config.getOrThrow<string>('LINNWORKS_APPLICATION_ID');
    this.applicationSecret = config.getOrThrow<string>('LINNWORKS_APPLICATION_SECRET');
    this.installationId = config.getOrThrow<string>('LINNWORKS_INSTALLATION_ID');
    this.initialAuthToken = config.getOrThrow<string>('LINNWORKS_AUTH_TOKEN');
  }
}
