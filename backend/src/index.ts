import { config } from './config';
import { logger } from './utils/logger';

const PORT = config.port;

async function start(): Promise<void> {
  logger.info('backend service starting', { port: PORT });

  // ...existing service bootstrap logic...

  logger.info('backend service started', { port: PORT });
}

start().catch((error: unknown) => {
  logger.error('backend service failed to start', { error });
  process.exit(1);
});
