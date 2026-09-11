/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { errors as EsErrors } from '@elastic/elasticsearch';
import { loggerMock } from '@kbn/logging-mocks';
import { eventLogClientMock } from '@kbn/event-log-plugin/server/event_log_client.mock';
import { softDeleteGapsByQuery } from './soft_delete_gaps_by_query';

const okResponse = {
  updated: 3,
  version_conflicts: 0,
  failures: [],
} as estypes.UpdateByQueryResponse;

describe('softDeleteGapsByQuery', () => {
  const logger = loggerMock.create();
  const eventLogClient = eventLogClientMock.create();

  beforeEach(() => {
    jest.clearAllMocks();
    eventLogClient.softDeleteByQuery.mockResolvedValue(okResponse);
  });

  const getChunkRuleIds = (callIndex: number): string[] => {
    const params = eventLogClient.softDeleteByQuery.mock.calls[callIndex]?.[0];
    const query = params?.query as
      | { bool?: { must?: Array<{ terms?: Record<string, string[]> }> } }
      | undefined;
    const must = query?.bool?.must ?? [];
    return must[2]?.terms?.['rule.id'] ?? [];
  };

  test('calls softDeleteByQuery with the gap query and the gap.deleted field', async () => {
    await softDeleteGapsByQuery({
      ruleIds: ['rule-1', 'rule-2'],
      spaceId: 'default',
      eventLogClient,
      logger,
    });

    expect(eventLogClient.softDeleteByQuery).toHaveBeenCalledTimes(1);
    expect(eventLogClient.softDeleteByQuery).toHaveBeenCalledWith({
      field: 'kibana.alert.rule.gap.deleted',
      query: {
        bool: {
          must: [
            { term: { 'event.action': 'gap' } },
            { term: { 'event.provider': 'alerting' } },
            { terms: { 'rule.id': ['rule-1', 'rule-2'] } },
            { term: { 'kibana.space_ids': 'default' } },
          ],
          must_not: [{ term: { 'kibana.alert.rule.gap.deleted': true } }],
        },
      },
    });
  });

  test('chunks rule IDs at 10,000 per call', async () => {
    const ruleIds = Array.from({ length: 15_000 }, (_, i) => `rule-${i}`);

    await softDeleteGapsByQuery({ ruleIds, spaceId: 'default', eventLogClient, logger });

    expect(eventLogClient.softDeleteByQuery).toHaveBeenCalledTimes(2);
    expect(getChunkRuleIds(0)).toHaveLength(10_000);
    expect(getChunkRuleIds(1)).toHaveLength(5_000);
  });

  test('sends no call for an empty rule id list', async () => {
    await softDeleteGapsByQuery({ ruleIds: [], spaceId: 'default', eventLogClient, logger });

    expect(eventLogClient.softDeleteByQuery).not.toHaveBeenCalled();
  });

  test('logs an error and continues with the next chunk when a call throws', async () => {
    const ruleIds = Array.from({ length: 15_000 }, (_, i) => `rule-${i}`);
    eventLogClient.softDeleteByQuery
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(okResponse);

    await softDeleteGapsByQuery({ ruleIds, spaceId: 'default', eventLogClient, logger });

    expect(eventLogClient.softDeleteByQuery).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to soft delete gaps')
    );
  });

  // The callers wrap this helper in a try/catch, but they rely on it never
  // rejecting; pinning that keeps the contract explicit.
  test('resolves rather than rejecting when every chunk fails', async () => {
    eventLogClient.softDeleteByQuery.mockRejectedValue(new Error('boom'));

    await expect(
      softDeleteGapsByQuery({ ruleIds: ['rule-1'], spaceId: 'default', eventLogClient, logger })
    ).resolves.toBeUndefined();
  });

  // A client abort at `elasticsearch.requestTimeout` does not stop the
  // Elasticsearch task, so it must not be reported as a failure.
  test('warns instead of erroring when the client times out', async () => {
    eventLogClient.softDeleteByQuery.mockRejectedValueOnce(
      new EsErrors.TimeoutError('Request timed out')
    );

    await softDeleteGapsByQuery({
      ruleIds: ['rule-1'],
      spaceId: 'default',
      eventLogClient,
      logger,
    });

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('client timed out'));
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('logs a debug summary on the happy path', async () => {
    await softDeleteGapsByQuery({
      ruleIds: ['rule-1'],
      spaceId: 'default',
      eventLogClient,
      logger,
    });

    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('updated=3'));
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('bulk_retries=0'));
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('does not warn when the script skips documents as noops', async () => {
    eventLogClient.softDeleteByQuery.mockResolvedValue({
      total: 7,
      updated: 5,
      noops: 2,
      version_conflicts: 0,
      failures: [],
    } as estypes.UpdateByQueryResponse);

    await softDeleteGapsByQuery({
      ruleIds: ['rule-1'],
      spaceId: 'default',
      eventLogClient,
      logger,
    });

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('noops=2'));
  });

  test('warns when the response reports timed_out', async () => {
    eventLogClient.softDeleteByQuery.mockResolvedValue({
      updated: 1,
      timed_out: true,
      version_conflicts: 0,
      failures: [],
    } as estypes.UpdateByQueryResponse);

    await softDeleteGapsByQuery({
      ruleIds: ['rule-1'],
      spaceId: 'default',
      eventLogClient,
      logger,
    });

    expect(eventLogClient.softDeleteByQuery).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('timed_out=true'));
  });

  describe('version conflicts', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('retries the chunk once when the response reports version conflicts', async () => {
      eventLogClient.softDeleteByQuery
        .mockResolvedValueOnce({
          updated: 1,
          version_conflicts: 2,
          failures: [],
        } as estypes.UpdateByQueryResponse)
        .mockResolvedValueOnce(okResponse);

      const pending = softDeleteGapsByQuery({
        ruleIds: ['rule-1'],
        spaceId: 'default',
        eventLogClient,
        logger,
      });
      await jest.runAllTimersAsync();
      await pending;

      expect(eventLogClient.softDeleteByQuery).toHaveBeenCalledTimes(2);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('warns when conflicts remain after the retry', async () => {
      eventLogClient.softDeleteByQuery.mockResolvedValue({
        updated: 1,
        version_conflicts: 2,
        failures: [],
      } as estypes.UpdateByQueryResponse);

      const pending = softDeleteGapsByQuery({
        ruleIds: ['rule-1'],
        spaceId: 'default',
        eventLogClient,
        logger,
      });
      await jest.runAllTimersAsync();
      await pending;

      expect(eventLogClient.softDeleteByQuery).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('version_conflicts=2'));
    });

    test('does not retry a response that only reports failures', async () => {
      eventLogClient.softDeleteByQuery.mockResolvedValue({
        updated: 1,
        version_conflicts: 0,
        failures: [{ id: 'doc-1' }],
      } as unknown as estypes.UpdateByQueryResponse);

      const pending = softDeleteGapsByQuery({
        ruleIds: ['rule-1'],
        spaceId: 'default',
        eventLogClient,
        logger,
      });
      await jest.runAllTimersAsync();
      await pending;

      expect(eventLogClient.softDeleteByQuery).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('failures=1'));
    });
  });
});
