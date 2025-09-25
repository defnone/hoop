import { hc } from 'hono/client';
import type { AppType } from '@server/index';

export type RpcClient = ReturnType<typeof hc<AppType>>;

const SERVER_URL: string = import.meta.env.VITE_BACKEND_URL ?? '';

const withAuthRedirectFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const res = await fetch(input, { ...init, credentials: 'include' });

  if (res.status === 401 || res.status === 403) {
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (path !== '/login' && path !== '/sign-up') {
      window.location.href = '/login';
    }
  }
  return res;
};

/**
 * Shared RPC client configured for the Hono backend.
 * Uses `withAuthRedirectFetch` to keep session cookies and redirect to `/login` on 401/403.
 *
 * **Usage example**
 * ```ts
 * import { rpc } from '@/lib/rpc';
 *
 * const response = await rpc.api.auth.login.$post({ json: { email, password } });
 * const user = await response.json();
 * ```
 *
 * **Streaming example**
 * ```ts
 * const stream = await rpc.api.metrics.stream.$get();
 * for await (const chunk of stream.body) {
 *   // handle chunk
 * }
 * ```
 */
export const rpc: RpcClient = hc<AppType>(SERVER_URL, {
  fetch: withAuthRedirectFetch,
});
