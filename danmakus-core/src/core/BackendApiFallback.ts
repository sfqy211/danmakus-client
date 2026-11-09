/**
 * 默认后端 API 节点。
 *
 * 这是本分支与上游 danmakus-client 的主要差异点：上游把官方站点写死在这里，
 * 本项目改为可配置，默认指向自建中心。
 *
 * 为什么必须在 core 层改：`AccountApiClient` 的账号中心地址
 * （core-config / info / recording）直接由 `BACKEND_PRIMARY_ORIGIN` 推导，
 * 只覆盖 `--runtime-url` 够不着账号中心 —— 客户端启动时会去拉远端配置，
 * 地址不对就直接启动失败。
 *
 * 读取顺序（三端通用）：
 * 1. `DANMAKUS_API_ORIGINS` —— CLI / Docker / PM2 用环境变量（逗号分隔）
 * 2. `import.meta.env.VITE_API_BASE` —— Vite 前端构建期注入
 * 3. 兜底 `https://api.ovodm.top`
 *
 * 注意不能只读 `process.env`：Vite 在打包 HTML 客户端时会把
 * `typeof process` 折成常量，最终产物里 `process.env` 等于 `{}.X` ——
 * 永远拿不到值。所以浏览器侧必须走 `import.meta.env`。
 */
const parseOrigins = (raw: string | undefined): readonly string[] | null => {
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return list.length > 0 ? list : null;
};

const resolveBackendOrigins = (): readonly string[] => {
  // 1) 运行时环境变量（CLI / Docker / PM2）
  const fromProcess = typeof process !== 'undefined' && process.env
    ? parseOrigins(process.env.DANMAKUS_API_ORIGINS)
    : null;
  if (fromProcess) return fromProcess;

  // 2) 构建期注入（Vite 前端）
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
  const fromVite = parseOrigins(metaEnv?.VITE_API_BASE);
  if (fromVite) return fromVite;

  // 3) 兜底
  return ['https://api.ovodm.top'];
};

export const BACKEND_API_ORIGINS: readonly string[] = resolveBackendOrigins();

export const BACKEND_PRIMARY_ORIGIN = BACKEND_API_ORIGINS[0]!;

type FetchBackendApiFallbackOptions = {
  timeoutMs?: number;
  origins?: readonly string[];
};

const isBackendApiPath = (pathname: string): boolean => pathname.startsWith('/api/');

const builtinOriginSet: ReadonlySet<string> = new Set(BACKEND_API_ORIGINS);

let configuredOrigins: readonly string[] | null = null;

const normalizeOriginList = (origins: readonly string[]): string[] => {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const origin of origins) {
    const trimmed = origin.trim().replace(/\/+$/, '');
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next;
};

export function setBackendApiFallbackOrigins(origins: readonly string[] | null): void {
  if (!origins || origins.length === 0) {
    configuredOrigins = null;
    return;
  }
  const next = normalizeOriginList(origins);
  configuredOrigins = next.length > 0 ? next : null;
}

export function getBackendApiFallbackOrigins(): readonly string[] {
  return configuredOrigins ?? BACKEND_API_ORIGINS;
}

const resolveFallbackChain = (origins?: readonly string[]): readonly string[] => {
  if (origins && origins.length > 0) {
    return normalizeOriginList(origins);
  }
  return configuredOrigins ?? BACKEND_API_ORIGINS;
};

const shouldRewriteToPreferredChain = (origin: string, chain: readonly string[]): boolean =>
  configuredOrigins != null && (builtinOriginSet.has(origin) || chain.includes(origin));

export const buildBackendApiCandidateUrls = (url: string, origins?: readonly string[]): string[] => {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    return [];
  }

  try {
    const parsed = new URL(normalizedUrl);
    if (!isBackendApiPath(parsed.pathname)) {
      return [parsed.toString()];
    }

    const suffix = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const candidates: string[] = [];
    const seen = new Set<string>();
    const pushOrigin = (origin: string) => {
      const next = new URL(suffix, origin).toString();
      if (seen.has(next)) {
        return;
      }
      seen.add(next);
      candidates.push(next);
    };

    const chain = resolveFallbackChain(origins);
    if (origins == null && shouldRewriteToPreferredChain(parsed.origin, chain)) {
      for (const origin of chain) {
        pushOrigin(origin);
      }
    } else {
      pushOrigin(parsed.origin);
      for (const origin of chain) {
        pushOrigin(origin);
      }
    }
    return candidates;
  } catch {
    return [normalizedUrl];
  }
};

export async function fetchBackendApiWithFallback(
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  url: string,
  init?: RequestInit,
  options?: FetchBackendApiFallbackOptions,
): Promise<Response> {
  const candidates = buildBackendApiCandidateUrls(url, options?.origins);
  let lastError: unknown = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidateUrl = candidates[index]!;
    try {
      const controller = new AbortController();
      const sourceSignal = init?.signal;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;

      const handleAbort = () => {
        controller.abort(sourceSignal?.reason);
      };

      if (sourceSignal) {
        if (sourceSignal.aborted) {
          controller.abort(sourceSignal.reason);
        } else {
          sourceSignal.addEventListener('abort', handleAbort, { once: true });
        }
      }

      if ((options?.timeoutMs ?? 0) > 0) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, options!.timeoutMs);
      }

      let response: Response;
      try {
        response = await fetchImpl(candidateUrl, {
          ...init,
          signal: controller.signal,
        });
      } catch (error) {
        if (timedOut) {
          throw new Error(`后端请求超时(${options!.timeoutMs}ms): ${candidateUrl}`);
        }
        throw error;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        sourceSignal?.removeEventListener('abort', handleAbort);
      }

      if (response.ok || index === candidates.length - 1) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (index === candidates.length - 1) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('后端请求失败');
}
