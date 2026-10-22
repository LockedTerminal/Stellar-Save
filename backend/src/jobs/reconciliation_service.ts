import { Redis } from 'ioredis';
import { logger } from '../utils/logger';
import { metrics } from '../metrics';

/**
 * Common background-job abstraction.
 *
 * Every scheduled unit of work is described by a `Job` and executed by the
 * shared `JobRunner`, which provides distributed locking (via Redis) and a
 * single failure/retry/reporting path.
 */
export interface Job {
  /** Unique, stable job name used for locking and metrics. */
  name: string;
  /** Interval in milliseconds between runs. */
  schedule: number;
  /** The work to perform. */
  run: () => Promise<void>;
}

export interface JobRunnerOptions {
  redis: Redis;
  /** Lock TTL in milliseconds. Defaults to 5 minutes. */
  lockTtlMs?: number;
  /** Max attempts per run (including the first). Defaults to 3. */
  maxAttempts?: number;
  /** Base backoff in milliseconds between retries. Defaults to 1000. */
  retryBackoffMs?: number;
}

const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BACKOFF_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs registered jobs on their schedules, guaranteeing that at most one
 * instance executes a given job at a time via a Redis lock.
 */
export class JobRunner {
  private readonly redis: Redis;
  private readonly lockTtlMs: number;
  private readonly maxAttempts: number;
  private readonly retryBackoffMs: number;
  private readonly jobs = new Map<string, Job>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private started = false;

  constructor(options: JobRunnerOptions) {
    this.redis = options.redis;
    this.lockTtlMs = options.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryBackoffMs = options.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
  }

  register(job: Job): void {
    if (this.jobs.has(job.name)) {
      throw new Error(`Job already registered: ${job.name}`);
    }
    this.jobs.set(job.name, job);
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    for (const job of this.jobs.values()) {
      const timer = setInterval(() => {
        void this.execute(job);
      }, job.schedule);
      this.timers.set(job.name, timer);
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.started = false;
  }

  /**
   * Execute a job once, guarded by a distributed lock and wrapped in the
   * common retry/failure-reporting path. Exposed for tests and manual runs.
   */
  async execute(job: Job): Promise<void> {
    const lockKey = `job:lock:${job.name}`;
    const lockValue = `${process.pid}:${Date.now()}:${Math.random()}`;
    const acquired = await this.redis.set(lockKey, lockValue, 'PX', this.lockTtlMs, 'NX');

    if (acquired !== 'OK') {
      logger.debug(`Job ${job.name} skipped: lock held by another instance`);
      return;
    }

    try {
      await this.runWithRetry(job);
    } finally {
      await this.releaseLock(lockKey, lockValue);
    }
  }

  private async runWithRetry(job: Job): Promise<void> {
    let attempt = 0;
    while (attempt < this.maxAttempts) {
      attempt += 1;
      try {
        await job.run();
        metrics.recordJobSuccess(job.name);
        logger.info(`Job ${job.name} succeeded`);
        return;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (attempt >= this.maxAttempts) {
          metrics.recordJobFailure(job.name);
          logger.error(`Job ${job.name} failed after ${attempt} attempt(s)`, {
            error: err.message,
          });
          return;
        }
        logger.warn(`Job ${job.name} attempt ${attempt} failed, retrying`, {
          error: err.message,
        });
        await sleep(this.retryBackoffMs * attempt);
      }
    }
  }

  private async releaseLock(lockKey: string, lockValue: string): Promise<void> {
    // Only release the lock if we still own it.
    const script =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    try {
      await this.redis.eval(script, 1, lockKey, lockValue);
    } catch (error) {
      logger.warn(`Failed to release lock ${lockKey}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Reconciliation job migrated onto the shared runner.
 */
export function createReconciliationJob(
  reconcile: () => Promise<void>,
  scheduleMs: number,
): Job {
  return {
    name: 'reconciliation',
    schedule: scheduleMs,
    run: reconcile,
  };
}
