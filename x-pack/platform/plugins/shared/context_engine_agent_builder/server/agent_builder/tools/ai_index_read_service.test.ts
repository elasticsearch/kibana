/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import {
  CONTEXT_ENGINE_READ_DENIED_MESSAGE,
  getCallerAiIndexDataReadService,
  getErrorMessage,
} from './ai_index_read_service';
import { createAiIndexToolDepsMock } from './ai_index_read_service.mock';

describe('getCallerAiIndexDataReadService', () => {
  const request = httpServerMock.createKibanaRequest();
  const esClient = elasticsearchServiceMock.createScopedClusterClient();

  it('builds the service from the caller-scoped client and request', async () => {
    const { deps, readService, getAiIndexDataReadService } = createAiIndexToolDepsMock();

    await expect(getCallerAiIndexDataReadService({ deps, esClient, request })).resolves.toBe(
      readService
    );

    expect(getAiIndexDataReadService).toHaveBeenCalledWith({
      esClient: esClient.asCurrentUser,
      request,
    });
  });

  it('fails closed when the caller lacks the read privilege', async () => {
    const { deps, getAiIndexDataReadService } = createAiIndexToolDepsMock({ authorized: false });

    await expect(getCallerAiIndexDataReadService({ deps, esClient, request })).rejects.toThrow(
      CONTEXT_ENGINE_READ_DENIED_MESSAGE
    );
    expect(getAiIndexDataReadService).not.toHaveBeenCalled();
  });

  it('fails closed when security is unavailable', async () => {
    const { deps } = createAiIndexToolDepsMock();

    await expect(
      getCallerAiIndexDataReadService({
        deps: { ...deps, getSecurityStart: async () => undefined },
        esClient,
        request,
      })
    ).rejects.toThrow(CONTEXT_ENGINE_READ_DENIED_MESSAGE);
  });
});

describe('getErrorMessage', () => {
  it('uses the message of an Error', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies anything else', () => {
    expect(getErrorMessage('plain')).toBe('plain');
  });
});
