import { resolveLinnworksToken } from './app.config';

describe('resolveLinnworksToken', () => {
  it('prefers LINNWORKS_TOKEN when it is present', () => {
    expect(
      resolveLinnworksToken({
        LINNWORKS_TOKEN: 'primary-token',
        LINNWORKS_AUTH_TOKEN: 'fallback-token',
        LINNWORKS_INSTALLATION_ID: 'installation-id',
      }),
    ).toBe('primary-token');
  });

  it('falls back to LINNWORKS_AUTH_TOKEN and LINNWORKS_INSTALLATION_ID', () => {
    expect(
      resolveLinnworksToken({
        LINNWORKS_AUTH_TOKEN: 'auth-token',
        LINNWORKS_INSTALLATION_ID: 'installation-id',
      }),
    ).toBe('auth-token');

    expect(
      resolveLinnworksToken({
        LINNWORKS_INSTALLATION_ID: 'installation-id',
      }),
    ).toBe('installation-id');
  });

  it('returns an empty string when no supported variable is set', () => {
    expect(resolveLinnworksToken({})).toBe('');
  });
});