/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { v4 as uuidv4 } from 'uuid';

import type { AgentPolicy, Agent } from '../../types';

import { FleetError, FleetUnauthorizedError } from '../../errors';
import { sendActionTelemetryEvents } from '../action_sender';

import { SO_SEARCH_LIMIT } from '../../constants';

import { bulkMigrateAgents, migrateSingleAgent } from './migrate';
import { createAgentAction, createErrorActionResults } from './actions';
import { detectTargetClusterType } from './detect_target_cluster_type';
import { getAgentPolicyForAgents, getAgents, getAgentsByKuery, openPointInTime } from './crud';
import * as migrateActionRunner from './migrate_action_runner';

// Mock the imported functions
jest.mock('./actions');
jest.mock('../action_sender');
jest.mock('./detect_target_cluster_type');

jest.mock('./crud', () => {
  return {
    getAgentPolicyForAgents: jest.fn(),
    getAgents: jest.fn(),
    getAgentsByKuery: jest.fn(),
    openPointInTime: jest.fn(),
  };
});

// Mock uuid to return predictable values
jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

// Mock the license service
jest.mock('..', () => {
  return {
    licenseService: {
      hasAtLeast: jest.fn(),
    },
    appContextService: {
      getLogger: jest.fn(),
      getTelemetryEventsSender: jest.fn(),
      getCloud: jest.fn(),
    },
  };
});

const mockedCreateAgentAction = createAgentAction as jest.MockedFunction<typeof createAgentAction>;
const mockedCreateErrorActionResults = createErrorActionResults as jest.MockedFunction<
  typeof createErrorActionResults
>;
const mockedUuidv4 = uuidv4 as jest.MockedFunction<typeof uuidv4>;

