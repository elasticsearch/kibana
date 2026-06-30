/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createQueryService } from '../services/query_service/query_service.mock';
import { createEsqlResponse } from '../test_utils';
import { createExecutionContext } from '../execution_context';
import { ALERT_EVENTS_DATA_STREAM } from '../../resources/datastreams/alert_events';
import { fetchActiveAlertGroupHashes } from './fetch_active_alert_group_hashes';

describe('fetchActiveAlertGroupHashes', () => {
  function setup() {
    const { queryService, mockEsClient } = createQueryService();
    const executionContext = createExecutionContext(new AbortController().signal);
    return { queryService, mockEsClient, executionContext };
  }

  function mockEsqlGroupHashesResponse(
    mockEsClient: ReturnType<typeof setup>['mockEsClient'],
    groupHashes: string[]
  ) {
    mockEsClient.esql.query.mockResolvedValue(
      createEsqlResponse(
        [{ name: 'group_hash', type: 'keyword' }],
        groupHashes.map((h) => [h])
      )
    );
  }

  it('returns the parsed group hashes for the rule', async () => {
    const { queryService, mockEsClient, executionContext } = setup();
    mockEsqlGroupHashesResponse(mockEsClient, ['hash-1', 'hash-2', 'hash-3']);

    const result = await fetchActiveAlertGroupHashes(queryService, 'rule-1', executionContext);

    expect(result).toEqual([
      { group_hash: 'hash-1' },
      { group_hash: 'hash-2' },
      { group_hash: 'hash-3' },
    ]);
  });

  it('returns an empty array when no active groups exist', async () => {
    const { queryService, mockEsClient, executionContext } = setup();
    mockEsqlGroupHashesResponse(mockEsClient, []);

    const result = await fetchActiveAlertGroupHashes(queryService, 'rule-1', executionContext);

    expect(result).toEqual([]);
  });

  it('binds the ruleId as a named param and only keeps non-inactive episodes', async () => {
    const { queryService, mockEsClient, executionContext } = setup();
    mockEsqlGroupHashesResponse(mockEsClient, []);

    await fetchActiveAlertGroupHashes(queryService, 'rule-1', executionContext);

    expect(mockEsClient.esql.query).toHaveBeenCalledTimes(1);
    const [request] = mockEsClient.esql.query.mock.calls[0];

    expect(request.params).toEqual([{ ruleId: 'rule-1' }]);

    expect(request.query).toContain(`FROM ${ALERT_EVENTS_DATA_STREAM}`);
    expect(request.query).toContain('rule.id == ?ruleId');
    expect(request.query).toContain('episode.status IS NOT NULL');
    expect(request.query).toContain('last_episode_status IN ("pending", "active", "recovering")');
    expect(request.query).toContain('| KEEP group_hash');
  });

  it('forwards the executionContext abort signal to the ES client', async () => {
    const { queryService, mockEsClient } = setup();
    mockEsqlGroupHashesResponse(mockEsClient, []);

    const abortController = new AbortController();
    const executionContext = createExecutionContext(abortController.signal);

    await fetchActiveAlertGroupHashes(queryService, 'rule-1', executionContext);

    expect(mockEsClient.esql.query).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ signal: abortController.signal })
    );
  });

  it('propagates errors thrown by the query service', async () => {
    const { queryService, mockEsClient, executionContext } = setup();
    mockEsClient.esql.query.mockRejectedValue(new Error('boom'));

    await expect(
      fetchActiveAlertGroupHashes(queryService, 'rule-1', executionContext)
    ).rejects.toThrow('boom');
  });
});
