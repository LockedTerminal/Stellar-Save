import type { RetryOptions } from '@stellar-save/shared-utils';

/**
 * Named retry policy for Soroban RPC operations.
 * Capped exponential backoff (initial 1000ms, max 10000ms, 3 attempts).
 */
export const rpcRetryPolicy: RetryOptions = {
  attempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: 0.1,
  isRetryable: (error: unknown) => {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('timeout') ||
        msg.includes('econnrefused') ||
        msg.includes('fetch failed') ||
        msg.includes('500') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504')
      );
    }
    return true;
  },
};

/**
 * Named retry policy for Stellar Horizon operations.
 * Capped exponential backoff (initial 500ms, max 5000ms, 3 attempts).
 */
export const horizonRetryPolicy: RetryOptions = {
  attempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitter: 0.1,
  isRetryable: (error: unknown) => {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('429') ||
        msg.includes('500') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('econnreset') ||
        msg.includes('fetch failed')
      );
    }
    return true;
  },
};

/**
 * Named retry policy for Webhook delivery operations.
 * Exponential backoff conforming to contract (initial 1000ms, max 300000ms, 5 attempts).
 */
export const webhookRetryPolicy: RetryOptions = {
  attempts: 5,
  initialDelayMs: 1000,
  maxDelayMs: 300000,
  backoffMultiplier: 2,
  jitter: 0.1,
  isRetryable: (_error: unknown) => {
    return true;
  },
};

/**
 * Named retry policy for transactional Email delivery (SendGrid).
 * Capped exponential backoff (initial 1000ms, max 5000ms, 3 attempts).
 */
export const emailRetryPolicy: RetryOptions = {
  attempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitter: 0.1,
  isRetryable: (error: unknown) => {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('template') && msg.includes('not found')) {
        return false;
      }
    }
    return true;
  },
};
