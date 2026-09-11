/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { hydrateCortexWorkspace } from '../cortex/register_cortex';
import { cortexHydrateStepDefinition } from './cortex_hydrate';

jest.mock('../cortex/register_cortex', () => ({
  hydrateCortexWorkspace: jest.fn().mockResolvedValue(undefined),
}));

describe('cortexHydrateStepDefinition', () => {
  const esClient = { search: jest.fn() };
  const apiClient = { writeFiles: jest.fn(), mkdirs: jest.fn() };
  const getScopedEsClient = jest.fn().mockReturnValue(esClient);

  beforeEach(() => {
    jest.clearAllMocks();
    getScopedEsClient.mockReturnValue(esClient);
  });

  const createContext = (conversationId: string) =>
    ({
      input: { conversation_id: conversationId },
      rawInput: { conversation_id: conversationId },
      contextManager: {
        getContext: jest.fn(),
        getFakeRequest: jest.fn(),
        getScopedEsClient,
        renderInputTemplate: jest.fn((val) => val),
        callKibanaApi: jest.fn(),
      },
      logger: loggerMock.create(),
      abortSignal: new AbortController().signal,
      stepId: 'hydrate_cortex',
      stepType: 'nightshift.cortexHydrate',
    } as never);

  it('hydrates the sandbox with the request-scoped ES client', async () => {
    const definition = cortexHydrateStepDefinition({
      getConnectionManager: () => ({ apiClient } as never),
      logger: loggerMock.create(),
    });

    const result = await definition.handler(createContext('conv-1'));

    expect(hydrateCortexWorkspace).toHaveBeenCalledWith({
      apiClient,
      conversationId: 'conv-1',
      esClient,
      logger: expect.anything(),
    });
    expect(result).toEqual({ output: { conversation_id: 'conv-1' } });
  });

  it('throws when the sandbox is not configured', async () => {
    const definition = cortexHydrateStepDefinition({
      getConnectionManager: () => undefined,
      logger: loggerMock.create(),
    });

    await expect(definition.handler(createContext('conv-1'))).rejects.toThrow(
      /sandbox is not configured/
    );
    expect(hydrateCortexWorkspace).not.toHaveBeenCalled();
  });
});
