/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, savedObjectsClientMock } from '@kbn/core/server/mocks';

import { packagePolicyService } from '../package_policy';

import type { Agent } from '../../types';

import { FleetUnauthorizedError } from '../../errors';

import { SO_SEARCH_LIMIT } from '../../constants';

import { createAgentAction, createErrorActionResults } from './actions';
import { getAgentById } from './crud';
import {
  bulkChangeAgentsPrivilegeLevel,
  changeAgentPrivilegeLevel,
} from './change_privilege_level';
import { getAgents } from './crud';
import * as changePrivilegeRunner from './change_privilege_runner';

jest.mock('../package_policy');
jest.mock('./crud');
jest.mock('./actions');

jest.mock('./crud', () => {
  return {
    getAgents: jest.fn(),
    getAgentsByKuery: jest.fn(),
    openPointInTime: jest.fn(),
    getAgentById: jest.fn(),
  };
});

const mockedPackagePolicyService = packagePolicyService as jest.Mocked<typeof packagePolicyService>;
const mockedCreateAgentAction = createAgentAction as jest.MockedFunction<typeof createAgentAction>;
const mockedCreateErrorActionResults = createErrorActionResults as jest.MockedFunction<
  typeof createErrorActionResults
>;

const esClientMock = elasticsearchServiceMock.createInternalClient();
const soClientMock = savedObjectsClientMock.create();

describe('changeAgentPrivilegeLevel', () => {
  const agentId = 'agent-id';
  const policyId = 'policy-id';

  it('should throw an error if the agent does not exist', async () => {
    (getAgentById as jest.Mock).mockRejectedValue(new Error(`Agent ${agentId} does not exist`));
    await expect(
      changeAgentPrivilegeLevel(esClientMock, soClientMock, agentId, {})
    ).rejects.toThrowError(`Agent ${agentId} does not exist`);
  });

  it('should return early if the agent is already unprivileged', async () => {
    (getAgentById as jest.Mock).mockResolvedValue({
      local_metadata: { elastic: { agent: { unprivileged: true } } },
    } as any);
    const res = await changeAgentPrivilegeLevel(esClientMock, soClientMock, agentId, {});
    expect(res).toEqual({ message: 'Agent agent-id is already unprivileged' });
  });

  it('should throw an error if the agent is on an unsupported version', async () => {
    (getAgentById as jest.Mock).mockResolvedValue({
      agent: { version: '9.1.0' },
      policy_id: policyId,
    } as any);
    await expect(
      changeAgentPrivilegeLevel(esClientMock, soClientMock, agentId, {})
    ).rejects.toThrowError(
      'Cannot remove root privilege. Privilege level change is supported from version 9.3.0.'
    );
  });

  it('should throw an error if the agent needs root privilege', async () => {
    (getAgentById as jest.Mock).mockResolvedValue({
      id: 'agent-id',
      agent: { version: '9.3.0' },
      policy_id: policyId,
    } as any);
    mockedPackagePolicyService.findAllForAgentPolicy.mockResolvedValue([
      {
        id: 'package-1',
        package: { name: 'Package 1', requires_root: false },
      },
      {
        id: 'package-2',
        package: { name: 'Package 2', requires_root: true },
      },
    ] as any);

    await expect(
      changeAgentPrivilegeLevel(esClientMock, soClientMock, agentId, {})
    ).rejects.toThrowError(
      `Agent agent-id is on policy ${policyId}, which contains integrations that require root privilege: Package 2`
    );
  });

  it('should create a PRIVILEGE_LEVEL_CHANGE action with minimal options if the agent can become unprivileged', async () => {
    (getAgentById as jest.Mock).mockResolvedValue({
      agent: { version: '9.3.0' },
      policy_id: policyId,
    } as any);
    mockedPackagePolicyService.findAllForAgentPolicy.mockResolvedValue([
      {
        id: 'package-1',
        package: { requires_root: false },
      },
      {
        id: 'package-2',
        package: { requires_root: false },
      },
    ] as any);
    mockedCreateAgentAction.mockResolvedValue({
      id: 'test-action-id',
      type: 'PRIVILEGE_LEVEL_CHANGE',
      agents: [agentId],
      created_at: new Date().toISOString(),
    });

    const res = await changeAgentPrivilegeLevel(esClientMock, soClientMock, agentId, {});

    expect(mockedCreateAgentAction).toHaveBeenCalledWith(esClientMock, soClientMock, {
      agents: [agentId],
      created_at: expect.any(String),
      type: 'PRIVILEGE_LEVEL_CHANGE',
      data: {
        unprivileged: true,
      },
    });
    expect(res).toEqual({ actionId: 'test-action-id' });
  });

  it('should create a PRIVILEGE_LEVEL_CHANGE action with additional options if the agent can become unprivileged', async () => {
    (getAgentById as jest.Mock).mockResolvedValue({
      agent: { version: '9.3.0' },
      policy_id: policyId,
    } as any);
    mockedPackagePolicyService.findAllForAgentPolicy.mockResolvedValue([
      {
        id: 'package-1',
        package: { requires_root: false },
      },
      {
        id: 'package-2',
        package: { requires_root: false },
      },
    ] as any);
    mockedCreateAgentAction.mockResolvedValue({
      id: 'test-action-id',
      type: 'PRIVILEGE_LEVEL_CHANGE',
      agents: [agentId],
      created_at: new Date().toISOString(),
    });

    const options = {
      user_info: { username: 'user', groupname: 'group', password: 'password' },
    };
    const res = await changeAgentPrivilegeLevel(esClientMock, soClientMock, agentId, options);

    expect(mockedCreateAgentAction).toHaveBeenCalledWith(esClientMock, soClientMock, {
      agents: [agentId],
      created_at: expect.any(String),
      type: 'PRIVILEGE_LEVEL_CHANGE',
      data: {
        unprivileged: true,
        user_info: { username: 'user', groupname: 'group' },
      },
      secrets: { user_info: { password: 'password' } },
    });
    expect(res).toEqual({ actionId: 'test-action-id' });
  });
});

