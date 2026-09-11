/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { getReducedBatchSize } from './multi_terms_composite';

const maxResponseSizeError = () =>
  new esErrors.RequestAbortedError(
    'The content length (104861688) is bigger than the maximum allowed string (104857600)'
  );

const tooManyClausesError = () =>
  new Error(
    'search_phase_execution_exception: [query_shard_exception] Reason: failed to create query: Query contains too many nested clauses; maxClauseCount is set to 1024'
  );

describe('getReducedBatchSize', () => {
  describe('too many clauses errors', () => {
    it.each([
      [500, 250],
      [250, 125],
    ])('halves the batch size from %s to %s', (batchSize, expected) => {
      expect(getReducedBatchSize(tooManyClausesError(), batchSize)).toBe(expected);
    });

    it('stops retrying once the batch size reached 125', () => {
      expect(getReducedBatchSize(tooManyClausesError(), 125)).toBeUndefined();
    });
  });

  describe('oversized responses exceeding elasticsearch.maxResponseSize', () => {
    it.each([
      [500, 250],
      [125, 62],
      [3, 1],
      [2, 1],
    ])('halves the batch size from %s to %s', (batchSize, expected) => {
      expect(getReducedBatchSize(maxResponseSizeError(), batchSize)).toBe(expected);
    });

    it('stops retrying once the batch size reached a single term', () => {
      expect(getReducedBatchSize(maxResponseSizeError(), 1)).toBeUndefined();
    });
  });

  it('does not retry errors unrelated to the batch size', () => {
    expect(getReducedBatchSize(new Error('index_not_found_exception'), 500)).toBeUndefined();
    expect(
      getReducedBatchSize(new esErrors.RequestAbortedError('Request aborted'), 500)
    ).toBeUndefined();
    expect(getReducedBatchSize('not an error', 500)).toBeUndefined();
  });
});
