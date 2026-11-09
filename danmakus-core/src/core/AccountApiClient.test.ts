import { describe, expect, test } from 'bun:test';
import { AccountApiClient } from './AccountApiClient.js';
import { BACKEND_API_ORIGINS, BACKEND_PRIMARY_ORIGIN } from './BackendApiFallback.js';

describe('AccountApiClient', () => {
  test('getCoreConfig walks the configured backend chain when earlier backends fail', async () => {
    // 默认中心可配置（默认自建），因此以链尾节点作为唯一可达目标
    const lastOrigin = BACKEND_API_ORIGINS[BACKEND_API_ORIGINS.length - 1]!;
    const runtimeUrl = `${lastOrigin}/api/v2/core-runtime`;
    const requests: string[] = [];
    const client = new AccountApiClient(
      'token',
      async (input) => {
        const url = String(input);
        requests.push(url);
        if (!url.startsWith(`${lastOrigin}/`)) {
          return new Response('bad gateway', { status: 502 });
        }

        return new Response(JSON.stringify({
          code: 200,
          data: {
            runtimeUrl,
            areas: {},
            streamers: [],
            desiredRecorders: 15,
          }
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }
    );

    const result = await client.getCoreConfig();

    expect(requests).toEqual(
      BACKEND_API_ORIGINS.map((origin) => `${origin}/api/v2/account/core-config`)
    );
    expect(result.runtimeUrl).toBe(runtimeUrl);
    // 默认中心即链首
    expect(requests[0]).toBe(`${BACKEND_PRIMARY_ORIGIN}/api/v2/account/core-config`);
  });

  test('getCoreClients should read from core runtime clients endpoint', async () => {
    let requestUrl = '';
    const client = new AccountApiClient(
      'token',
      async (input) => {
        requestUrl = String(input);
        return new Response(JSON.stringify({
          code: 200,
          data: [{ clientId: 'client-1', isRunning: true }],
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Core-Config-Tag': 'config-tag',
            'X-Core-Clients-Tag': 'clients-tag',
          },
        });
      },
    );

    const result = await client.getCoreClients();
    expect(result.data).toEqual([{ clientId: 'client-1', isRunning: true } as any]);
    expect(result.tags.configTag).toBe('config-tag');
    expect(result.tags.clientsTag).toBe('clients-tag');
    expect(requestUrl).toContain('/clients');
  });
});
