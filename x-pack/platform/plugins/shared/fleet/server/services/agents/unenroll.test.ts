/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { estypes } from '@elastic/elasticsearch';

import { AGENT_ACTIONS_INDEX, AGENT_ACTIONS_RESULTS_INDEX } from '../../../common';

import { HostedAgentPolicyRestrictionRelatedError } from '../../errors';
import { invalidateAPIKeys } from '../api_keys';

import { appContextService } from '../app_context';

import { createAppContextStartContractMock } from '../../mocks';

import { outputService } from '../output';

import type { Agent } from '../../types';

import { SO_SEARCH_LIMIT } from '../../constants';

import * as agentNamespaces from '../spaces/agent_namespaces';

import { unenrollAgent, unenrollAgents } from './unenroll';
import { invalidateAPIKeysForAgents, isAgentUnenrolled } from './unenroll_action_runner';
import { createClientMock } from './action.mock';
import * as crud from './crud';
import * as unenrollActionRunner from './unenroll_action_runner';

jest.mock('../api_keys');

const mockedInvalidateAPIKeys = invalidateAPIKeys as jest.MockedFunction<typeof invalidateAPIKeys>;

describe('unenroll', () => {
  beforeEach(async () => {
    const { soClient } = createClientMock();
    appContextService.start(
      createAppContextStartContractMock({}, false, {
        withoutSpaceExtensions: soClient,
      })
    );
  });

  afterEach(() => {
    appContextService.stop();
  });

  describe('unenrollAgent (singular)', () => {
    it('can unenroll from regular agent policy', async () => {
      const { soClient, esClient, agentInRegularDoc } = createClientMock();
      await unenrollAgent(soClient, esClient, agentInRegularDoc._id);

      // calls ES update with correct values
      expect(esClient.update).toBeCalledTimes(1);
      const calledWith = esClient.update.mock.calls[0];
      expect(calledWith[0]?.id).toBe(agentInRegularDoc._id);
      expect(calledWith[0] as estypes.UpdateRequest).toHaveProperty('doc.unenrollment_started_at');
    });

    it('cannot unenroll from hosted agent policy by default', async () => {
      const { soClient, esClient, agentInHostedDoc } = createClientMock();
      await expect(unenrollAgent(soClient, esClient, agentInHostedDoc._id)).rejects.toThrowError(
        HostedAgentPolicyRestrictionRelatedError
      );
      // does not call ES update
      expect(esClient.update).toBeCalledTimes(0);
    });

    it('cannot unenroll from hosted agent policy with revoke=true', async () => {
      const { soClient, esClient, agentInHostedDoc } = createClientMock();
      await expect(
        unenrollAgent(soClient, esClient, agentInHostedDoc._id, { revoke: true })
      ).rejects.toThrowError(HostedAgentPolicyRestrictionRelatedError);
      // does not call ES update
      expect(esClient.update).toBeCalledTimes(0);
    });

    it('can unenroll from hosted agent policy with force=true', async () => {
      const { soClient, esClient, agentInHostedDoc } = createClientMock();
      await unenrollAgent(soClient, esClient, agentInHostedDoc._id, { force: true });
      // calls ES update with correct values
      expect(esClient.update).toBeCalledTimes(1);
      const calledWith = esClient.update.mock.calls[0];
      expect(calledWith[0]?.id).toBe(agentInHostedDoc._id);
      expect(calledWith[0] as estypes.UpdateRequest).toHaveProperty('doc.unenrollment_started_at');
    });

    it('can unenroll from hosted agent policy with force=true and revoke=true', async () => {
      const { soClient, esClient, agentInHostedDoc } = createClientMock();
      await unenrollAgent(soClient, esClient, agentInHostedDoc._id, { force: true, revoke: true });
      // calls ES update with correct values
      expect(esClient.update).toBeCalledTimes(1);
      const calledWith = esClient.update.mock.calls[0];
      expect(calledWith[0]?.id).toBe(agentInHostedDoc._id);
      expect(calledWith[0] as estypes.UpdateRequest).toHaveProperty('doc.unenrolled_at');
    });
  });

  describe('unenrollAgents (plural)', () => {
    it('can unenroll from an regular agent policy', async () => {
      const { soClient, esClient, agentInRegularDoc, agentInRegularDoc2 } = createClientMock();
      const idsToUnenroll = [agentInRegularDoc._id, agentInRegularDoc2._id];
      await unenrollAgents(soClient, esClient, { agentIds: idsToUnenroll });

      // calls ES update with correct values
      const calledWith = esClient.bulk.mock.calls[0][0];
      const ids = (calledWith as estypes.BulkRequest)?.operations
        ?.filter((i: any) => i.update !== undefined)
        .map((i: any) => i.update._id);
      const docs = (calledWith as estypes.BulkRequest)?.operations
        ?.filter((i: any) => i.doc)
        .map((i: any) => i.doc);
      expect(ids).toEqual(idsToUnenroll);
      for (const doc of docs!) {
        expect(doc).toHaveProperty('unenrollment_started_at');
      }
    });
    it('cannot unenroll from a hosted agent policy by default', async () => {
      const { soClient, esClient, agentInHostedDoc, agentInRegularDoc, agentInRegularDoc2 } =
        createClientMock();

      const idsToUnenroll = [agentInRegularDoc._id, agentInHostedDoc._id, agentInRegularDoc2._id];
      await unenrollAgents(soClient, esClient, { agentIds: idsToUnenroll });

      // calls ES update with correct values
      const onlyRegular = [agentInRegularDoc._id, agentInRegularDoc2._id];
      const calledWith = esClient.bulk.mock.calls[0][0];
      const ids = (calledWith as estypes.BulkRequest)?.operations
        ?.filter((i: any) => i.update !== undefined)
        .map((i: any) => i.update._id);
      const docs = (calledWith as estypes.BulkRequest)?.operations
        ?.filter((i: any) => i.doc)
        .map((i: any) => i.doc);
      expect(ids).toEqual(onlyRegular);
      for (const doc of docs!) {
        expect(doc).toHaveProperty('unenrollment_started_at');
      }

      // hosted policy is updated in action results with error
      const calledWithActionResults = esClient.bulk.mock.calls[1][0] as estypes.BulkRequest;
      // bulk write two line per create
      expect(calledWithActionResults.operations?.length).toBe(2);
      const expectedObject = expect.objectContaining({
        '@timestamp': expect.anything(),
        action_id: expect.anything(),
        agent_id: 'agent-in-hosted-policy',
        error:
          'Cannot unenroll agent-in-hosted-policy from a hosted agent policy hosted-agent-policy in Fleet because the agent policy is managed by an external orchestration solution, such as Elastic Cloud, Kubernetes, etc. Please make changes using your orchestration solution.',
      });
      expect(calledWithActionResults.operations?.[1]).toEqual(expectedObject);
    });

    it('force unenroll updates in progress unenroll actions', async () => {
      const { soClient, esClient, agentInRegularDoc, agentInRegularDoc2 } = createClientMock();
      esClient.search.mockReset();

      esClient.search.mockImplementation(async (request) => {
        if (request?.index === AGENT_ACTIONS_INDEX) {
          return {
            hits: {
              hits: [
                {
                  _source: {
                    agents: ['agent-in-regular-policy'],
                    action_id: 'other-action',
                  },
                },
              ],
            },
          } as any;
        }

        if (request?.index === AGENT_ACTIONS_RESULTS_INDEX) {
          return {
            hits: {
              hits: [],
            },
          };
        }

        return { hits: { hits: [agentInRegularDoc, agentInRegularDoc2] } };
      });

      const idsToUnenroll = [agentInRegularDoc._id, agentInRegularDoc2._id];
      await unenrollAgents(soClient, esClient, {
        agentIds: idsToUnenroll,
        revoke: true,
      });

      expect(esClient.bulk.mock.calls.length).toEqual(3);
      const bulkBody = (esClient.bulk.mock.calls[2][0] as estypes.BulkRequest)
        ?.operations?.[1] as any;
      expect(bulkBody.agent_id).toEqual(agentInRegularDoc._id);
      expect(bulkBody.action_id).toEqual('other-action');
    });

    it('force unenroll should not update completed unenroll actions', async () => {
      const { soClient, esClient, agentInRegularDoc, agentInRegularDoc2 } = createClientMock();
      esClient.search.mockReset();
      esClient.search.mockImplementation(async (request) => {
        if (request?.index === AGENT_ACTIONS_INDEX) {
          return {
            hits: {
              hits: [
                {
                  _source: {
                    agents: ['agent-in-regular-policy'],
                    action_id: 'other-action1',
                  },
                },
              ],
            },
          } as any;
        }

        if (request?.index === AGENT_ACTIONS_RESULTS_INDEX) {
          return {
            hits: {
              hits: [
                { _source: { action_id: 'other-action1', agent_id: 'agent-in-regular-policy' } },
              ],
            },
          };
        }

        return { hits: { hits: [agentInRegularDoc, agentInRegularDoc2] } };
      });

      const idsToUnenroll = [agentInRegularDoc._id, agentInRegularDoc2._id];
      await unenrollAgents(soClient, esClient, {
        agentIds: idsToUnenroll,
        revoke: true,
      });

      // agent and force unenroll results updated, no other action results
      expect(esClient.bulk.mock.calls.length).toEqual(2);
    });

    it('cannot unenroll from a hosted agent policy with revoke=true', async () => {
      const { soClient, esClient, agentInHostedDoc, agentInRegularDoc, agentInRegularDoc2 } =
        createClientMock();

      const idsToUnenroll = [agentInRegularDoc._id, agentInHostedDoc._id, agentInRegularDoc2._id];

      const unenrolledResponse = await unenrollAgents(soClient, esClient, {
        agentIds: idsToUnenroll,
        revoke: true,
      });
      expect(unenrolledResponse.actionId).toBeDefined();

      // calls ES update with correct values
      const onlyRegular = [agentInRegularDoc._id, agentInRegularDoc2._id];
      const calledWith = esClient.bulk.mock.calls[0][0];
      const ids = (calledWith as estypes.BulkRequest)?.operations
        ?.filter((i: any) => i.update !== undefined)
        .map((i: any) => i.update._id);
      const docs = (calledWith as estypes.BulkRequest)?.operations
        ?.filter((i: any) => i.doc)
        .map((i: any) => i.doc);
      expect(ids).toEqual(onlyRegular);
      for (const doc of docs!) {
        expect(doc).toHaveProperty('unenrolled_at');
      }

      const errorResults = esClient.bulk.mock.calls[2][0];
      const errorIds = (errorResults as estypes.BulkRequest)?.operations
        ?.filter((i: any) => i.agent_id)
        .map((i: any) => i.agent_id);
      expect(errorIds).toEqual([agentInHostedDoc._id]);

      const actionResults = esClient.bulk.mock.calls[1][0];
      const resultIds = (actionResults as estypes.BulkRequest)?.operations
        ?.filter((i: any) => i.agent_id)
        .map((i: any) => i.agent_id);
      expect(resultIds).toEqual(onlyRegular);

      const action = esClient.create.mock.calls[0][0] as any;
      expect(action.document.type).toEqual('FORCE_UNENROLL');
    });

    it('can unenroll from hosted agent policy with force=true', async () => {
      const { soClient, esClient, agentInHostedDoc, agentInRegularDoc, agentInRegularDoc2 } =
        createClientMock();
      const idsToUnenroll = [agentInRegularDoc._id, agentInHostedDoc._id, agentInRegularDoc2._id];
      await unenrollAgents(soClient, esClient, { agentIds: idsToUnenroll, force: true });

      // calls ES update with correct values
      const calledWith = esClient.bulk.mock.calls[0][0];
      const ids = (calledWith as estypes.BulkRequest)?.operations
        ?.filter((i: any) => i.update !== undefined)
        .map((i: any) => i.update._id);
      const docs = (calledWith as estypes.BulkRequest)?.operations
        ?.filter((i: any) => i.doc)
        .map((i: any) => i.doc);
      expect(ids).toEqual(idsToUnenroll);
      for (const doc of docs!) {
        expect(doc).toHaveProperty('unenrollment_started_at');
      }
    });

    it('can unenroll from hosted agent policy with force=true and revoke=true', async () => {
      const { soClient, esClient, agentInHostedDoc, agentInRegularDoc, agentInRegularDoc2 } =
        createClientMock();

      const idsToUnenroll = [agentInRegularDoc._id, agentInHostedDoc._id, agentInRegularDoc2._id];

      const unenrolledResponse = await unenrollAgents(soClient, esClient, {
        agentIds: idsToUnenroll,
        revoke: true,
        force: true,
      });

      expect(unenrolledResponse.actionId).toBeDefined();

      // calls ES update with correct values
      const calledWith = esClient.bulk.mock.calls[0][0];
      const ids = (calledWith as estypes.BulkRequest)?.operations
        ?.filter((i: any) => i.update !== undefined)
        .map((i: any) => i.update._id);
      const docs = (calledWith as estypes.BulkRequest)?.operations
        ?.filter((i: any) => i.doc)
        .map((i: any) => i.doc);
      expect(ids).toEqual(idsToUnenroll);
      for (const doc of docs!) {
        expect(doc).toHaveProperty('unenrolled_at');
      }

      const actionResults = esClient.bulk.mock.calls[1][0];
      const resultIds = (actionResults as estypes.BulkRequest)?.operations
        ?.filter((i: any) => i.agent_id)
        .map((i: any) => i.agent_id);
      expect(resultIds).toEqual(idsToUnenroll);

      const action = esClient.create.mock.calls[0][0] as any;
      expect(action.document.type).toEqual('FORCE_UNENROLL');
    });
  });

  describe('invalidateAPIKeysForAgents', () => {
    let mockOutputServiceGet: jest.SpyInstance;

    beforeEach(() => {
      mockedInvalidateAPIKeys.mockReset();
      mockOutputServiceGet = jest
        .spyOn(outputService, 'get')
        .mockResolvedValue({ type: 'elasticsearch' } as any);
    });

    afterEach(() => {
      mockOutputServiceGet.mockRestore();
    });

    it('revoke all the agents API keys', async () => {
      await invalidateAPIKeysForAgents([
        {
          id: 'agent1',
          default_api_key_id: 'defaultApiKey1',
          access_api_key_id: 'accessApiKey1',
          default_api_key_history: [
            {
              id: 'defaultApiKeyHistory1',
            },
            {
              id: 'defaultApiKeyHistory2',
            },
          ],
          outputs: {
            output1: {
              api_key_id: 'outputApiKey1',
              to_retire_api_key_ids: [{ id: 'outputApiKeyRetire1' }, { id: 'outputApiKeyRetire2' }],
            },
            output2: {
              api_key_id: 'outputApiKey2',
            },
            output3: {
              api_key_id: 'outputApiKey3',
              to_retire_api_key_ids: [
                // Somes Fleet Server agents don't have an id here (probably a bug)
                { retired_at: 'foo' },
              ],
            },
          },
        } as any,
      ]);

      expect(mockedInvalidateAPIKeys).toBeCalledTimes(1);
      expect(mockedInvalidateAPIKeys).toBeCalledWith([
        'accessApiKey1',
        'defaultApiKey1',
        'defaultApiKeyHistory1',
        'defaultApiKeyHistory2',
        'outputApiKey1',
        'outputApiKeyRetire1',
        'outputApiKeyRetire2',
        'outputApiKey2',
        'outputApiKey3',
      ]);
    });

    it('excludes remote output keys from invalidateAPIKeys', async () => {
      mockOutputServiceGet.mockImplementation(async (id: string) => {
        if (id === 'remoteOutput1') return { type: 'remote_elasticsearch' } as any;
        return { type: 'elasticsearch' } as any;
      });

      await invalidateAPIKeysForAgents([
        {
          id: 'agent1',
          access_api_key_id: 'accessApiKey1',
          outputs: {
            localOutput1: {
              api_key_id: 'localOutputApiKey1',
            },
            remoteOutput1: {
              api_key_id: 'remoteApiKey1',
              to_retire_api_key_ids: [{ id: 'remoteRetireKey1' }],
            },
          },
        } as any,
      ]);

      expect(mockedInvalidateAPIKeys).toBeCalledWith(['accessApiKey1', 'localOutputApiKey1']);
    });

    it('treats output as local when outputService.get throws', async () => {
      mockOutputServiceGet.mockRejectedValue(new Error('output not found'));

      await invalidateAPIKeysForAgents([
        {
          id: 'agent1',
          outputs: {
            output1: { api_key_id: 'outputApiKey1' },
          },
        } as any,
      ]);

      expect(mockedInvalidateAPIKeys).toBeCalledWith(['outputApiKey1']);
    });
  });

  describe('isAgentUnenrolled', () => {
    it('should return true if revoke and unenrolled_at set', () => {
      expect(isAgentUnenrolled({ unenrolled_at: '2022-09-21' } as Agent, true)).toBe(true);
    });

    it('should return false if revoke and unenrolled_at null', () => {
      expect(
        isAgentUnenrolled(
          { unenrolled_at: null, unenrollment_started_at: '2022-09-21' } as any,
          true
        )
      ).toBe(false);
    });

    it('should return true if unenrolled_at set', () => {
      expect(isAgentUnenrolled({ unenrolled_at: '2022-09-21' } as Agent)).toBe(true);
    });

    it('should return true if unenrollment_started_at set and unenrolled_at null', () => {
      expect(
        isAgentUnenrolled({ unenrolled_at: null, unenrollment_started_at: '2022-09-21' } as any)
      ).toBe(true);
    });

    it('should return false if unenrollment_started_at null and unenrolled_at null', () => {
      expect(isAgentUnenrolled({ unenrolled_at: null, unenrollment_started_at: null } as any)).toBe(
        false
      );
    });
  });
});

