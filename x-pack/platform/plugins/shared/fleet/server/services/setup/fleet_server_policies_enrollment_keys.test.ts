/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { elasticsearchServiceMock, savedObjectsClientMock } from '@kbn/core/server/mocks';

import { ENROLLMENT_API_KEYS_INDEX } from '../../../common/constants';
import { appContextService } from '../app_context';
import { agentPolicyService } from '../agent_policy';
import { generateEnrollmentAPIKey } from '../api_keys';

import { scheduleDeployAgentPoliciesTask } from '../agent_policies/deploy_agent_policies_task';

import { ensureAgentPoliciesFleetServerKeysAndPolicies } from './fleet_server_policies_enrollment_keys';

jest.mock('../app_context');
jest.mock('../agent_policy');
jest.mock('../api_keys');
jest.mock('../agent_policies/deploy_agent_policies_task');

const mockedGenerateEnrollmentAPIKey = jest.mocked(generateEnrollmentAPIKey);

const mockedAgentPolicyService = jest.mocked(agentPolicyService);
const mockedAppContextService = jest.mocked(appContextService);

// Provide the data setup reads: the latest deployed revision per policy (via
// `agentPolicyService.getLatestFleetPolicyRevisions`) and the policies that already have an
// enrollment API key (via an aggregation on `.fleet-enrollment-api-keys`).
const mockSetupQueries = (
  esClient: ReturnType<typeof elasticsearchServiceMock.createInternalClient>,
  {
    revisions = {},
    policiesWithKeys = [],
  }: { revisions?: Record<string, number>; policiesWithKeys?: string[] }
) => {
  mockedAgentPolicyService.getLatestFleetPolicyRevisions.mockResolvedValue(
    new Map(Object.entries(revisions))
  );
  esClient.search.mockImplementation((async (params: any) => {
    if (params.index === ENROLLMENT_API_KEYS_INDEX) {
      return {
        aggregations: {
          policies: { buckets: policiesWithKeys.map((key) => ({ key })) },
        },
      };
    }
    return {};
  }) as any);
};

