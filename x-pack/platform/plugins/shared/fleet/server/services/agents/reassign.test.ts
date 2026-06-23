/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { estypes } from '@elastic/elasticsearch';

import { HostedAgentPolicyRestrictionRelatedError } from '../../errors';

import { appContextService } from '../app_context';
import { createAppContextStartContractMock } from '../../mocks';
import { SO_SEARCH_LIMIT } from '../../constants';

import * as agentNamespaces from '../spaces/agent_namespaces';

import { reassignAgent, reassignAgents } from './reassign';
import { createClientMock } from './action.mock';
import * as crud from './crud';
import * as reassignActionRunner from './reassign_action_runner';

describe('reassignAgent', () => {
  let mocks: ReturnType<typeof createClientMock>;

  beforeEach(async () => {
    mocks = createClientMock();

    appContextService.start(
      createAppContextStartContractMock({}, false, {
        internal: mocks.soClient,
        withoutSpaceExtensions: mocks.soClient,
      })
    );
  });

  afterEach(() => {
    appContextService.stop();
  });
  describe('reassignAgent (singular)', () => {
    it('can reassign from regular agent policy to regular', async () => {
      const { soClient, esClient, agentInRegularDoc, regularAgentPolicySO } = mocks;
      await reassignAgent(soClient, esClient, agentInRegularDoc._id, regularAgentPolicySO.id);

      // calls ES update with correct values
      expect(esClient.update).toBeCalledTimes(1);
      const calledWith = esClient.update.mock.calls[0];
      expect(calledWith[0]?.id).toBe(agentInRegularDoc._id);
      expect((calledWith[0] as estypes.UpdateRequest)?.doc).toHaveProperty(
        'policy_id',
        regularAgentPolicySO.id
      );
    });

    it('cannot reassign from regular agent policy to hosted', async () => {
      const { soClient, esClient, agentInRegularDoc, hostedAgentPolicySO } = mocks;
      await expect(
        reassignAgent(soClient, esClient, agentInRegularDoc._id, hostedAgentPolicySO.id)
      ).rejects.toThrowError(HostedAgentPolicyRestrictionRelatedError);

      // does not call ES update
      expect(esClient.update).toBeCalledTimes(0);
    });

    it('cannot reassign from hosted agent policy', async () => {
      const { soClient, esClient, agentInHostedDoc, hostedAgentPolicySO, regularAgentPolicySO } =
        mocks;
      await expect(
        reassignAgent(soClient, esClient, agentInHostedDoc._id, regularAgentPolicySO.id)
      ).rejects.toThrowError(HostedAgentPolicyRestrictionRelatedError);
      // does not call ES update
      expect(esClient.update).toBeCalledTimes(0);

      await expect(
        reassignAgent(soClient, esClient, agentInHostedDoc._id, hostedAgentPolicySO.id)
      ).rejects.toThrowError(HostedAgentPolicyRestrictionRelatedError);
      // does not call ES update
      expect(esClient.update).toBeCalledTimes(0);
    });

    it('update namespaces with reassign', async () => {
      const { soClient, esClient, agentInRegularDoc, regularAgentPolicySO } = mocks;

      await reassignAgent(soClient, esClient, agentInRegularDoc._id, regularAgentPolicySO.id);

      // calls ES update with correct values
      expect(esClient.update).toBeCalledTimes(1);
      const calledWith = esClient.update.mock.calls[0];
      expect(calledWith[0]?.id).toBe(agentInRegularDoc._id);
      expect((calledWith[0] as estypes.UpdateRequest)?.doc).toHaveProperty('namespaces', [
        'space1',
      ]);
    });
  });

  describe('reassignAgents (plural)', () => {
    it('agents in hosted policies are not updated', async () => {
      const {
        soClient,
        esClient,
        agentInRegularDoc,
        agentInHostedDoc,
        agentInHostedDoc2,
        regularAgentPolicySO2,
      } = mocks;

      esClient.search.mockResponse({
        hits: {
          hits: [agentInRegularDoc, agentInHostedDoc, agentInHostedDoc2],
        },
      } as any);

      const idsToReassign = [agentInRegularDoc._id, agentInHostedDoc._id, agentInHostedDoc2._id];
      await reassignAgents(
        soClient,
        esClient,
        { agentIds: idsToReassign },
        regularAgentPolicySO2.id
      );

      // calls ES update with correct values
      const calledWith = esClient.bulk.mock.calls[0][0];
      // only 1 are regular and bulk write two line per update
      expect((calledWith as estypes.BulkRequest).operations?.length).toBe(2);
      // @ts-expect-error
      expect(calledWith.operations[0].update._id).toEqual(agentInRegularDoc._id);
      expect((calledWith.operations?.[1] as any)?.doc).toHaveProperty('namespaces', [
        'space1',
        'default',
      ]);

      // hosted policy is updated in action results with error
      const calledWithActionResults = esClient.bulk.mock.calls[1][0] as estypes.BulkRequest;
      // bulk write two line per create
      expect(calledWithActionResults.operations?.length).toBe(4);
      const expectedObject = expect.objectContaining({
        '@timestamp': expect.anything(),
        action_id: expect.anything(),
        agent_id: 'agent-in-hosted-policy',
        error:
          'Cannot reassign an agent from hosted agent policy hosted-agent-policy in Fleet because the agent policy is managed by an external orchestration solution, such as Elastic Cloud, Kubernetes, etc. Please make changes using your orchestration solution.',
      });
      expect(calledWithActionResults.operations?.[1]).toEqual(expectedObject);
    });

    it('should report errors from ES agent update call', async () => {
      const { soClient, esClient, agentInRegularDoc, regularAgentPolicySO2 } = mocks;

      esClient.bulk.mockResponse({
        items: [
          {
            update: {
              _id: agentInRegularDoc._id,
              error: new Error('version conflict'),
            },
          },
        ],
      } as any);
      const idsToReassign = [agentInRegularDoc._id];
      await reassignAgents(
        soClient,
        esClient,
        { agentIds: idsToReassign },
        regularAgentPolicySO2.id
      );

      const calledWithActionResults = esClient.bulk.mock.calls[1][0] as estypes.BulkRequest;
      const expectedObject = expect.objectContaining({
        '@timestamp': expect.anything(),
        action_id: expect.anything(),
        agent_id: agentInRegularDoc._id,
        error: 'version conflict',
      });
      expect(calledWithActionResults.operations?.[1]).toEqual(expectedObject);
    });
  });
});