const mockedAgent: Agent = {
  id: 'agent-123',
  policy_id: 'policy-456',
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
const mockedPolicy: AgentPolicy = {
  id: 'policy-456',
  is_protected: false,
  status: 'active',
  is_managed: false,
  updated_at: new Date().toISOString(),
  updated_by: 'kibana',
  revision: 1,
  name: 'Test Policy',
  namespace: 'default',
};

const mockedDetectTargetClusterType = detectTargetClusterType as jest.MockedFunction<
  typeof detectTargetClusterType
>;

describe('Agent migration', () => {
  let esClientMock: ReturnType<typeof elasticsearchServiceMock.createInternalClient>;
  let mockLicenseService: any;
  let mockAppContextService: any;
  const soClientMock = {
    getCurrentNamespace: jest.fn(),
  } as any;

  beforeEach(() => {
    // Reset mocks before each test
    jest.resetAllMocks();
    esClientMock = elasticsearchServiceMock.createInternalClient();

    mockLicenseService = jest.requireMock('..').licenseService;
    mockLicenseService.hasAtLeast.mockReturnValue(true);

    mockAppContextService = jest.requireMock('..').appContextService;
    mockAppContextService.getLogger.mockReturnValue({ debug: jest.fn() });
    mockAppContextService.getTelemetryEventsSender.mockReturnValue({
      queueTelemetryEvents: jest.fn(),
    });
    mockAppContextService.getCloud.mockReturnValue({
      isCloudEnabled: true,
      isServerlessEnabled: false,
      deploymentId: 'dep-123',
    });

    (getAgentPolicyForAgents as jest.Mock).mockResolvedValue([mockedPolicy]);

    // Mock the createAgentAction response
    mockedCreateAgentAction.mockResolvedValue({
      id: 'test-action-id',
      type: 'MIGRATE',
      agents: ['agent-123'],
      created_at: new Date().toISOString(),
    });

    // Mock uuid to return predictable value
    mockedUuidv4.mockReturnValue('test-action-id' as any);

    mockedPolicy.is_protected = false;

    // Default: target detected as ECH
    mockedDetectTargetClusterType.mockReturnValue('ech');
  });

  describe('migrateSingleAgent', () => {
    it('should create a MIGRATE action for the specified agent', async () => {
      const agentId = 'agent-123';
      const options = {
        policyId: 'policy-456',
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
        settings: { timeout: 300 },
      };

      const result = await migrateSingleAgent(
        esClientMock,
        soClientMock,
        agentId,
        mockedPolicy,
        mockedAgent,
        options
      );

      // Verify createAgentAction was called with correct params
      expect(mockedCreateAgentAction).toHaveBeenCalledTimes(1);
      expect(mockedCreateAgentAction).toHaveBeenCalledWith(esClientMock, soClientMock, {
        agents: [agentId],
        created_at: expect.any(String),
        type: 'MIGRATE',
        policyId: options.policyId,
        data: {
          target_uri: options.uri,
          settings: options.settings,
        },
        secrets: {
          enrollment_token: options.enrollment_token,
        },
      });

      // Verify result contains the action ID from createAgentAction
      expect(result).toEqual({ actionId: 'test-action-id' });
    });

    it('should handle empty additional settings', async () => {
      const agentId = 'agent-123';
      const options = {
        policyId: 'policy-456',
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
      };

      await migrateSingleAgent(
        esClientMock,
        soClientMock,
        agentId,
        mockedPolicy,
        mockedAgent,
        options
      );

      // Verify createAgentAction was called with correct params and undefined additionalSettings
      expect(mockedCreateAgentAction).toHaveBeenCalledWith(
        esClientMock,
        soClientMock,
        expect.objectContaining({
          data: {
            target_uri: options.uri,
            settings: undefined,
          },
          secrets: {
            enrollment_token: options.enrollment_token,
          },
        })
      );
    });

    it('should send telemetry with source ECH and detected serverless target', async () => {
      mockedDetectTargetClusterType.mockReturnValue('serverless');

      await migrateSingleAgent(esClientMock, soClientMock, 'agent-123', mockedPolicy, mockedAgent, {
        policyId: 'policy-456',
        enrollment_token: 'token',
        uri: 'https://target.example.com',
      });

      expect(sendActionTelemetryEvents).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          eventType: 'MIGRATE',
          agentCount: 1,
          sourceType: 'ech',
          targetType: 'serverless',
        })
      );
    });

    it('should send telemetry with undefined sourceType when not on cloud', async () => {
      mockAppContextService.getCloud.mockReturnValue({
        isCloudEnabled: false,
        isServerlessEnabled: false,
        deploymentId: undefined,
      });

      await migrateSingleAgent(esClientMock, soClientMock, 'agent-123', mockedPolicy, mockedAgent, {
        policyId: 'policy-456',
        enrollment_token: 'token',
        uri: 'https://target.example.com',
      });

      expect(sendActionTelemetryEvents).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          eventType: 'MIGRATE',
          agentCount: 1,
          sourceType: undefined,
        })
      );
    });

    it('should send telemetry with undefined targetType when detection fails', async () => {
      mockedDetectTargetClusterType.mockReturnValue(undefined);

      await migrateSingleAgent(esClientMock, soClientMock, 'agent-123', mockedPolicy, mockedAgent, {
        policyId: 'policy-456',
        enrollment_token: 'token',
        uri: 'https://target.example.com',
      });

      expect(sendActionTelemetryEvents).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({ targetType: undefined })
      );
    });

    it('should throw an error if the agent is protected', async () => {
      const agentId = 'agent-123';
      const options = {
        policyId: 'policy-456',
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
      };
      mockedPolicy.is_protected = true;
      await expect(
        migrateSingleAgent(esClientMock, soClientMock, agentId, mockedPolicy, mockedAgent, options)
      ).rejects.toThrowError('Agent is protected and cannot be migrated');
    });

    it('should throw an error if the agent is a fleet server', async () => {
      const agentId = 'agent-123';
      const options = {
        policyId: 'policy-456',
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
      };
      await expect(
        migrateSingleAgent(
          esClientMock,
          soClientMock,
          agentId,
          mockedPolicy,
          { ...mockedAgent, components: [{ type: 'fleet-server' } as any] },
          options
        )
      ).rejects.toThrowError('Fleet server agents cannot be migrated');
    });

    it('should throw an error if the agent has a not supported version', async () => {
      const agentId = 'agent-123';
      const options = {
        policyId: 'policy-456',
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
      };
      await expect(
        migrateSingleAgent(
          esClientMock,
          soClientMock,
          agentId,
          mockedPolicy,
          { ...mockedAgent, agent: { version: '9.1.0' } as any },
          options
        )
      ).rejects.toThrowError(
        'Agent cannot be migrated. Migrate action is supported from version 9.2.0.'
      );
    });

    it('should throw FleetUnauthorizedError when license is insufficient', async () => {
      // Mock license as not having the required level
      mockLicenseService.hasAtLeast.mockReturnValue(false);

      const agentId = 'agent-123';
      const options = {
        policyId: 'policy-456',
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
        settings: { timeout: 300 },
      };

      await expect(
        migrateSingleAgent(esClientMock, soClientMock, agentId, mockedPolicy, mockedAgent, options)
      ).rejects.toThrow(FleetUnauthorizedError);

      await expect(
        migrateSingleAgent(esClientMock, soClientMock, agentId, mockedPolicy, mockedAgent, options)
      ).rejects.toThrow(
        'Agent migration requires an enterprise license. Please upgrade your license.'
      );

      // Verify that createAgentAction was not called when license is insufficient
      expect(mockedCreateAgentAction).not.toHaveBeenCalled();
    });

    it('should throw an error if the agent is containerized', async () => {
      const agentId = 'agent-123';
      const options = {
        policyId: 'policy-456',
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
      };
      await expect(
        migrateSingleAgent(
          esClientMock,
          soClientMock,
          agentId,
          mockedPolicy,
          {
            ...mockedAgent,
            local_metadata: {
              elastic: {
                agent: {
                  version: '9.2.0',
                  upgradeable: false, // Containerized agent
                },
              },
            },
          },
          options
        )
      ).rejects.toThrowError('Containerized agents cannot be migrated');
    });

    it('should proceed normally when license is sufficient', async () => {
      // Ensure license is valid (default mock)
      mockLicenseService.hasAtLeast.mockReturnValue(true);

      const agentId = 'agent-123';
      const options = {
        policyId: 'policy-456',
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
        settings: { timeout: 300 },
      };

      const result = await migrateSingleAgent(
        esClientMock,
        soClientMock,
        agentId,
        mockedPolicy,
        mockedAgent,
        options
      );

      // Verify createAgentAction was called when license is sufficient
      expect(mockedCreateAgentAction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ actionId: 'test-action-id' });
    });
  });

  // Bulk migrate

  describe('migrateBulkAgents', () => {
    it('should create a MIGRATE action for the specified agents', async () => {
      (getAgents as jest.Mock).mockResolvedValue([mockedAgent, mockedAgent]);
      const options = {
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
        settings: { timeout: 300 },
      };

      await bulkMigrateAgents(esClientMock, soClientMock, {
        ...options,
        agentIds: [mockedAgent.id, mockedAgent.id],
      });

      // Verify createAgentAction was called with correct params
      expect(mockedCreateAgentAction).toHaveBeenCalledTimes(1);
      expect(mockedCreateAgentAction).toHaveBeenCalledWith(
        esClientMock,
        soClientMock,
        expect.objectContaining({
          agents: [mockedAgent.id, mockedAgent.id],
          type: 'MIGRATE',
          data: {
            target_uri: options.uri,
            settings: options.settings,
          },
          secrets: {
            enrollment_token: options.enrollment_token,
          },
          total: 2,
          namespaces: ['default'],
        })
      );
    });

    it('should handle empty additional settings', async () => {
      (getAgents as jest.Mock).mockResolvedValue([mockedAgent, mockedAgent]);
      const options = {
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
      };

      await bulkMigrateAgents(esClientMock, soClientMock, {
        ...options,
        agentIds: [mockedAgent.id, mockedAgent.id],
      });

      // Verify createAgentAction was called with correct params and undefined additionalSettings
      expect(mockedCreateAgentAction).toHaveBeenCalledWith(
        esClientMock,
        soClientMock,
        expect.objectContaining({
          data: {
            target_uri: options.uri,
            settings: undefined,
          },
          secrets: {
            enrollment_token: options.enrollment_token,
          },
        })
      );
    });

    it('should send telemetry with source and target cluster types', async () => {
      mockedDetectTargetClusterType.mockReturnValue('serverless');
      (getAgents as jest.Mock).mockResolvedValue([mockedAgent]);

      await bulkMigrateAgents(esClientMock, soClientMock, {
        agentIds: [mockedAgent.id],
        enrollment_token: 'token',
        uri: 'https://target.example.com',
      });

      expect(sendActionTelemetryEvents).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          eventType: 'MIGRATE',
          sourceType: 'ech',
          targetType: 'serverless',
        })
      );
    });

    it('should send telemetry with undefined sourceType when not on cloud', async () => {
      mockAppContextService.getCloud.mockReturnValue({
        isCloudEnabled: false,
        isServerlessEnabled: false,
        deploymentId: undefined,
      });
      mockedDetectTargetClusterType.mockReturnValue('ech');
      (getAgents as jest.Mock).mockResolvedValue([mockedAgent]);

      await bulkMigrateAgents(esClientMock, soClientMock, {
        agentIds: [mockedAgent.id],
        enrollment_token: 'token',
        uri: 'https://target.example.com',
      });

      expect(sendActionTelemetryEvents).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          eventType: 'MIGRATE',
          sourceType: undefined,
        })
      );
    });

    it('should record error result if the agent is protected', async () => {
      (getAgents as jest.Mock).mockResolvedValue([mockedAgent, mockedAgent]);
      const options = {
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
      };
      mockedPolicy.is_protected = true;
      await bulkMigrateAgents(esClientMock, soClientMock, {
        ...options,
        agentIds: [mockedAgent.id, mockedAgent.id],
      });
      expect(mockedCreateErrorActionResults).toHaveBeenCalledWith(
        esClientMock,
        expect.any(String),
        {
          'agent-123': new FleetError(
            'Agent agent-123 cannot be migrated because it is protected.'
          ),
        },
        'agent does not support migration action'
      );
    });

    it('should record error result if the agent is fleet-server', async () => {
      const agent = { ...mockedAgent, components: [{ type: 'fleet-server' } as any] };
      (getAgents as jest.Mock).mockResolvedValue([agent, agent]);
      const options = {
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
      };
      await bulkMigrateAgents(esClientMock, soClientMock, {
        ...options,
        agentIds: [agent.id, agent.id],
      });
      expect(mockedCreateErrorActionResults).toHaveBeenCalledWith(
        esClientMock,
        expect.any(String),
        {
          'agent-123': new FleetError(
            'Agent agent-123 cannot be migrated because it is a fleet-server.'
          ),
        },
        'agent does not support migration action'
      );
    });

    it('should record error result if the agent is on unsupported version', async () => {
      const agent = { ...mockedAgent, agent: { version: '9.1.0' } as any };
      (getAgents as jest.Mock).mockResolvedValue([agent, agent]);
      const options = {
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
      };
      await bulkMigrateAgents(esClientMock, soClientMock, {
        ...options,
        agentIds: [agent.id, agent.id],
      });
      expect(mockedCreateErrorActionResults).toHaveBeenCalledWith(
        esClientMock,
        expect.any(String),
        {
          'agent-123': new FleetError(
            'Agent agent-123 cannot be migrated. Migrate action is supported from version 9.2.0.'
          ),
        },
        'agent does not support migration action'
      );
    });

    it('should throw FleetUnauthorizedError when license is insufficient', async () => {
      // Mock license as not having the required level
      mockLicenseService.hasAtLeast.mockReturnValue(false);

      const options = {
        agentIds: ['agent-123', 'agent-456'],
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
        settings: { timeout: 300 },
      };

      await expect(bulkMigrateAgents(esClientMock, soClientMock, options)).rejects.toThrow(
        FleetUnauthorizedError
      );

      await expect(bulkMigrateAgents(esClientMock, soClientMock, options)).rejects.toThrow(
        'Agent migration requires an enterprise license. Please upgrade your license.'
      );

      // Verify that getAgents was not called when license is insufficient
      expect(getAgents as jest.Mock).not.toHaveBeenCalled();
    });

    it('should record error result if the agent is containerized', async () => {
      const agent = {
        ...mockedAgent,
        local_metadata: {
          elastic: {
            agent: {
              version: '9.2.0',
              upgradeable: false, // Containerized agent
            },
          },
        },
      };
      (getAgents as jest.Mock).mockResolvedValue([agent, agent]);
      const options = {
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
      };
      await bulkMigrateAgents(esClientMock, soClientMock, {
        ...options,
        agentIds: [agent.id, agent.id],
      });
      expect(mockedCreateErrorActionResults).toHaveBeenCalledWith(
        esClientMock,
        expect.any(String),
        {
          'agent-123': new FleetError(
            'Agent agent-123 cannot be migrated because it is containerized.'
          ),
        },
        'agent does not support migration action'
      );
    });
    it('should proceed normally when license is sufficient', async () => {
      // Ensure license is valid (default mock)
      mockLicenseService.hasAtLeast.mockReturnValue(true);
      (getAgents as jest.Mock).mockResolvedValue([mockedAgent, mockedAgent]);

      const options = {
        agentIds: ['agent-123', 'agent-456'],
        enrollment_token: 'test-enrollment-token',
        uri: 'https://test-fleet-server.example.com',
        settings: { timeout: 300 },
      };

      const result = await bulkMigrateAgents(esClientMock, soClientMock, options);

      // Verify that the bulk migration proceeded normally
      expect(getAgents as jest.Mock).toHaveBeenCalled();
      expect(result).toEqual({ actionId: 'test-action-id' });
    });
  });
});

