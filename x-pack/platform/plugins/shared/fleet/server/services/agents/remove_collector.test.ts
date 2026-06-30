/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, savedObjectsClientMock } from '@kbn/core/server/mocks';

import type { Agent } from '../../types';

import * as apiKeys from '../api_keys';

import * as crud from './crud';
import * as actions from './actions';
import { CollectorRemovalError, removeCollector, removeCollectors } from './remove_collector';

jest.mock('./crud');
jest.mock('./actions');
jest.mock('../api_keys');
jest.mock('../spaces/get_current_namespace', () => ({
  getCurrentNamespace: () => 'default',
}));
jest.mock('../spaces/agent_namespaces', () => ({
  agentsKueryNamespaceFilter: jest.fn().mockResolvedValue(undefined),
  buildFilterWithNamespace: jest.fn((_filter, kuery) => kuery),
}));

const mockedCrud = crud as jest.Mocked<typeof crud>;
const mockedActions = actions as jest.Mocked<typeof actions>;
const mockedApiKeys = apiKeys as jest.Mocked<typeof apiKeys>;

const opampAgent: Agent = {
  id: 'opamp-1',
  type: 'OPAMP',
  active: true,
  enrolled_at: '2026-05-01T00:00:00Z',
  local_metadata: {},
  user_provided_metadata: {},
  packages: [],
  status: 'online',
  policy_id: 'opamp-policy',
} as unknown as Agent;

const fleetAgent: Agent = {
  id: 'fleet-1',
  type: 'PERMANENT',
  active: true,
  enrolled_at: '2026-05-01T00:00:00Z',
  local_metadata: {},
  user_provided_metadata: {},
  packages: [],
  status: 'online',
  policy_id: 'fleet-policy',
} as unknown as Agent;

describe('removeCollector', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;
  let soClient: ReturnType<typeof savedObjectsClientMock.create>;

  beforeEach(() => {
    jest.clearAllMocks();
    esClient = elasticsearchServiceMock.createElasticsearchClient();
    soClient = savedObjectsClientMock.create();
  });

  it('marks an OpAMP agent as unenrolled', async () => {
    mockedCrud.getAgentById.mockResolvedValue(opampAgent);

    await removeCollector(esClient, soClient, opampAgent.id);

    expect(mockedCrud.updateAgent).toHaveBeenCalledTimes(1);
    const [, agentId, data] = mockedCrud.updateAgent.mock.calls[0];
    expect(agentId).toBe(opampAgent.id);
    expect(data).toMatchObject({ active: false });
    expect(data.unenrolled_at).toBeDefined();
  });

  it('rejects non-OpAMP agents with CollectorRemovalError', async () => {
    mockedCrud.getAgentById.mockResolvedValue(fleetAgent);

    await expect(removeCollector(esClient, soClient, fleetAgent.id)).rejects.toBeInstanceOf(
      CollectorRemovalError
    );
    expect(mockedCrud.updateAgent).not.toHaveBeenCalled();
  });

  it('does not invalidate API keys', async () => {
    mockedCrud.getAgentById.mockResolvedValue(opampAgent);

    await removeCollector(esClient, soClient, opampAgent.id);

    expect(mockedApiKeys.invalidateAPIKeys).not.toHaveBeenCalled();
  });

  it('creates a REMOVE_COLLECTOR action document and result for the agent', async () => {
    mockedCrud.getAgentById.mockResolvedValue(opampAgent);

    await removeCollector(esClient, soClient, opampAgent.id);

    expect(mockedActions.createAgentAction).toHaveBeenCalledTimes(1);
    const actionCall = mockedActions.createAgentAction.mock.calls[0][2];
    expect(actionCall).toMatchObject({
      agents: [opampAgent.id],
      type: 'REMOVE_COLLECTOR',
      total: 1,
    });

    expect(mockedActions.bulkCreateAgentActionResults).toHaveBeenCalledTimes(1);
    const resultsCall = mockedActions.bulkCreateAgentActionResults.mock.calls[0][1];
    expect(resultsCall).toHaveLength(1);
    expect(resultsCall[0].agentId).toBe(opampAgent.id);
    expect(resultsCall[0].actionId).toBe(actionCall.id);
  });
});

describe('removeCollectors (bulk)', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;
  let soClient: ReturnType<typeof savedObjectsClientMock.create>;

  beforeEach(() => {
    jest.clearAllMocks();
    esClient = elasticsearchServiceMock.createElasticsearchClient();
    soClient = savedObjectsClientMock.create();
  });

  it('only updates OpAMP agents and skips non-OpAMP entries', async () => {
    mockedCrud.getAgents.mockResolvedValue([opampAgent, fleetAgent]);

    const result = await removeCollectors(esClient, soClient, {
      agentIds: [opampAgent.id, fleetAgent.id],
    });

    expect(result.actionId).toEqual(expect.any(String));
    expect(mockedCrud.bulkUpdateAgents).toHaveBeenCalledTimes(1);
    const [, updates] = mockedCrud.bulkUpdateAgents.mock.calls[0];
    expect(updates).toHaveLength(1);
    expect(updates[0].agentId).toBe(opampAgent.id);
    expect(updates[0].data).toMatchObject({ active: false });
  });

  it('does not invalidate API keys', async () => {
    mockedCrud.getAgents.mockResolvedValue([opampAgent]);

    await removeCollectors(esClient, soClient, { agentIds: [opampAgent.id] });

    expect(mockedApiKeys.invalidateAPIKeys).not.toHaveBeenCalled();
  });

  it('creates a REMOVE_COLLECTOR action document and results for all matched collectors', async () => {
    mockedCrud.getAgents.mockResolvedValue([opampAgent]);

    const result = await removeCollectors(esClient, soClient, { agentIds: [opampAgent.id] });

    expect(mockedActions.createAgentAction).toHaveBeenCalledTimes(1);
    const actionCall = mockedActions.createAgentAction.mock.calls[0][2];
    expect(actionCall).toMatchObject({
      agents: [opampAgent.id],
      type: 'REMOVE_COLLECTOR',
      total: 1,
    });
    expect(result.actionId).toBe(actionCall.id);

    expect(mockedActions.bulkCreateAgentActionResults).toHaveBeenCalledTimes(1);
    const resultsCall = mockedActions.bulkCreateAgentActionResults.mock.calls[0][1];
    expect(resultsCall).toHaveLength(1);
    expect(resultsCall[0].agentId).toBe(opampAgent.id);
    expect(resultsCall[0].actionId).toBe(actionCall.id);
  });

  it('handles kuery-based selection', async () => {
    mockedCrud.getAgentsByKuery.mockResolvedValue({
      agents: [opampAgent],
      total: 1,
      page: 1,
      perPage: 10000,
    } as any);

    const result = await removeCollectors(esClient, soClient, {
      kuery: 'agent.type:OPAMP',
    });

    expect(result.actionId).toEqual(expect.any(String));
    expect(mockedCrud.bulkUpdateAgents).toHaveBeenCalledTimes(1);
  });

  it('returns an actionId but does not create an action document when no OpAMP agents match', async () => {
    mockedCrud.getAgents.mockResolvedValue([fleetAgent]);

    const result = await removeCollectors(esClient, soClient, { agentIds: [fleetAgent.id] });

    expect(result.actionId).toEqual(expect.any(String));
    expect(mockedActions.createAgentAction).not.toHaveBeenCalled();
    expect(mockedActions.bulkCreateAgentActionResults).not.toHaveBeenCalled();
  });
});
