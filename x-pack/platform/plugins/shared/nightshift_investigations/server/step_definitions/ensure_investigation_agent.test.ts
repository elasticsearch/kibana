/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { installInvestigationAgent } from '../lib/install_investigation_agent';
import { installDeductiveInvestigationAgent } from '../lib/install_deductive_investigation_agent';
import { SIGNIFICANT_EVENTS_INVESTIGATION_AGENT_ID } from '../agents/investigation';
import { NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_ID } from '../agents/deductive_investigation';
import { ensureInvestigationAgentStepDefinition } from './ensure_investigation_agent';

jest.mock('../lib/install_investigation_agent', () => ({
  installInvestigationAgent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/install_deductive_investigation_agent', () => ({
  installDeductiveInvestigationAgent: jest.fn().mockResolvedValue(undefined),
}));

describe('ensureInvestigationAgentStepDefinition', () => {
  const callKibanaApi = jest.fn().mockResolvedValue(undefined);
  const agentBuilder = { agents: { ensure: jest.fn() } } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    callKibanaApi.mockResolvedValue(undefined);
  });

  const createContext = (input: Record<string, unknown>) =>
    ({
      input,
      rawInput: input,
      contextManager: {
        getContext: jest.fn().mockReturnValue({ workflow: { spaceId: 'space-1' } }),
        getFakeRequest: jest.fn(),
        getScopedEsClient: jest.fn(),
        renderInputTemplate: jest.fn((val) => val),
        callKibanaApi,
      },
      logger: loggerMock.create(),
      abortSignal: new AbortController().signal,
      stepId: 'ensure_investigation_agent',
      stepType: 'nightshift.ensureInvestigationAgent',
    } as never);

  const run = (input: Record<string, unknown>) =>
    ensureInvestigationAgentStepDefinition(() => agentBuilder).handler(createContext(input));

  // A step that omits `with` never reaches the input schema, so the default has to hold for `{}`.
  it('installs the significant-events investigator when no agent is requested', async () => {
    const result = await run({});

    expect(installInvestigationAgent).toHaveBeenCalledWith({ agentBuilder, spaceId: 'space-1' });
    expect(installDeductiveInvestigationAgent).not.toHaveBeenCalled();
    expect(callKibanaApi).toHaveBeenCalledWith({
      method: 'GET',
      path: `/api/agent_builder/agents/${SIGNIFICANT_EVENTS_INVESTIGATION_AGENT_ID}`,
    });
    expect(result).toEqual({
      output: { space_id: 'space-1', agent_id: SIGNIFICANT_EVENTS_INVESTIGATION_AGENT_ID },
    });
  });

  it('installs the deductive investigator when it is requested', async () => {
    const result = await run({ agent_id: NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_ID });

    expect(installDeductiveInvestigationAgent).toHaveBeenCalledWith({
      agentBuilder,
      spaceId: 'space-1',
    });
    expect(installInvestigationAgent).not.toHaveBeenCalled();
    expect(callKibanaApi).toHaveBeenCalledWith({
      method: 'GET',
      path: `/api/agent_builder/agents/${NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_ID}`,
    });
    expect(result).toEqual({
      output: { space_id: 'space-1', agent_id: NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_ID },
    });
  });
});
