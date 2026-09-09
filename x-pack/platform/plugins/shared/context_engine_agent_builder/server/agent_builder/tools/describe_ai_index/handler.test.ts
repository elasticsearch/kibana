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
import { describeAiIndexHandler } from './handler';

describe('describeAiIndexHandler', () => {
  const context = {
    esClient: elasticsearchServiceMock.createScopedClusterClient(),
    request: httpServerMock.createKibanaRequest(),
  };

  it('returns the context block for the id', async () => {
    const { deps, readService } = createAiIndexToolDepsMock();
    readService.describe.mockResolvedValue({ response: '# AI index: runbooks' });

    await expect(describeAiIndexHandler({ deps, aiIndexId: 'runbooks', context })).resolves.toEqual(
      { response: '# AI index: runbooks' }
    );
    expect(readService.describe).toHaveBeenCalledWith('runbooks');
  });

  it('propagates a not-found error from the service', async () => {
    const { deps, readService } = createAiIndexToolDepsMock();
    readService.describe.mockRejectedValue(new Error("AI index 'missing' not found"));

    await expect(describeAiIndexHandler({ deps, aiIndexId: 'missing', context })).rejects.toThrow(
      "AI index 'missing' not found"
    );
  });

  it('fails closed without the read privilege', async () => {
    const { deps, readService } = createAiIndexToolDepsMock({ authorized: false });

    await expect(describeAiIndexHandler({ deps, aiIndexId: 'runbooks', context })).rejects.toThrow(
      CONTEXT_ENGINE_READ_DENIED_MESSAGE
    );
    expect(readService.describe).not.toHaveBeenCalled();
  });
});
