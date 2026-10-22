/**
 * Cache warming job for preloading frequently accessed data.
 *
 * Periodically loads cache with commonly accessed endpoints to reduce
 * initial cache misses and improve user experience.
 */

import { CACHE_TTL_SECONDS } from './lib/cache-config';
import { CacheKeyBuilder } from './lib/cache-key-builder';
import { logger } from './lib/logger';
import { set } from './redis';

const warmData = {
  '/api/retirements': [
    { id: 1, amount: 100, entity: 'Company A' },
    { id: 2, amount: 250, entity: 'Company B' },
  ],
  '/api/stats': { totalRetired: 350, totalTransactions: 2 },
};

export const startWarmingJob = async () => {
  logger.info('Starting cache warming job');

  for (const [endpoint, data] of Object.entries(warmData)) {
    const cacheKey = CacheKeyBuilder.cacheWarming(endpoint);
    await set(cacheKey, data, CACHE_TTL_SECONDS.CACHE_WARMING_DEFAULT);
    logger.info('Cache warmed endpoint', { endpoint });
  }

  logger.info('Cache warming completed');

  setInterval(async () => {
    logger.debug('Running scheduled cache warming');
    for (const [endpoint, data] of Object.entries(warmData)) {
      const cacheKey = CacheKeyBuilder.cacheWarming(endpoint);
      await set(cacheKey, data, CACHE_TTL_SECONDS.CACHE_WARMING_DEFAULT);
    }
  }, CACHE_TTL_SECONDS.CACHE_WARMING_DEFAULT * 1000);
};
