import { afterEach, describe, expect, test } from 'bun:test';
import {
  BACKEND_API_ORIGINS,
  BACKEND_PRIMARY_ORIGIN,
  buildBackendApiCandidateUrls,
  fetchBackendApiWithFallback,
  setBackendApiFallbackOrigins,
} from './BackendApiFallback.js';

/**
 * 注意：本分支把内置节点改为可配置（默认自建中心），
 * 所以断言一律引用 `BACKEND_API_ORIGINS`，不再写死具体域名 ——
 * 否则换中心就要改测试。
 */

afterEach(() => {
  setBackendApiFallbackOrigins(null);
});

const withPath = (origin: string, path: string) => `${origin}${path}`;

describe('buildBackendApiCandidateUrls', () => {
  test('primary origin is followed by the remaining fallback chain', () => {
    const path = '/api/v2/account/core-config';
    expect(buildBackendApiCandidateUrls(withPath(BACKEND_PRIMARY_ORIGIN, path)))
      .toEqual(BACKEND_API_ORIGINS.map((origin) => withPath(origin, path)));
    expect(BACKEND_API_ORIGINS.length).toBeGreaterThan(0);
    expect(BACKEND_API_ORIGINS[0]).toBe(BACKEND_PRIMARY_ORIGIN);
  });

  test('custom origin is tried first, then the full backend chain', () => {
    const path = '/api/v2/core-runtime/request-room?x=1#y';
    expect(buildBackendApiCandidateUrls(withPath('https://example.com', path))).toEqual([
      withPath('https://example.com', path),
      ...BACKEND_API_ORIGINS.map((origin) => withPath(origin, path)),
    ]);
  });

  test('already-on-fallback origin still tries the rest of the chain without duplicating itself', () => {
    const origin = BACKEND_API_ORIGINS[0]!;
    const path = '/api/v2/account/info';
    const expected = [
      withPath(origin, path),
      ...BACKEND_API_ORIGINS.filter((item) => item !== origin).map((item) => withPath(item, path)),
    ];
    expect(buildBackendApiCandidateUrls(withPath(origin, path))).toEqual(expected);
  });

  test('non-api paths are not rewritten', () => {
    const url = withPath(BACKEND_PRIMARY_ORIGIN, '/health');
    expect(buildBackendApiCandidateUrls(url)).toEqual([url]);
  });

  test('configured preferred origin rewrites official API hosts to that chain first', () => {
    setBackendApiFallbackOrigins(['https://proxy.example.com', ...BACKEND_API_ORIGINS]);
    const path = '/api/v2/account/core-config';
    expect(buildBackendApiCandidateUrls(withPath(BACKEND_PRIMARY_ORIGIN, path))).toEqual([
      withPath('https://proxy.example.com', path),
      ...BACKEND_API_ORIGINS.map((origin) => withPath(origin, path)),
    ]);
  });

  test('configured origins do not rewrite unrelated runtime hosts', () => {
    setBackendApiFallbackOrigins(['https://proxy.example.com', ...BACKEND_API_ORIGINS]);
    const path = '/api/v2/core-runtime/sync';
    expect(buildBackendApiCandidateUrls(withPath('https://relay.example.net', path))).toEqual([
      withPath('https://relay.example.net', path),
      withPath('https://proxy.example.com', path),
      ...BACKEND_API_ORIGINS.map((origin) => withPath(origin, path)),
    ]);
  });
});

describe('fetchBackendApiWithFallback', () => {
  test('walks the whole backend chain until one succeeds', async () => {
    // 构造必然走完链路的场景：只有最后一个节点返回 200
    const targetOrigin = BACKEND_API_ORIGINS[BACKEND_API_ORIGINS.length - 1]!;
    const path = '/api/v2/account/core-config';
    const successUrl = withPath(targetOrigin, path);

    const requests: string[] = [];
    const response = await fetchBackendApiWithFallback(
      async (input) => {
        const url = String(input);
        requests.push(url);
        if (url === successUrl) {
          return new Response('ok', { status: 200 });
        }
        return new Response('bad gateway', { status: 502 });
      },
      withPath(BACKEND_PRIMARY_ORIGIN, path),
    );

    expect(response.ok).toBe(true);
    expect(requests).toEqual(BACKEND_API_ORIGINS.map((origin) => withPath(origin, path)));
  });

  test('walks configured preferred origin before the builtin chain', async () => {
    setBackendApiFallbackOrigins(['https://proxy.example.com', ...BACKEND_API_ORIGINS]);
    const path = '/api/v2/account/core-config';
    const requests: string[] = [];
    const response = await fetchBackendApiWithFallback(
      async (input) => {
        const url = String(input);
        requests.push(url);
        if (url === withPath('https://proxy.example.com', path)) {
          return new Response('ok', { status: 200 });
        }
        return new Response('bad gateway', { status: 502 });
      },
      withPath(BACKEND_PRIMARY_ORIGIN, path),
    );

    expect(response.ok).toBe(true);
    expect(requests).toEqual([withPath('https://proxy.example.com', path)]);
  });
});
