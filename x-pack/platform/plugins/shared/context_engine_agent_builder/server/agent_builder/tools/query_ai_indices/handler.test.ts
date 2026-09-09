/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { CONTEXT_ENGINE_READ_DENIED_MESSAGE } from '../ai_index_read_service';
import { createAiIndexToolDepsMock } from '../ai_index_read_service.mock';
import { queryAiIndicesHandler } from './handler';

describe('queryAiIndicesHandler', () => {
  const context = {
    esClient: elasticsearchServiceMock.createScopedClusterClient(),
    request: httpServerMock.createKibanaRequest(),
  };
  const columns = [{ name: 'title', type: 'keyword' }];
  const values = [['Runbook A']];

  it('passes the request through to the read service unchanged', async () => {
    const { deps, readService } = createAiIndexToolDepsMock();
    readService.query.mockResolvedValue({ columns, values });
    const request = {
      query: 'FROM ai-index-runbooks | WHERE type == ?kind | LIMIT 5',
      params: { kind: 'dashboard' },
      limit: 5,
    };

    const result = await queryAiIndicesHandler({ deps, request, context });

    expect(readService.query).toHaveBeenCalledWith(request);
    expect(result).toEqual({ columns, values });
  });

  it('fails closed without the read privilege', async () => {
    const { deps, readService } = createAiIndexToolDepsMock({ authorized: false });

    await expect(
      queryAiIndicesHandler({ deps, request: { query: 'FROM ai-index-*' }, context })
    ).rejects.toThrow(CONTEXT_ENGINE_READ_DENIED_MESSAGE);
    expect(readService.query).not.toHaveBeenCalled();
  });
});
