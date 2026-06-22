import { IAppConfig } from '../../../../../common/domain/interfaces/app-config.interface';
import { LinnworksClient } from './linnworks-client';

const config: IAppConfig = {
  jwt_access_secret: 'secret',
  jwt_refresh_secret: 'secret',
  redis_cache_key_prefix: 'test',
  rate_limit_enabled: true,
  linnworks_application_id: 'app-id',
  linnworks_application_secret: 'app-secret',
  linnworks_token: 'install-token',
  linnworks_auth_url:
    'https://api.linnworks.net/api/Auth/AuthorizeByApplication',
  linnworks_default_server: 'https://us-ext.linnworks.net',
  linnworks_token_ttl_minutes: 30,
  linnworks_catalog_page_size: 200,
  linnworks_orders_page_size: 200,
  linnworks_channel_batch_size: 100,
  linnworks_order_items_batch_size: 50,
  linnworks_timeout_ms: 1000,
  linnworks_retry_attempts: 0,
  linnworks_retry_base_delay_ms: 1,
  linnworks_rate_limit_per_minute: 150,
  linnworks_daily_sync_cron: '0 3 * * *',
};

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

const textResponse = (status: number, body: string): Response =>
  ({
    ok: false,
    status,
    text: async () => body,
  }) as Response;

describe('LinnworksClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('caches AuthorizeByApplication session and uses the returned server', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          Token: 'session-token',
          Server: 'https://assigned-ext.linnworks.net',
          Ttl: 30,
        }),
      )
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]));

    const client = new LinnworksClient(config);

    await client.getStockItemsFull(1);
    await client.getStockItemsFull(2);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(config.linnworks_auth_url);
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://assigned-ext.linnworks.net/api/Stock/GetStockItemsFull',
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://assigned-ext.linnworks.net/api/Stock/GetStockItemsFull',
    );
  });

  it('uses AccessToken when Token is not present in the auth response', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          AccessToken: 'access-token',
          Server: 'https://assigned-ext.linnworks.net',
          TTL: 30,
        }),
      )
      .mockResolvedValueOnce(jsonResponse([]));

    const client = new LinnworksClient(config);

    await client.getStockItemsFull(1);

    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: 'access-token',
      }),
    });
  });

  it('sends processed-order search as a JSON request body', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          Token: 'session-token',
          Server: 'https://assigned-ext.linnworks.net',
          Ttl: 30,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          PageNumber: 1,
          EntriesPerPage: 200,
          TotalEntries: 0,
          TotalPages: 0,
          Data: [],
        }),
      );

    const client = new LinnworksClient(config);
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-02T00:00:00.000Z');

    await client.searchProcessedOrdersPaged({ from, to, pageNum: 1 });

    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: expect.objectContaining({
        'content-type': 'application/json',
      }),
      body: JSON.stringify({
        from: from.toISOString(),
        to: to.toISOString(),
        dateType: 'PROCESSED',
        searchField: '',
        exactMatch: false,
        searchTerm: '',
        pageNum: 1,
        numEntriesPerPage: 200,
      }),
    });
  });

  it('reauthorizes once when a cached session is rejected', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          Token: 'old-token',
          Server: 'https://assigned-ext.linnworks.net',
          Ttl: 30,
        }),
      )
      .mockResolvedValueOnce(textResponse(401, 'expired'))
      .mockResolvedValueOnce(
        jsonResponse({
          Token: 'new-token',
          Server: 'https://assigned-ext.linnworks.net',
          Ttl: 30,
        }),
      )
      .mockResolvedValueOnce(jsonResponse([]));

    const client = new LinnworksClient(config);

    await client.getStockItemsFull(1);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: 'new-token',
      }),
    });
  });

  it('returns an empty processed-order page when Linnworks reports no items', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          Token: 'session-token',
          Server: 'https://assigned-ext.linnworks.net',
          Ttl: 30,
        }),
      )
      .mockResolvedValueOnce(textResponse(400, 'No items found'));

    const client = new LinnworksClient(config);

    await expect(
      client.searchProcessedOrdersPaged({
        from: new Date('2026-01-01T00:00:00.000Z'),
        to: new Date('2026-01-02T00:00:00.000Z'),
        pageNum: 4,
      }),
    ).resolves.toEqual({
      PageNumber: 4,
      EntriesPerPage: 200,
      TotalEntries: 0,
      TotalPages: 0,
      Data: [],
    });
  });
});
