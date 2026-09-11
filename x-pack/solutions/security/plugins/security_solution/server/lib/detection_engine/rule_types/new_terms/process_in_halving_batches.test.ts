/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { getBatchSizeReducedWarning, processInHalvingBatches } from './process_in_halving_batches';

const maxResponseSizeError = () =>
  new esErrors.RequestAbortedError(
    'The content length (104861688) is bigger than the maximum allowed string (104857600)'
  );

describe('processInHalvingBatches', () => {
  it('processes all items in a single batch when the response fits', async () => {
    const processBatch = jest.fn().mockResolvedValue({ stop: false });
    const onBatchSizeReduced = jest.fn();

    await processInHalvingBatches({
      items: ['a', 'b', 'c', 'd'],
      processBatch,
      onBatchSizeReduced,
    });

    expect(processBatch).toHaveBeenCalledTimes(1);
    expect(processBatch).toHaveBeenCalledWith(['a', 'b', 'c', 'd']);
    expect(onBatchSizeReduced).not.toHaveBeenCalled();
  });

  it('does nothing when there are no items', async () => {
    const processBatch = jest.fn().mockResolvedValue({ stop: false });

    await processInHalvingBatches({
      items: [],
      processBatch,
      onBatchSizeReduced: jest.fn(),
    });

    expect(processBatch).not.toHaveBeenCalled();
  });

  it('halves the batch and retries the same items when the response exceeds the limit', async () => {
    const error = maxResponseSizeError();
    const processBatch = jest.fn().mockRejectedValueOnce(error).mockResolvedValue({ stop: false });
    const onBatchSizeReduced = jest.fn();

    await processInHalvingBatches({
      items: ['a', 'b', 'c', 'd', 'e'],
      processBatch,
      onBatchSizeReduced,
    });

    expect(processBatch.mock.calls).toEqual([
      [['a', 'b', 'c', 'd', 'e']],
      [['a', 'b']],
      [['c', 'd']],
      [['e']],
    ]);
    expect(onBatchSizeReduced).toHaveBeenCalledTimes(1);
    expect(onBatchSizeReduced).toHaveBeenCalledWith({ from: 5, to: 2, error });
  });

  it('keeps halving until the batch fits', async () => {
    const processBatch = jest
      .fn()
      .mockRejectedValueOnce(maxResponseSizeError())
      .mockRejectedValueOnce(maxResponseSizeError())
      .mockRejectedValueOnce(maxResponseSizeError())
      .mockResolvedValue({ stop: false });
    const onBatchSizeReduced = jest.fn();

    await processInHalvingBatches({
      items: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      processBatch,
      onBatchSizeReduced,
    });

    expect(processBatch.mock.calls.map(([batch]) => batch)).toEqual([
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      ['a', 'b', 'c', 'd'],
      ['a', 'b'],
      ['a'],
      ['b'],
      ['c'],
      ['d'],
      ['e'],
      ['f'],
      ['g'],
      ['h'],
    ]);
    expect(onBatchSizeReduced.mock.calls.map(([{ from, to }]) => [from, to])).toEqual([
      [8, 4],
      [4, 2],
      [2, 1],
    ]);
  });

  it('rethrows the error when a single item still exceeds the limit', async () => {
    const error = maxResponseSizeError();
    const processBatch = jest.fn().mockRejectedValue(error);
    const onBatchSizeReduced = jest.fn();

    await expect(
      processInHalvingBatches({
        items: ['a', 'b'],
        processBatch,
        onBatchSizeReduced,
      })
    ).rejects.toBe(error);

    expect(processBatch.mock.calls).toEqual([[['a', 'b']], [['a']]]);
    expect(onBatchSizeReduced).toHaveBeenCalledTimes(1);
  });

  it('rethrows errors unrelated to the response size without retrying', async () => {
    const error = new Error('index_not_found_exception');
    const processBatch = jest.fn().mockRejectedValue(error);
    const onBatchSizeReduced = jest.fn();

    await expect(
      processInHalvingBatches({
        items: ['a', 'b', 'c'],
        processBatch,
        onBatchSizeReduced,
      })
    ).rejects.toBe(error);

    expect(processBatch).toHaveBeenCalledTimes(1);
    expect(onBatchSizeReduced).not.toHaveBeenCalled();
  });

  it('rethrows other request aborted errors without retrying', async () => {
    const error = new esErrors.RequestAbortedError('Request aborted');
    const processBatch = jest.fn().mockRejectedValue(error);

    await expect(
      processInHalvingBatches({
        items: ['a', 'b', 'c'],
        processBatch,
        onBatchSizeReduced: jest.fn(),
      })
    ).rejects.toBe(error);

    expect(processBatch).toHaveBeenCalledTimes(1);
  });

  it('stops processing the remaining items when a batch asks to stop', async () => {
    const processBatch = jest
      .fn()
      .mockRejectedValueOnce(maxResponseSizeError())
      .mockResolvedValueOnce({ stop: false })
      .mockResolvedValueOnce({ stop: true });

    await processInHalvingBatches({
      items: ['a', 'b', 'c', 'd', 'e', 'f'],
      processBatch,
      onBatchSizeReduced: jest.fn(),
    });

    expect(processBatch.mock.calls.map(([batch]) => batch)).toEqual([
      ['a', 'b', 'c', 'd', 'e', 'f'],
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });
});

describe('getBatchSizeReducedWarning', () => {
  it('mentions the limit, both batch sizes and the original error', () => {
    const warning = getBatchSizeReducedWarning({
      from: 500,
      to: 250,
      error: maxResponseSizeError(),
    });

    expect(warning).toContain('"elasticsearch.maxResponseSize"');
    expect(warning).toContain('from 500 to 250');
    expect(warning).toContain('The content length (104861688)');
  });
});
