import { config } from 'dotenv';
config();

async function test() {
  const fetchJson = async (
    url: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      parseInt(process.env.LINNWORKS_TIMEOUT_MS || '30000', 10),
    );

    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  const authResponse = await fetchJson(
    'https://api.linnworks.net/api/Auth/AuthorizeByApplication',
    {
      ApplicationId: process.env.LINNWORKS_APPLICATION_ID,
      ApplicationSecret: process.env.LINNWORKS_APPLICATION_SECRET,
      Token:
        process.env.LINNWORKS_TOKEN ||
        process.env.LINNWORKS_AUTH_TOKEN ||
        process.env.LINNWORKS_INSTALLATION_ID,
    },
  );

  if (!authResponse.ok) {
    console.log('Auth failed:', await authResponse.text());
    process.exit(1);
  }
  const auth = await authResponse.json();
  const token =
    auth.Token || auth.token || auth.AccessToken || auth.accessToken;
  const server = auth.Server || auth.server;

  console.log('Auth success. Server:', server);

  const stockUrl = `${server}/api/Stock/GetStockItemsFull`;
  const stockResponse = await fetchJson(
    stockUrl,
    {
      keyword: '',
      loadCompositeParents: false,
      loadVariationParents: false,
      entriesPerPage: 200,
      pageNumber: 1,
      dataRequirements: [
        'StockLevels',
        'Pricing',
        'ChannelPrice',
        'Images',
        'ExtendedProperties',
      ],
      searchTypes: ['SKU', 'Title'],
    },
    {
      Authorization: token,
    },
  );

  if (!stockResponse.ok) {
    console.log(
      'Stock fetch failed:',
      stockResponse.status,
      await stockResponse.text(),
    );
    process.exit(1);
  } else {
    const stock = await stockResponse.json();
    console.log(
      'Stock fetch success:',
      Array.isArray(stock) ? stock.length : stock,
    );
  }
}

test().catch((error) => {
  console.error(error);
  process.exit(1);
});