describe('reassignAgents kuery construction', () => {
  let mockGetAgentsByKuery: jest.SpyInstance;
  let mockAgentsKueryNamespaceFilter: jest.SpyInstance;
  let mockReassignBatch: jest.SpyInstance;

  beforeEach(async () => {
    const { soClient } = createClientMock();
    appContextService.start(
      createAppContextStartContractMock({}, false, {
        internal: soClient,
        withoutSpaceExtensions: soClient,
      })
    );
    mockGetAgentsByKuery = jest.spyOn(crud, 'getAgentsByKuery').mockResolvedValue({
      agents: [],
      total: 0,
      page: 1,
      perPage: SO_SEARCH_LIMIT,
    });
    mockAgentsKueryNamespaceFilter = jest
      .spyOn(agentNamespaces, 'agentsKueryNamespaceFilter')
      .mockResolvedValue('namespaces:custom_space');
    mockReassignBatch = jest
      .spyOn(reassignActionRunner, 'reassignBatch')
      .mockResolvedValue({ actionId: 'test-action-id' });
  });

  afterEach(() => {
    mockGetAgentsByKuery.mockRestore();
    mockAgentsKueryNamespaceFilter.mockRestore();
    mockReassignBatch.mockRestore();
    appContextService.stop();
  });

  it('wraps namespace filter and kuery containing OR in parentheses', async () => {
    const { soClient, esClient, regularAgentPolicySO2 } = createClientMock();
    const kuery = 'status:online or status:error or status:offline';

    await reassignAgents(soClient, esClient, { kuery }, regularAgentPolicySO2.id);

    expect(mockGetAgentsByKuery).toHaveBeenCalledWith(
      esClient,
      soClient,
      expect.objectContaining({
        kuery: `(namespaces:custom_space) AND (${kuery})`,
      })
    );
  });
});

