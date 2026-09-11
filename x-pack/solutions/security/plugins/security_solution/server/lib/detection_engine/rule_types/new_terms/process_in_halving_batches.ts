/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isMaximumResponseSizeExceededError } from '@kbn/es-errors';

export interface ProcessBatchResult {
  /** Set to true to stop processing the remaining items. */
  stop: boolean;
}

export interface ProcessInHalvingBatchesArgs<TItem> {
  items: readonly TItem[];
  /** Processes one batch of items, typically by sending an Elasticsearch request for them. */
  processBatch: (batch: TItem[]) => Promise<ProcessBatchResult>;
  /** Invoked every time the batch size gets reduced after an oversized Elasticsearch response. */
  onBatchSizeReduced: (args: { from: number; to: number; error: Error }) => void;
}

/**
 * Processes items in batches starting with all items at once. When processing a batch fails because the
 * Elasticsearch response exceeded `elasticsearch.maxResponseSize`, the batch size gets halved and the
 * same items are retried with the reduced batch size. Any other error is rethrown. The reduced batch size
 * is kept for the remaining items.
 */
export const getBatchSizeReducedWarning = ({
  from,
  to,
  error,
}: {
  from: number;
  to: number;
  error: Error;
}): string =>
  `The new terms search response exceeded the "elasticsearch.maxResponseSize" limit, reducing the number of terms processed per request from ${from} to ${to} and retrying. Error: ${error.message}`;

export const processInHalvingBatches = async <TItem>({
  items,
  processBatch,
  onBatchSizeReduced,
}: ProcessInHalvingBatchesArgs<TItem>): Promise<void> => {
  let batchSize = items.length;
  let processedCount = 0;

  while (processedCount < items.length) {
    const batch = items.slice(processedCount, processedCount + batchSize);

    try {
      const { stop } = await processBatch(batch);

      if (stop) {
        return;
      }

      processedCount += batch.length;
    } catch (error) {
      if (!isMaximumResponseSizeExceededError(error) || batch.length <= 1) {
        throw error;
      }

      const reducedBatchSize = Math.floor(batch.length / 2);

      onBatchSizeReduced({ from: batch.length, to: reducedBatchSize, error });
      batchSize = reducedBatchSize;
    }
  }
};
