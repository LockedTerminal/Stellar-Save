/**
 * Backwards-compatible re-export.
 *
 * The structured logger implementation now lives in `src/lib/logger.ts`
 * (see issue #40). This shim keeps existing `import { logger } from './logger'`
 * call sites working; new code should import from `./lib/logger`.
 *
 * Request correlation (issue #1889): the logger automatically attaches the
 * current request ID and trace ID from async context to every log line.
 * Use `runWithRequestContext` / `getRequestContext` to populate that context
 * from middleware, and `getPropagationHeaders` to forward it on outgoing calls.
 */
export * from './lib/logger';
export { logger as default } from './lib/logger';

import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId: string;
  traceId: string;
  spanId?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run `fn` with the given request correlation context bound to async storage.
 * Every log line emitted within `fn` (and its async descendants) will include
 * the request ID and trace ID.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStorage.run(context, fn);
}

/** Returns the request correlation context for the current async scope, if any. */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Build the propagation headers (request ID + W3C traceparent) for outgoing
 * Soroban RPC, Horizon, and webhook calls so correlation flows across services.
 */
export function getPropagationHeaders(
  context: RequestContext | undefined = getRequestContext(),
): Record<string, string> {
  if (!context) {
    return {};
  }

  const headers: Record<string, string> = {
    'x-request-id': context.requestId,
  };

  if (context.traceId) {
    const spanId = context.spanId ?? context.traceId.slice(0, 16);
    headers['traceparent'] = `00-${context.traceId}-${spanId}-01`;
  }

  return headers;
}