describe('reassignAgents kuery path — cheap count and sync/async branching', () => {
  let mockGetAgentsByKuery: jest.SpyInstance;
  let mockOpenPointInTime: jest.SpyInstance;
  let mockReassignBatch: jest.SpyInstance;
  let mockReassignActionRunner: jest.SpyInstance;

  beforeEach(async () => {
    const { soClient } = createClientMock();
    appContextService.start(
      createAppContextStartContractMock({}, false, {
        internal: soClient,
        withoutSpaceExtensions: soClient,
      })
    );
    mockGetAgentsByKuery = jest.spyOn(crud, 'getAgentsByKuery');
    mockOpenPointInTime = jest.spyOn(crud, 'openPointInTime').mockResolvedValue('pit-id');
    mockReassignBatch = jest
      .spyOn(reassignActionRunner, 'reassignBatch')
      .mockResolvedValue({ actionId: 'test-action-id' });
    mockReassignActionRunner = jest
      .spyOn(reassignActionRunner, 'ReassignActionRunner')
      .mockImplementation(
        () =>
          ({
            runActionAsyncTask: jest.fn().mockResolvedValue({ actionId: 'async-action-id' }),
          } as any)
      );
  });

  afterEach(() => {
    mockGetAgentsByKuery.mockRestore();
    mockOpenPointInTime.mockRestore();
    mockReassignBatch.mockRestore();
    mockReassignActionRunner.mockRestore();
    appContextService.stop();
  });

  it('uses perPage:0 for the initial count query', async () => {
    const { soClient, esClient, regularAgentPolicySO2 } = createClientMock();
    mockGetAgentsByKuery.mockResolvedValue({ agents: [], total: 0, page: 1, perPage: 0 });

    await reassignAgents(soClient, esClient, { kuery: 'status:online' }, regularAgentPolicySO2.id);

    expect(mockGetAgentsByKuery).toHaveBeenNthCalledWith(
      1,
      esClient,
      soClient,
      expect.objectContaining({ perPage: 0 })
    );
  });

  it('runs inline and fetches agents when total <= batchSize', async () => {
    const { soClient, esClient, regularAgentPolicySO2 } = createClientMock();
    const agents = [{ id: 'agent-1' } as any];
    mockGetAgentsByKuery
      .mockResolvedValueOnce({ agents: [], total: 5, page: 1, perPage: 0 }) // count
      .mockResolvedValueOnce({ agents, total: 5, page: 1, perPage: SO_SEARCH_LIMIT }); // fetch

    await reassignAgents(soClient, esClient, { kuery: 'status:online' }, regularAgentPolicySO2.id);

    // second call fetches up to batchSize docs
    expect(mockGetAgentsByKuery).toHaveBeenNthCalledWith(
      2,
      esClient,
      soClient,
      expect.objectContaining({ perPage: SO_SEARCH_LIMIT })
    );
    expect(mockReassignBatch).toHaveBeenCalledWith(
      esClient,
      expect.anything(),
      agents,
      expect.anything()
    );
    expect(mockReassignActionRunner).not.toHaveBeenCalled();
  });

  it('schedules async task and returns actionId immediately when total > batchSize', async () => {
    const { soClient, esClient, regularAgentPolicySO2 } = createClientMock();
    const batchSize = 100;
    mockGetAgentsByKuery.mockResolvedValueOnce({
      agents: [],
      total: 500,
      page: 1,
      perPage: 0,
    });

    const result = await reassignAgents(
      soClient,
      esClient,
      { kuery: 'status:online', batchSize },
      regularAgentPolicySO2.id
    );

    expect(result).toEqual({ actionId: 'async-action-id' });
    // only the count call — no second full-doc fetch
    expect(mockGetAgentsByKuery).toHaveBeenCalledTimes(1);
    expect(mockReassignActionRunner).toHaveBeenCalledWith(
      esClient,
      soClient,
      expect.objectContaining({ batchSize, total: 500 }),
      expect.anything()
    );
    expect(mockReassignBatch).not.toHaveBeenCalled();
  });

  it('uses caller-supplied batchSize as the async threshold', async () => {
    const { soClient, esClient, regularAgentPolicySO2 } = createClientMock();
    const batchSize = 50;
    // total (60) > batchSize (50) → async
    mockGetAgentsByKuery.mockResolvedValueOnce({ agents: [], total: 60, page: 1, perPage: 0 });

    const result = await reassignAgents(
      soClient,
      esClient,
      { kuery: 'status:online', batchSize },
      regularAgentPolicySO2.id
    );

    expect(result).toEqual({ actionId: 'async-action-id' });
    expect(mockReassignActionRunner).toHaveBeenCalledWith(
      esClient,
      soClient,
      expect.objectContaining({ batchSize, total: 60 }),
      expect.anything()
    );
  });

  it('runs inline when total equals batchSize (boundary)', async () => {
    const { soClient, esClient, regularAgentPolicySO2 } = createClientMock();
    const batchSize = 100;
    mockGetAgentsByKuery
      .mockResolvedValueOnce({ agents: [], total: 100, page: 1, perPage: 0 }) // count
      .mockResolvedValueOnce({ agents: [], total: 100, page: 1, perPage: batchSize }); // fetch

    await reassignAgents(
      soClient,
      esClient,
      { kuery: 'status:online', batchSize },
      regularAgentPolicySO2.id
    );

    expect(mockReassignBatch).toHaveBeenCalled();
    expect(mockReassignActionRunner).not.toHaveBeenCalled();
  });
});
