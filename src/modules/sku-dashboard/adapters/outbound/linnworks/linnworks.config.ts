import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LinnworksConfig {
  readonly applicationId: string;
  readonly applicationSecret: string;
  readonly installationId: string;
  /** Optional pre-fetched session token. The client normally authorizes with app credentials on demand. */
  readonly initialAuthToken?: string;

  constructor(config: ConfigService) {
    this.applicationId = config.getOrThrow<string>('LINNWORKS_APPLICATION_ID');
    this.applicationSecret = config.getOrThrow<string>('LINNWORKS_APPLICATION_SECRET');
    this.installationId = config.getOrThrow<string>('LINNWORKS_INSTALLATION_ID');
    this.initialAuthToken = config.get<string>('LINNWORKS_AUTH_TOKEN');
  }
}
