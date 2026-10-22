import { withRetry } from '@stellar-save/shared-utils';

import { emailRetryPolicy } from './lib/retry_policies';
import { logger } from './logger';

export class EmailService {
  async sendExportEmail(email: string, fileUrl: string): Promise<void> {
    logger.info(`[EmailService] Sending export download link to ${email}: ${fileUrl}`);
    await withRetry(async () => {
      // Dispatch export download email
    }, emailRetryPolicy);
  }
}