describe('bulkMigrateAgents kuery path — cheap count and sync/async branching', () => {
  const soClient2 = { getCurrentNamespace: jest.fn() } as any;
  let esClient2: ReturnType<typeof elasticsearchServiceMock.createInternalClient>;
  const baseOptions = { enrollment_token: 'token', uri: 'https://target.example.com' };
  let mockBulkMigrateAgentsBatch: jest.SpyInstance;
  let mockMigrateActionRunner: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    esClient2 = elasticsearchServiceMock.createInternalClient();
    const mockLicenseService = jest.requireMock('..').licenseService;
    mockLicenseService.hasAtLeast.mockReturnValue(true);
    const mockAppContextService = jest.requireMock('..').appContextService;
    mockAppContextService.getLogger.mockReturnValue({ debug: jest.fn() });
    mockAppContextService.getTelemetryEventsSender.mockReturnValue({
      queueTelemetryEvents: jest.fn(),
    });
    mockAppContextService.getCloud.mockReturnValue({ isCloudEnabled: false });
    (detectTargetClusterType as jest.Mock).mockReturnValue('ech');
    (openPointInTime as jest.Mock).mockResolvedValue('pit-id');
    mockBulkMigrateAgentsBatch = jest
      .spyOn(migrateActionRunner, 'bulkMigrateAgentsBatch')
      .mockResolvedValue({ actionId: 'test-action-id' });
    mockMigrateActionRunner = jest
      .spyOn(migrateActionRunner, 'MigrateActionRunner')
      .mockImplementation(
        () =>
          ({
            runActionAsyncTask: jest.fn().mockResolvedValue({ actionId: 'async-action-id' }),
          } as any)
      );
  });

  afterEach(() => {
    mockBulkMigrateAgentsBatch.mockRestore();
    mockMigrateActionRunner.mockRestore();
  });

  it('uses perPage:0 for the initial count query', async () => {
    (getAgentsByKuery as jest.Mock).mockResolvedValue({
      agents: [],
      total: 0,
      page: 1,
      perPage: 0,
    });

    await bulkMigrateAgents(esClient2, soClient2, { ...baseOptions, kuery: 'status:online' });

    expect(getAgentsByKuery as jest.Mock).toHaveBeenCalledWith(
      esClient2,
      soClient2,
      expect.objectContaining({ perPage: 0 })
    );
  });

  it('runs inline and fetches agents when total <= batchSize', async () => {
    const agents = [{ id: 'agent-1' }];
    (getAgentsByKuery as jest.Mock)
      .mockResolvedValueOnce({ agents: [], total: 5, page: 1, perPage: 0 })
      .mockResolvedValueOnce({ agents, total: 5, page: 1, perPage: SO_SEARCH_LIMIT });

    await bulkMigrateAgents(esClient2, soClient2, { ...baseOptions, kuery: 'status:online' });

    // count call (perPage: 0) and fetch call (perPage: SO_SEARCH_LIMIT) both happened
    expect(getAgentsByKuery as jest.Mock).toHaveBeenCalledWith(
      esClient2,
      soClient2,
      expect.objectContaining({ perPage: 0 })
    );
    expect(getAgentsByKuery as jest.Mock).toHaveBeenCalledWith(
      esClient2,
      soClient2,
      expect.objectContaining({ perPage: SO_SEARCH_LIMIT })
    );
    expect(mockBulkMigrateAgentsBatch).toHaveBeenCalledWith(
      esClient2,
      soClient2,
      agents,
      expect.anything()
    );
    expect(mockMigrateActionRunner).not.toHaveBeenCalled();
  });

  it('schedules async task and returns actionId immediately when total > batchSize', async () => {
    const batchSize = 100;
    (getAgentsByKuery as jest.Mock).mockResolvedValue({
      agents: [],
      total: 500,
      page: 1,
      perPage: 0,
    });

    const result = await bulkMigrateAgents(esClient2, soClient2, {
      ...baseOptions,
      kuery: 'status:online',
      batchSize,
    });

    expect(result).toEqual({ actionId: 'async-action-id' });
    // only the count call — no second full-doc fetch
    expect(getAgentsByKuery as jest.Mock).not.toHaveBeenCalledWith(
      esClient2,
      soClient2,
      expect.objectContaining({ perPage: batchSize })
    );
    expect(mockMigrateActionRunner).toHaveBeenCalledWith(
      esClient2,
      soClient2,
      expect.objectContaining({ batchSize, total: 500 }),
      expect.anything()
    );
    expect(mockBulkMigrateAgentsBatch).not.toHaveBeenCalled();
  });

  it('runs inline when total equals batchSize (boundary)', async () => {
    const batchSize = 100;
    (getAgentsByKuery as jest.Mock)
      .mockResolvedValueOnce({ agents: [], total: 100, page: 1, perPage: 0 })
      .mockResolvedValueOnce({ agents: [], total: 100, page: 1, perPage: batchSize });

    await bulkMigrateAgents(esClient2, soClient2, {
      ...baseOptions,
      kuery: 'status:online',
      batchSize,
    });

    expect(mockBulkMigrateAgentsBatch).toHaveBeenCalled();
    expect(mockMigrateActionRunner).not.toHaveBeenCalled();
  });
});