describe('unenrollAgents kuery construction', () => {
  let mockGetAgentsByKuery: jest.SpyInstance;
  let mockAgentsKueryNamespaceFilter: jest.SpyInstance;

  beforeEach(async () => {
    const { soClient } = createClientMock();
    appContextService.start(
      createAppContextStartContractMock({}, false, {
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
  });

  afterEach(() => {
    mockGetAgentsByKuery.mockRestore();
    mockAgentsKueryNamespaceFilter.mockRestore();
    appContextService.stop();
  });

  it('wraps namespace filter and kuery containing OR in parentheses', async () => {
    const { soClient, esClient } = createClientMock();
    const kuery = 'status:online or status:error or status:offline';

    await unenrollAgents(soClient, esClient, { kuery });

    expect(mockGetAgentsByKuery).toHaveBeenCalledWith(
      esClient,
      soClient,
      expect.objectContaining({
        kuery: `(namespaces:custom_space) AND (${kuery})`,
      })
    );
  });
});

describe('unenrollAgents kuery path — cheap count and sync/async branching', () => {
  let mockGetAgentsByKuery: jest.SpyInstance;
  let mockOpenPointInTime: jest.SpyInstance;
  let mockUnenrollBatch: jest.SpyInstance;
  let mockUnenrollActionRunner: jest.SpyInstance;

  beforeEach(async () => {
    const { soClient } = createClientMock();
    appContextService.start(
      createAppContextStartContractMock({}, false, {
        withoutSpaceExtensions: soClient,
      })
    );
    mockGetAgentsByKuery = jest.spyOn(crud, 'getAgentsByKuery');
    mockOpenPointInTime = jest.spyOn(crud, 'openPointInTime').mockResolvedValue('pit-id');
    mockUnenrollBatch = jest
      .spyOn(unenrollActionRunner, 'unenrollBatch')
      .mockResolvedValue({ actionId: 'test-action-id' });
    mockUnenrollActionRunner = jest
      .spyOn(unenrollActionRunner, 'UnenrollActionRunner')
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
    mockUnenrollBatch.mockRestore();
    mockUnenrollActionRunner.mockRestore();
    appContextService.stop();
  });

  it('uses perPage:0 for the initial count query', async () => {
    const { soClient, esClient } = createClientMock();
    mockGetAgentsByKuery.mockResolvedValue({ agents: [], total: 0, page: 1, perPage: 0 });

    await unenrollAgents(soClient, esClient, { kuery: 'status:online' });

    expect(mockGetAgentsByKuery).toHaveBeenNthCalledWith(
      1,
      esClient,
      soClient,
      expect.objectContaining({ perPage: 0 })
    );
  });

  it('runs inline and fetches agents when total <= batchSize', async () => {
    const { soClient, esClient } = createClientMock();
    const agents = [{ id: 'agent-1' } as any];
    mockGetAgentsByKuery
      .mockResolvedValueOnce({ agents: [], total: 5, page: 1, perPage: 0 }) // count
      .mockResolvedValueOnce({ agents, total: 5, page: 1, perPage: SO_SEARCH_LIMIT }); // fetch

    await unenrollAgents(soClient, esClient, { kuery: 'status:online' });

    expect(mockGetAgentsByKuery).toHaveBeenNthCalledWith(
      2,
      esClient,
      soClient,
      expect.objectContaining({ perPage: SO_SEARCH_LIMIT })
    );
    expect(mockUnenrollBatch).toHaveBeenCalledWith(soClient, esClient, agents, expect.anything());
    expect(mockUnenrollActionRunner).not.toHaveBeenCalled();
  });

  it('schedules async task and returns actionId immediately when total > batchSize', async () => {
    const { soClient, esClient } = createClientMock();
    const batchSize = 100;
    mockGetAgentsByKuery.mockResolvedValueOnce({ agents: [], total: 500, page: 1, perPage: 0 });

    const result = await unenrollAgents(soClient, esClient, {
      kuery: 'status:online',
      batchSize,
    });

    expect(result).toEqual({ actionId: 'async-action-id' });
    expect(mockGetAgentsByKuery).toHaveBeenCalledTimes(1);
    expect(mockUnenrollActionRunner).toHaveBeenCalledWith(
      esClient,
      soClient,
      expect.objectContaining({ batchSize, total: 500 }),
      expect.anything()
    );
    expect(mockUnenrollBatch).not.toHaveBeenCalled();
  });

  it('uses caller-supplied batchSize as the async threshold', async () => {
    const { soClient, esClient } = createClientMock();
    const batchSize = 50;
    mockGetAgentsByKuery.mockResolvedValueOnce({ agents: [], total: 60, page: 1, perPage: 0 });

    const result = await unenrollAgents(soClient, esClient, {
      kuery: 'status:online',
      batchSize,
    });

    expect(result).toEqual({ actionId: 'async-action-id' });
    expect(mockUnenrollActionRunner).toHaveBeenCalledWith(
      esClient,
      soClient,
      expect.objectContaining({ batchSize, total: 60 }),
      expect.anything()
    );
  });

  it('runs inline when total equals batchSize (boundary)', async () => {
    const { soClient, esClient } = createClientMock();
    const batchSize = 100;
    mockGetAgentsByKuery
      .mockResolvedValueOnce({ agents: [], total: 100, page: 1, perPage: 0 }) // count
      .mockResolvedValueOnce({ agents: [], total: 100, page: 1, perPage: batchSize }); // fetch

    await unenrollAgents(soClient, esClient, { kuery: 'status:online', batchSize });

    expect(mockUnenrollBatch).toHaveBeenCalled();
    expect(mockUnenrollActionRunner).not.toHaveBeenCalled();
  });
});
