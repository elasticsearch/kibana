/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { SIGNIFICANT_EVENTS_INVESTIGATION_AGENT_ID } from '../agents/investigation';
import { NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_ID } from '../agents/deductive_investigation';
import { runCortexOptimize } from './register_cortex';
import { optimizeCortex } from './optimize';

jest.mock('./optimize', () => ({
  createLlmProposeCortexEdits: jest.fn(() => jest.fn()),
  optimizeCortex: jest.fn(),
}));

jest.mock('./page_store', () => ({
  createCortexPageStore: jest.fn(() => ({})),
}));

describe('runCortexOptimize', () => {
  const esClient = { search: jest.fn() } as never;
  const request = { headers: {} } as never;
  const getInference = jest.fn().mockReturnValue({
    getClient: jest.fn().mockReturnValue({}),
  });
  const getSearchInferenceEndpoints = jest.fn().mockReturnValue({
    endpoints: {
      getForFeature: jest.fn().mockResolvedValue({
        endpoints: [{ connectorId: 'connector-1' }],
      }),
    },
  });

  const run = (agentId?: string) =>
    runCortexOptimize({
      request,
      agentId,
      userMessage: 'why?',
      assistantMessage: 'redis',
      esClient,
      getInference,
      getSearchInferenceEndpoints,
      logger: loggerMock.create(),
    });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs for the deductive investigation agent', async () => {
    await run(NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_ID);
    expect(optimizeCortex).toHaveBeenCalled();
  });

  it('skips the significant-events investigator, which does not write to Cortex', async () => {
    await run(SIGNIFICANT_EVENTS_INVESTIGATION_AGENT_ID);
    expect(optimizeCortex).not.toHaveBeenCalled();
  });

  it('runs when agent_id is omitted or empty', async () => {
    await run(undefined);
    await run('');
    expect(optimizeCortex).toHaveBeenCalledTimes(2);
  });

  it('skips a different agent', async () => {
    await run('some-other-agent');
    expect(optimizeCortex).not.toHaveBeenCalled();
  });
});