describe('ensureAgentPoliciesFleetServerKeysAndPolicies', () => {
  beforeEach(() => {
    mockedAppContextService.getSecurity.mockReturnValue({
      authc: { apiKeys: { areAPIKeysEnabled: async () => true } },
    } as any);
    mockedAppContextService.getInternalUserSOClientForSpaceId.mockReturnValue(
      savedObjectsClientMock.create()
    );

    mockedGenerateEnrollmentAPIKey.mockReset();
    mockedAgentPolicyService.getLatestFleetPolicyRevisions.mockReset();
    mockedAgentPolicyService.getLatestFleetPolicyRevisions.mockResolvedValue(new Map());
    mockedAgentPolicyService.deployPolicies.mockReset();
    mockedAgentPolicyService.deployPolicies.mockImplementation(async () => {});
    jest.mocked(scheduleDeployAgentPoliciesTask).mockReset();
    mockedAgentPolicyService.list.mockResolvedValue({
      items: [
        {
          id: 'policy1',
          revision: 1,
        },
        {
          id: 'policy2',
          revision: 2,
        },
      ],
    } as any);
  });

  it('should do nothing with policies already deployed', async () => {
    const logger = loggingSystemMock.createLogger();
    const esClient = elasticsearchServiceMock.createInternalClient();
    const soClient = savedObjectsClientMock.create();
    mockSetupQueries(esClient, { revisions: { policy1: 1, policy2: 2 } });

    await ensureAgentPoliciesFleetServerKeysAndPolicies({
      logger,
      esClient,
      soClient,
    });

    expect(mockedGenerateEnrollmentAPIKey).toBeCalledTimes(2);
    expect(mockedAgentPolicyService.deployPolicies).not.toBeCalled();
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('has mismatched revisions')
    );
  });

  it('should only generate enrollment keys for policies that are missing one', async () => {
    const logger = loggingSystemMock.createLogger();
    const esClient = elasticsearchServiceMock.createInternalClient();
    const soClient = savedObjectsClientMock.create();
    mockSetupQueries(esClient, {
      revisions: { policy1: 1, policy2: 2 },
      policiesWithKeys: ['policy1'],
    });

    await ensureAgentPoliciesFleetServerKeysAndPolicies({
      logger,
      esClient,
      soClient,
    });

    expect(mockedGenerateEnrollmentAPIKey).toBeCalledTimes(1);
    expect(mockedGenerateEnrollmentAPIKey).toBeCalledWith(
      soClient,
      esClient,
      expect.objectContaining({ agentPolicyId: 'policy2', name: 'Default', forceRecreate: true })
    );
  });

  it('should do deploy policies out of sync', async () => {
    const logger = loggingSystemMock.createLogger();
    const esClient = elasticsearchServiceMock.createInternalClient();
    const soClient = savedObjectsClientMock.create();
    mockSetupQueries(esClient, { revisions: { policy1: 1, policy2: 1 } });

    await ensureAgentPoliciesFleetServerKeysAndPolicies({
      logger,
      esClient,
      soClient,
    });

    expect(mockedGenerateEnrollmentAPIKey).toBeCalledTimes(2);
    expect(scheduleDeployAgentPoliciesTask).toBeCalledWith(undefined, [
      { id: 'policy2', spaceId: undefined },
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      'Policy [policy2] has mismatched revisions: .kibana_ingest revision [2], .fleet-policies revision_idx [1]'
    );
  });

  it('should do deploy policies never deployed', async () => {
    const logger = loggingSystemMock.createLogger();
    const esClient = elasticsearchServiceMock.createInternalClient();
    const soClient = savedObjectsClientMock.create();
    // policy2 has no deployed revision so it is omitted from the aggregation buckets
    mockSetupQueries(esClient, { revisions: { policy1: 1 } });

    await ensureAgentPoliciesFleetServerKeysAndPolicies({
      logger,
      esClient,
      soClient,
    });

    expect(mockedGenerateEnrollmentAPIKey).toBeCalledTimes(2);
    expect(scheduleDeployAgentPoliciesTask).toBeCalledWith(undefined, [
      { id: 'policy2', spaceId: undefined },
    ]);
  });

  it('should synchronously deploy preconfigured fleet server policies that are out of sync', async () => {
    const logger = loggingSystemMock.createLogger();
    const esClient = elasticsearchServiceMock.createInternalClient();
    const soClient = savedObjectsClientMock.create();

    mockedAgentPolicyService.list.mockResolvedValue({
      items: [
        {
          id: 'fleet-server-policy',
          revision: 2,
          is_default_fleet_server: true,
          is_preconfigured: true,
        },
        { id: 'policy1', revision: 1 },
      ],
    } as any);

    // fleet-server-policy is out of sync; policy1 is up to date
    mockSetupQueries(esClient, { revisions: { 'fleet-server-policy': 1, policy1: 1 } });

    await ensureAgentPoliciesFleetServerKeysAndPolicies({
      logger,
      esClient,
      soClient,
    });

    expect(mockedAgentPolicyService.deployPolicies).toBeCalledWith(
      expect.anything(),
      ['fleet-server-policy'],
      undefined,
      { throwOnAnyError: true }
    );
    expect(scheduleDeployAgentPoliciesTask).not.toBeCalled();
  });

  it('should synchronously deploy preconfigured fleet server policies and schedule regular outdated policies async', async () => {
    const logger = loggingSystemMock.createLogger();
    const esClient = elasticsearchServiceMock.createInternalClient();
    const soClient = savedObjectsClientMock.create();

    mockedAgentPolicyService.list.mockResolvedValue({
      items: [
        {
          id: 'fleet-server-policy',
          revision: 2,
          is_default_fleet_server: true,
          is_preconfigured: true,
        },
        { id: 'policy1', revision: 3 },
      ],
    } as any);

    // Both are out of sync
    mockSetupQueries(esClient, { revisions: { 'fleet-server-policy': 1, policy1: 1 } });

    await ensureAgentPoliciesFleetServerKeysAndPolicies({
      logger,
      esClient,
      soClient,
    });

    expect(mockedAgentPolicyService.deployPolicies).toBeCalledWith(
      expect.anything(),
      ['fleet-server-policy'],
      undefined,
      { throwOnAnyError: true }
    );
    expect(scheduleDeployAgentPoliciesTask).toBeCalledWith(undefined, [
      { id: 'policy1', spaceId: undefined },
    ]);
  });

  it('should log an error and still schedule regular policies if a preconfigured fleet server policy deploy fails', async () => {
    const logger = loggingSystemMock.createLogger();
    const esClient = elasticsearchServiceMock.createInternalClient();
    const soClient = savedObjectsClientMock.create();

    mockedAgentPolicyService.list.mockResolvedValue({
      items: [
        {
          id: 'fleet-server-policy',
          revision: 2,
          is_default_fleet_server: true,
          is_preconfigured: true,
        },
        { id: 'policy1', revision: 3 },
      ],
    } as any);

    mockSetupQueries(esClient, { revisions: { 'fleet-server-policy': 1, policy1: 1 } });
    mockedAgentPolicyService.deployPolicies.mockRejectedValue(
      new Error('ES bulk operation failed')
    );

    await ensureAgentPoliciesFleetServerKeysAndPolicies({ logger, esClient, soClient });

    expect(logger.error).toBeCalledWith(
      expect.stringContaining('Failed to deploy fleet server policies [fleet-server-policy]')
    );
    // A fleet server deploy failure must not prevent regular outdated policies from being scheduled
    expect(scheduleDeployAgentPoliciesTask).toBeCalledWith(undefined, [
      { id: 'policy1', spaceId: undefined },
    ]);
  });

  it('should synchronously deploy preconfigured fleet server policies identified by has_fleet_server flag', async () => {
    const logger = loggingSystemMock.createLogger();
    const esClient = elasticsearchServiceMock.createInternalClient();
    const soClient = savedObjectsClientMock.create();

    mockedAgentPolicyService.list.mockResolvedValue({
      items: [
        { id: 'custom-fs-policy', revision: 2, has_fleet_server: true, is_preconfigured: true },
      ],
    } as any);

    mockSetupQueries(esClient, { revisions: { 'custom-fs-policy': 1 } });

    await ensureAgentPoliciesFleetServerKeysAndPolicies({
      logger,
      esClient,
      soClient,
    });

    expect(mockedAgentPolicyService.deployPolicies).toBeCalledWith(
      expect.anything(),
      ['custom-fs-policy'],
      undefined,
      { throwOnAnyError: true }
    );
    expect(scheduleDeployAgentPoliciesTask).not.toBeCalled();
  });

  it('should not synchronously deploy non-preconfigured fleet server policies', async () => {
    const logger = loggingSystemMock.createLogger();
    const esClient = elasticsearchServiceMock.createInternalClient();
    const soClient = savedObjectsClientMock.create();

    mockedAgentPolicyService.list.mockResolvedValue({
      items: [
        {
          id: 'user-fs-policy',
          revision: 2,
          is_default_fleet_server: true,
          is_preconfigured: false,
        },
      ],
    } as any);

    mockSetupQueries(esClient, { revisions: { 'user-fs-policy': 1 } });

    await ensureAgentPoliciesFleetServerKeysAndPolicies({
      logger,
      esClient,
      soClient,
    });

    // Non-preconfigured fleet server policy goes to the async task, not synchronous deploy
    expect(mockedAgentPolicyService.deployPolicies).not.toBeCalled();
    expect(scheduleDeployAgentPoliciesTask).toBeCalledWith(undefined, [
      { id: 'user-fs-policy', spaceId: undefined },
    ]);
  });
});
