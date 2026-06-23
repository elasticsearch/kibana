/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';

import { appContextService } from '../app_context';
import type { Agent } from '../../types';
import { createAppContextStartContractMock } from '../../mocks';

import { SO_SEARCH_LIMIT } from '../../constants';

import * as agentNamespaces from '../spaces/agent_namespaces';

import { sendUpgradeAgentsActions } from './upgrade';
import { createClientMock } from './action.mock';
import { getRollingUpgradeOptions, upgradeBatch } from './upgrade_action_runner';
import * as upgradeActionRunner from './upgrade_action_runner';
import * as crud from './crud';

jest.mock('./versions', () => {
  return {
    getAvailableVersions: jest
      .fn()
      .mockResolvedValue(['8.4.0', '8.5.0', '8.6.0', '8.7.0', '8.8.0']),
    getLatestAvailableAgentVersion: jest.fn().mockResolvedValue('8.8.0'),
  };
});

jest.mock('./action_status', () => {
  return {
    getCancelledActions: jest.fn().mockResolvedValue([
      {
        actionId: 'cancelled-action',
      },
    ]),
  };
});

describe('sendUpgradeAgentsActions (plural)', () => {
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
  it('can upgrade from an regular agent policy', async () => {
    const { soClient, esClient, agentInRegularDoc, agentInRegularDoc2 } = mocks;
    const idsToAction = [agentInRegularDoc._id, agentInRegularDoc2._id];
    await sendUpgradeAgentsActions(soClient, esClient, { agentIds: idsToAction, version: '8.5.0' });

    // calls ES update with correct values
    const calledWith = esClient.bulk.mock.calls[0][0];
    const ids = (calledWith as estypes.BulkRequest)?.operations
      ?.filter((i: any) => i.update !== undefined)
      .map((i: any) => i.update._id);
    const docs = (calledWith as estypes.BulkRequest)?.operations
      ?.filter((i: any) => i.doc)
      .map((i: any) => i.doc);

    expect(ids).toEqual(idsToAction);
    for (const doc of docs!) {
      expect(doc).toHaveProperty('upgrade_started_at');
      expect(doc.upgraded_at).toEqual(null);
    }
  });
  it('cannot upgrade from a hosted agent policy by default', async () => {
    const { soClient, esClient, agentInHostedDoc, agentInRegularDoc, agentInRegularDoc2 } = mocks;

    const idsToAction = [agentInRegularDoc._id, agentInHostedDoc._id, agentInRegularDoc2._id];
    await sendUpgradeAgentsActions(soClient, esClient, { agentIds: idsToAction, version: '8.5.0' });

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
      expect(doc).toHaveProperty('upgrade_started_at');
      expect(doc.upgraded_at).toEqual(null);
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
        'Cannot upgrade agent in hosted agent policy hosted-agent-policy in Fleet because the agent policy is managed by an external orchestration solution, such as Elastic Cloud, Kubernetes, etc. Please make changes using your orchestration solution.',
    });
    expect(calledWithActionResults.operations?.[1]).toEqual(expectedObject);
  });

  it('can upgrade from hosted agent policy with force=true', async () => {
    const { soClient, esClient, agentInHostedDoc, agentInRegularDoc, agentInRegularDoc2 } = mocks;

    const idsToAction = [agentInRegularDoc._id, agentInHostedDoc._id, agentInRegularDoc2._id];
    await sendUpgradeAgentsActions(soClient, esClient, {
      agentIds: idsToAction,
      force: true,
      version: '8.5.0',
    });

    // calls ES update with correct values
    const calledWith = esClient.bulk.mock.calls[0][0];
    const ids = (calledWith as estypes.BulkRequest)?.operations
      ?.filter((i: any) => i.update !== undefined)
      .map((i: any) => i.update._id);
    const docs = (calledWith as estypes.BulkRequest)?.operations
      ?.filter((i: any) => i.doc)
      .map((i: any) => i.doc);
    expect(ids).toEqual(idsToAction);
    for (const doc of docs!) {
      expect(doc).toHaveProperty('upgrade_started_at');
      expect(doc.upgraded_at).toEqual(null);
    }
  });

  it('skip upgrade if action id is cancelled', async () => {
    const { esClient, agentInRegularDoc } = mocks;
    const agents = [{ id: agentInRegularDoc._id } as Agent];
    await upgradeBatch(esClient, agents, {}, {
      actionId: 'cancelled-action',
    } as any);
  });
});

describe('getRollingUpgradeOptions', () => {
  it('should 1 month expiration for 1h duration', () => {
    const options = getRollingUpgradeOptions('2023-01-06T00:00:00Z', 3600);
    expect(options).toEqual({
      expiration: '2023-02-05T00:00:00.000Z',
      minimum_execution_duration: 3600,
      rollout_duration_seconds: 3600,
      start_time: '2023-01-06T00:00:00Z',
    });
  });

  it('should set a very long expiration (1 month) for no duration', () => {
    const options = getRollingUpgradeOptions('2023-01-06T00:00:00Z');
    expect(options).toEqual({
      expiration: '2023-02-05T00:00:00.000Z',
      minimum_execution_duration: 7200,
      start_time: '2023-01-06T00:00:00Z',
    });
  });

  it('should return empty options for no start time, no duration', () => {
    const options = getRollingUpgradeOptions();
    expect(options).toEqual({});
  });
});

