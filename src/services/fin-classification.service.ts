// Classification is now handled directly by finTransactionService.categorize()
// This file is kept for backwards compatibility but delegates to the main service.

import { finTransactionService } from './fin-transaction.service';

export const finClassificationService = {
  async classify(transactionIds: string[], categoryId: string, eventId?: string) {
    return finTransactionService.categorize(transactionIds, categoryId, eventId);
  },
};