describe('bulkChangeAgentsPrivilegeLevel', () => {
  const mockedAgent: Agent = {
    id: 'agent-123',
    policy_id: 'policy-0001',
    last_checkin: new Date().toISOString(),
    components: [],
    local_metadata: {
      elastic: {
        agent: {
          version: '1.0.0',
        },
      },
    },
    enrolled_at: new Date().toISOString(),
    active: true,
    packages: [],
    type: 'PERMANENT',
  };

  beforeEach(() => {
    // Reset mocks before each test
    jest.resetAllMocks();

    // Mock the createAgentAction response
    mockedCreateAgentAction.mockResolvedValue({
      id: 'test-action-id',
      type: 'PRIVILEGE_LEVEL_CHANGE',
      agents: ['agent-123'],
      created_at: new Date().toISOString(),
    });
  });

  it('should create a PRIVILEGE_LEVEL_CHANGE action for the specified agents', async () => {
    (getAgents as jest.Mock).mockResolvedValue([mockedAgent, mockedAgent]);
    const options = {
      user_info: {
        username: 'user1',
        groupname: 'group1',
        password: 'test',
      },
    };
    await bulkChangeAgentsPrivilegeLevel(esClientMock, soClientMock, {
      ...options,
      agentIds: [mockedAgent.id, mockedAgent.id],
    });
    expect(mockedCreateAgentAction).toHaveBeenCalledTimes(1);
    expect(mockedCreateAgentAction).toHaveBeenCalledWith(esClientMock, soClientMock, {
      agents: [mockedAgent.id, mockedAgent.id],
      created_at: expect.any(String),
      data: { unprivileged: true, user_info: { groupname: 'group1', username: 'user1' } },
      id: expect.any(String),
      namespaces: ['default'],
      secrets: { user_info: { password: 'test' } },
      total: 2,
      type: 'PRIVILEGE_LEVEL_CHANGE',
    });
  });

  it('should record error result if agent policies contain integrations that require root privilege', async () => {
    (getAgents as jest.Mock).mockResolvedValue([mockedAgent, mockedAgent]);
    const options = {
      user_info: {
        username: 'user1',
        groupname: 'group1',
        password: 'test',
      },
    };
    mockedPackagePolicyService.findAllForAgentPolicy.mockReturnValue([
      {
        id: 'package-1',
        package: { name: 'Package 1', requires_root: false },
      },
      {
        id: 'package-2',
        package: { name: 'Package 2', requires_root: true },
      },
    ] as any);

    await bulkChangeAgentsPrivilegeLevel(esClientMock, soClientMock, {
      ...options,
      agentIds: [mockedAgent.id, mockedAgent.id],
    });
    expect(mockedCreateErrorActionResults).toHaveBeenCalledWith(
      esClientMock,
      expect.any(String),
      {
        'agent-123': new FleetUnauthorizedError(
          'Agent agent-123 is on policy policy-0001, which contains integrations that require root privilege: Package 2'
        ),
      },
      'agent does not support privilege change action'
    );
  });
});