describe('sendUpgradeAgentsActions kuery construction', () => {
  let upgradeMocks: ReturnType<typeof createClientMock>;
  let mockGetAgentsByKuery: jest.SpyInstance;
  let mockAgentsKueryNamespaceFilter: jest.SpyInstance;

  beforeEach(async () => {
    upgradeMocks = createClientMock();
    appContextService.start(
      createAppContextStartContractMock({}, false, {
        internal: upgradeMocks.soClient,
        withoutSpaceExtensions: upgradeMocks.soClient,
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
    const { soClient, esClient } = upgradeMocks;
    const kuery = 'status:online or status:error or status:offline';

    await sendUpgradeAgentsActions(soClient, esClient, { kuery, version: '8.5.0' });

    expect(mockGetAgentsByKuery).toHaveBeenCalledWith(
      esClient,
      soClient,
      expect.objectContaining({
        kuery: `(namespaces:custom_space) AND (${kuery})`,
      })
    );
  });
});

describe('sendUpgradeAgentsActions kuery path — cheap count and sync/async branching', () => {
  let upgradeMocks: ReturnType<typeof createClientMock>;
  let mockGetAgentsByKuery: jest.SpyInstance;
  let mockOpenPointInTime: jest.SpyInstance;
  let mockUpgradeBatch: jest.SpyInstance;
  let mockUpgradeActionRunner: jest.SpyInstance;

  beforeEach(async () => {
    upgradeMocks = createClientMock();
    appContextService.start(
      createAppContextStartContractMock({}, false, {
        internal: upgradeMocks.soClient,
        withoutSpaceExtensions: upgradeMocks.soClient,
      })
    );
    mockGetAgentsByKuery = jest.spyOn(crud, 'getAgentsByKuery');
    mockOpenPointInTime = jest.spyOn(crud, 'openPointInTime').mockResolvedValue('pit-id');
    mockUpgradeBatch = jest
      .spyOn(upgradeActionRunner, 'upgradeBatch')
      .mockResolvedValue({ actionId: 'test-action-id' });
    mockUpgradeActionRunner = jest
      .spyOn(upgradeActionRunner, 'UpgradeActionRunner')
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
    mockUpgradeBatch.mockRestore();
    mockUpgradeActionRunner.mockRestore();
    appContextService.stop();
  });

  it('uses perPage:0 for the initial count query', async () => {
    const { soClient, esClient } = upgradeMocks;
    mockGetAgentsByKuery.mockResolvedValue({ agents: [], total: 0, page: 1, perPage: 0 });

    await sendUpgradeAgentsActions(soClient, esClient, {
      kuery: 'status:online',
      version: '8.5.0',
    });

    expect(mockGetAgentsByKuery).toHaveBeenNthCalledWith(
      1,
      esClient,
      soClient,
      expect.objectContaining({ perPage: 0 })
    );
  });

  it('runs inline and fetches agents when total <= batchSize', async () => {
    const { soClient, esClient } = upgradeMocks;
    const agents = [{ id: 'agent-1' } as any];
    mockGetAgentsByKuery
      .mockResolvedValueOnce({ agents: [], total: 5, page: 1, perPage: 0 }) // count
      .mockResolvedValueOnce({ agents, total: 5, page: 1, perPage: SO_SEARCH_LIMIT }); // fetch

    await sendUpgradeAgentsActions(soClient, esClient, {
      kuery: 'status:online',
      version: '8.5.0',
    });

    expect(mockGetAgentsByKuery).toHaveBeenNthCalledWith(
      2,
      esClient,
      soClient,
      expect.objectContaining({ perPage: SO_SEARCH_LIMIT })
    );
    expect(mockUpgradeBatch).toHaveBeenCalledWith(
      esClient,
      agents,
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(mockUpgradeActionRunner).not.toHaveBeenCalled();
  });

  it('schedules async task and returns actionId immediately when total > batchSize', async () => {
    const { soClient, esClient } = upgradeMocks;
    const batchSize = 100;
    mockGetAgentsByKuery.mockResolvedValueOnce({ agents: [], total: 500, page: 1, perPage: 0 });

    const result = await sendUpgradeAgentsActions(soClient, esClient, {
      kuery: 'status:online',
      version: '8.5.0',
      batchSize,
    });

    expect(result).toEqual({ actionId: 'async-action-id' });
    expect(mockGetAgentsByKuery).toHaveBeenCalledTimes(1);
    expect(mockUpgradeActionRunner).toHaveBeenCalledWith(
      esClient,
      soClient,
      expect.objectContaining({ batchSize, total: 500 }),
      expect.anything()
    );
    expect(mockUpgradeBatch).not.toHaveBeenCalled();
  });

  it('runs inline when total equals batchSize (boundary)', async () => {
    const { soClient, esClient } = upgradeMocks;
    const batchSize = 100;
    mockGetAgentsByKuery
      .mockResolvedValueOnce({ agents: [], total: 100, page: 1, perPage: 0 }) // count
      .mockResolvedValueOnce({ agents: [], total: 100, page: 1, perPage: batchSize }); // fetch

    await sendUpgradeAgentsActions(soClient, esClient, {
      kuery: 'status:online',
      version: '8.5.0',
      batchSize,
    });

    expect(mockUpgradeBatch).toHaveBeenCalled();
    expect(mockUpgradeActionRunner).not.toHaveBeenCalled();
  });
});
