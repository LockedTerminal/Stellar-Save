import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  requestId: string;
  traceId: string;
  spanId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

const REQUEST_ID_HEADER = 'x-request-id';
const TRACE_ID_HEADER = 'x-trace-id';
const SPAN_ID_HEADER = 'x-span-id';

function normalizeId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Accept only safe, bounded identifiers to avoid header injection / log forging.
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(trimmed)) return undefined;
  return trimmed;
}

function generateId(): string {
  return randomUUID().replace(/-/g, '');
}

/**
 * Returns the request context for the current async execution, if any.
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Runs `fn` within the given request context. Useful for background work that
 * should inherit correlation IDs from the originating request.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Express middleware that generates or accepts a request ID and trace context,
 * stores it in async context, and echoes the IDs back on the response.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId =
    normalizeId(req.headers[REQUEST_ID_HEADER]) ?? generateId();
  const traceId =
    normalizeId(req.headers[TRACE_ID_HEADER]) ?? generateId();
  const spanId = normalizeId(req.headers[SPAN_ID_HEADER]) ?? generateId().slice(0, 16);

  const context: RequestContext = { requestId, traceId, spanId };

  res.setHeader(REQUEST_ID_HEADER, requestId);
  res.setHeader(TRACE_ID_HEADER, traceId);

  storage.run(context, () => next());
}

export const correlationHeaders = {
  requestId: REQUEST_ID_HEADER,
  traceId: TRACE_ID_HEADER,
  spanId: SPAN_ID_HEADER,
} as const;

/**
 * Builds propagation headers for outgoing calls (Soroban RPC, Horizon, webhooks).
 */
export function buildPropagationHeaders(
  context: RequestContext | undefined = getRequestContext(),
): Record<string, string> {
  if (!context) return {};
  return {
    [REQUEST_ID_HEADER]: context.requestId,
    [TRACE_ID_HEADER]: context.traceId,
    [SPAN_ID_HEADER]: context.spanId,
  };
}
