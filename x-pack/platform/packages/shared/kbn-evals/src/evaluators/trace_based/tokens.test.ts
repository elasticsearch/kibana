/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { createCachedTokensEvaluator } from './tokens';

const VALID_TRACE_ID = '0af7651916cd43dd8448eb211c80319c';

const COLUMNS = [
  { name: 'cached_tokens', type: 'long' },
  { name: 'input_tokens', type: 'long' },
];

describe('createCachedTokensEvaluator', () => {
  let mockEsClient: jest.Mocked<EsClient>;
  let mockLog: jest.Mocked<ToolingLog>;

  const evaluate = () =>
    createCachedTokensEvaluator({ traceEsClient: mockEsClient, log: mockLog }).evaluate({
      input: {},
      output: { traceId: VALID_TRACE_ID },
      expected: {},
      metadata: {},
    });

  const mockResponse = (values: Array<Array<number | null>>) =>
    (mockEsClient.esql.query as jest.Mock).mockResolvedValue({ columns: COLUMNS, values });

  beforeEach(() => {
    jest.useFakeTimers();
    mockEsClient = { esql: { query: jest.fn() } } as any;
    mockLog = {
      error: jest.fn(),
      warning: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the summed cached tokens when the provider reports them', async () => {
    mockResponse([[120, 4000]]);

    const result = await evaluate();

    expect(result.score).toBe(120);
    expect(mockEsClient.esql.query as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('scores a reported cache miss as 0', async () => {
    mockResponse([[0, 4000]]);

    const result = await evaluate();

    expect(result.score).toBe(0);
    expect(result.label).toBeUndefined();
    expect(mockEsClient.esql.query as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('reports no score without retrying when the provider never reports cached tokens', async () => {
    mockResponse([[null, 4000]]);

    const result = await evaluate();

    expect(result.score).toBeNull();
    expect(result.label).toBe('unavailable');
    expect(mockEsClient.esql.query as jest.Mock).toHaveBeenCalledTimes(1);
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(mockLog.warning).not.toHaveBeenCalled();
  });

  it('retries when the trace has no token data at all', async () => {
    const query = mockEsClient.esql.query as jest.Mock;
    query
      .mockResolvedValueOnce({ columns: COLUMNS, values: [[null, null]] })
      .mockResolvedValueOnce({ columns: COLUMNS, values: [[50, 4000]] });

    const promise = evaluate();
    await jest.advanceTimersByTimeAsync(60_000);
    const result = await promise;

    expect(result.score).toBe(50);
    expect(query).toHaveBeenCalledTimes(2);
  });

  describe('when the cache_read column is missing from the mapping', () => {
    const unknownColumnError = () =>
      new Error(
        'verification_exception\n\tRoot causes:\n\t\tverification_exception: Found 1 problem\n' +
          'line 1:79: Unknown column [attributes.gen_ai.usage.cache_read.input_tokens], ' +
          'did you mean [attributes.gen_ai.usage.input_tokens]?'
      );

    const INPUT_ONLY_COLUMNS = [{ name: 'input_tokens', type: 'long' }];

    it('reports no score once the probe shows the trace is otherwise complete', async () => {
      const query = mockEsClient.esql.query as jest.Mock;
      query
        .mockRejectedValueOnce(unknownColumnError())
        .mockResolvedValueOnce({ columns: INPUT_ONLY_COLUMNS, values: [[4000]] });

      const result = await evaluate();

      expect(result.score).toBeNull();
      expect(result.label).toBe('unavailable');
      expect(query).toHaveBeenCalledTimes(2);
      expect(mockLog.error).not.toHaveBeenCalled();
      expect(mockLog.warning).not.toHaveBeenCalled();
    });

    it('retries instead when the probe shows the trace has not been indexed yet', async () => {
      const query = mockEsClient.esql.query as jest.Mock;
      query
        .mockRejectedValueOnce(unknownColumnError())
        .mockResolvedValueOnce({ columns: INPUT_ONLY_COLUMNS, values: [[null]] })
        .mockResolvedValueOnce({ columns: COLUMNS, values: [[75, 4000]] });

      const promise = evaluate();
      await jest.advanceTimersByTimeAsync(60_000);
      const result = await promise;

      expect(result.score).toBe(75);
      expect(query).toHaveBeenCalledTimes(3);
    });

    it('keeps an unknown column that is not cache_read a hard failure', async () => {
      const query = mockEsClient.esql.query as jest.Mock;
      query.mockRejectedValue(new Error('verification_exception: Unknown column [typo_column]'));

      const promise = evaluate();
      await jest.advanceTimersByTimeAsync(600_000);
      const result = await promise;

      expect(result.label).toBe('error');
      // Only the main query runs (8 retries + initial attempt); the probe is
      // never reached for an unrelated column.
      expect(query).toHaveBeenCalledTimes(9);
      expect(mockLog.error).toHaveBeenCalled();
    });
  });
});