describe('bulkChangeAgentsPrivilegeLevel kuery path — cheap count and sync/async branching', () => {
  let mockGetAgentsByKuery: jest.SpyInstance;
  let mockOpenPointInTime: jest.SpyInstance;
  let mockBulkChangePrivilegeAgentsBatch: jest.SpyInstance;
  let mockChangePrivilegeActionRunner: jest.SpyInstance;

  beforeEach(() => {
    mockGetAgentsByKuery = jest.spyOn(jest.requireMock('./crud'), 'getAgentsByKuery');
    mockOpenPointInTime = jest
      .spyOn(jest.requireMock('./crud'), 'openPointInTime')
      .mockResolvedValue('pit-id');
    mockBulkChangePrivilegeAgentsBatch = jest
      .spyOn(changePrivilegeRunner, 'bulkChangePrivilegeAgentsBatch')
      .mockResolvedValue({ actionId: 'test-action-id' });
    mockChangePrivilegeActionRunner = jest
      .spyOn(changePrivilegeRunner, 'ChangePrivilegeActionRunner')
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
    mockBulkChangePrivilegeAgentsBatch.mockRestore();
    mockChangePrivilegeActionRunner.mockRestore();
  });

  it('uses perPage:0 for the initial count query', async () => {
    mockGetAgentsByKuery.mockResolvedValue({ agents: [], total: 0, page: 1, perPage: 0 });

    await bulkChangeAgentsPrivilegeLevel(esClientMock, soClientMock, { kuery: 'status:online' });

    expect(mockGetAgentsByKuery).toHaveBeenNthCalledWith(
      1,
      esClientMock,
      soClientMock,
      expect.objectContaining({ perPage: 0 })
    );
  });

  it('runs inline and fetches agents when total <= batchSize', async () => {
    const agents = [{ id: 'agent-1' }];
    mockGetAgentsByKuery
      .mockResolvedValueOnce({ agents: [], total: 5, page: 1, perPage: 0 }) // count
      .mockResolvedValueOnce({ agents, total: 5, page: 1, perPage: SO_SEARCH_LIMIT }); // fetch

    await bulkChangeAgentsPrivilegeLevel(esClientMock, soClientMock, { kuery: 'status:online' });

    expect(mockGetAgentsByKuery).toHaveBeenNthCalledWith(
      2,
      esClientMock,
      soClientMock,
      expect.objectContaining({ perPage: SO_SEARCH_LIMIT })
    );
    expect(mockBulkChangePrivilegeAgentsBatch).toHaveBeenCalledWith(
      esClientMock,
      soClientMock,
      agents,
      expect.anything()
    );
    expect(mockChangePrivilegeActionRunner).not.toHaveBeenCalled();
  });

  it('schedules async task and returns actionId immediately when total > batchSize', async () => {
    const batchSize = 100;
    mockGetAgentsByKuery.mockResolvedValueOnce({ agents: [], total: 500, page: 1, perPage: 0 });

    const result = await bulkChangeAgentsPrivilegeLevel(esClientMock, soClientMock, {
      kuery: 'status:online',
      batchSize,
    });

    expect(result).toEqual({ actionId: 'async-action-id' });
    expect(mockGetAgentsByKuery).toHaveBeenCalledTimes(1);
    expect(mockChangePrivilegeActionRunner).toHaveBeenCalledWith(
      esClientMock,
      soClientMock,
      expect.objectContaining({ batchSize, total: 500 }),
      expect.anything()
    );
    expect(mockBulkChangePrivilegeAgentsBatch).not.toHaveBeenCalled();
  });

  it('runs inline when total equals batchSize (boundary)', async () => {
    const batchSize = 100;
    mockGetAgentsByKuery
      .mockResolvedValueOnce({ agents: [], total: 100, page: 1, perPage: 0 }) // count
      .mockResolvedValueOnce({ agents: [], total: 100, page: 1, perPage: batchSize }); // fetch

    await bulkChangeAgentsPrivilegeLevel(esClientMock, soClientMock, {
      kuery: 'status:online',
      batchSize,
    });

    expect(mockBulkChangePrivilegeAgentsBatch).toHaveBeenCalled();
    expect(mockChangePrivilegeActionRunner).not.toHaveBeenCalled();
  });
});
