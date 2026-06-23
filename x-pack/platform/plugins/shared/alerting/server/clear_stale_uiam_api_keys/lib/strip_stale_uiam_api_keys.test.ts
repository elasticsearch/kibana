/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import { RULE_SAVED_OBJECT_TYPE } from '../../saved_objects';
import { stripStaleUiamApiKeysFromRules } from './strip_stale_uiam_api_keys';

describe('stripStaleUiamApiKeysFromRules', () => {
  const logger = loggingSystemMock.createLogger();

  beforeEach(() => jest.clearAllMocks());

  it('issues a scoped update_by_query against the alerting/cases index', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    const updateByQuery = esClient.updateByQuery as unknown as jest.Mock;
    updateByQuery.mockResolvedValue({ updated: 2, version_conflicts: 0, noops: 8, total: 10 });

    const result = await stripStaleUiamApiKeysFromRules(
      esClient as unknown as ElasticsearchClient,
      logger
    );

    expect(result).toEqual({ updated: 2, versionConflicts: 0, noops: 8, total: 10 });
    expect(updateByQuery).toHaveBeenCalledTimes(1);
    const arg = updateByQuery.mock.calls[0][0];
    expect(arg.index).toBe(ALERTING_CASES_SAVED_OBJECT_INDEX);
    expect(arg.refresh).toBe(true);
    expect(arg.conflicts).toBe('proceed');
    expect(arg.query).toEqual({
      bool: { filter: [{ term: { type: RULE_SAVED_OBJECT_TYPE } }] },
    });
    expect(arg.script.lang).toBe('painless');
  });

  it("only rewrites docs whose alert.apiKeyCreatedByUser === true, has both keys; otherwise sets ctx.op = 'noop'", async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    (esClient.updateByQuery as unknown as jest.Mock).mockResolvedValue({});

    await stripStaleUiamApiKeysFromRules(esClient as unknown as ElasticsearchClient, logger);

    const script = (esClient.updateByQuery as unknown as jest.Mock).mock.calls[0][0].script.source;
    expect(script).toContain('ctx._source.alert.apiKeyCreatedByUser == true');
    expect(script).toContain('ctx._source.alert.uiamApiKey != null');
    expect(script).toContain('ctx._source.alert.apiKey != null');
    expect(script).toContain("ctx._source.alert.remove('uiamApiKey')");
    expect(script).toContain("ctx.op = 'noop'");
  });

  it('defaults missing response counters to zero', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    (esClient.updateByQuery as unknown as jest.Mock).mockResolvedValue({});

    const result = await stripStaleUiamApiKeysFromRules(
      esClient as unknown as ElasticsearchClient,
      logger
    );

    expect(result).toEqual({ updated: 0, versionConflicts: 0, noops: 0, total: 0 });
  });

  it('logs and rethrows when update_by_query throws', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    (esClient.updateByQuery as unknown as jest.Mock).mockRejectedValue(new Error('es down'));

    await expect(
      stripStaleUiamApiKeysFromRules(esClient as unknown as ElasticsearchClient, logger)
    ).rejects.toThrow('es down');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to strip stale uiamApiKey from rules: es down'),
      expect.any(Object)
    );
  });
});
