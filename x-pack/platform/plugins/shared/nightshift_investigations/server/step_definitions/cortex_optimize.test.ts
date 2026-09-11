/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { runCortexOptimize } from '../cortex/register_cortex';
import { cortexOptimizeStepDefinition } from './cortex_optimize';

jest.mock('../cortex/register_cortex', () => ({
  runCortexOptimize: jest.fn(),
}));

describe('cortexOptimizeStepDefinition', () => {
  const esClient = { search: jest.fn() };
  const request = { headers: {} };
  const getScopedEsClient = jest.fn().mockReturnValue(esClient);
  const getFakeRequest = jest.fn().mockReturnValue(request);
  const getInference = jest.fn();
  const getSearchInferenceEndpoints = jest.fn();

  const createContext = (input: { prompt: string; response: string; agent_id?: string }) =>
    ({
      input,
      rawInput: input,
      contextManager: {
        getContext: jest.fn(),
        getFakeRequest,
        getScopedEsClient,
        renderInputTemplate: jest.fn((val) => val),
        callKibanaApi: jest.fn(),
      },
      logger: loggerMock.create(),
      abortSignal: new AbortController().signal,
      stepId: 'optimize_cortex',
      stepType: 'nightshift.cortexOptimize',
    } as never);

  it('optimizes with the request-scoped ES client', async () => {
    const definition = cortexOptimizeStepDefinition({
      getInference,
      getSearchInferenceEndpoints,
      logger: loggerMock.create(),
    });

    const result = await definition.handler(
      createContext({
        prompt: 'why is checkout slow?',
        response: 'Redis evictions.',
        agent_id: 'significant-events.investigation',
      })
    );

    expect(runCortexOptimize).toHaveBeenCalledWith({
      request,
      agentId: 'significant-events.investigation',
      userMessage: 'why is checkout slow?',
      assistantMessage: 'Redis evictions.',
      esClient,
      getInference,
      getSearchInferenceEndpoints,
      logger: expect.anything(),
    });
    expect(result).toEqual({ output: { status: 'ok' } });
  });
});
