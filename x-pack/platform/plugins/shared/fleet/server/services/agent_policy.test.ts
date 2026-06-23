/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import apm from 'elastic-apm-node';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { tracing } from '@elastic/opentelemetry-node/sdk';
import type { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { securityMock } from '@kbn/security-plugin/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import type { Logger } from '@kbn/core/server';
import type { SavedObjectError } from '@kbn/core-saved-objects-common';

import { createSavedObjectClientMock } from '../mocks';

import { PACKAGE_POLICY_SAVED_OBJECT_TYPE } from '../../common/constants';

import {
  PackagePolicyRestrictionRelatedError,
  FleetUnauthorizedError,
  HostedAgentPolicyRestrictionRelatedError,
  AgentPolicyInvalidError,
} from '../errors';
import type {
  AgentPolicy,
  FullAgentPolicy,
  NewAgentPolicy,
  PreconfiguredAgentPolicy,
} from '../types';
import {
  AGENT_POLICY_SAVED_OBJECT_TYPE,
  LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
} from '../constants';

import { AGENT_POLICY_INDEX, SO_SEARCH_LIMIT } from '../../common';

import { agentPolicyService } from './agent_policy';
import { agentPolicyUpdateEventHandler } from './agent_policy_update';

import { getAgentsByKuery } from './agents';
import { getPackagePolicySavedObjectType, packagePolicyService } from './package_policy';
import { appContextService } from './app_context';
import { outputService } from './output';
import { downloadSourceService } from './download_source';
import { getFullAgentPolicy } from './agent_policies';
import * as outputsHelpers from './agent_policies/outputs_helpers';
import { auditLoggingService } from './audit_logging';
import { licenseService } from './license';
import type { UninstallTokenServiceInterface } from './security/uninstall_token_service';
import { isSpaceAwarenessEnabled } from './spaces/helpers';
import { scheduleDeployAgentPoliciesTask } from './agent_policies/deploy_agent_policies_task';
import { scheduleBumpAgentPoliciesByIdTask } from './agent_policies/bump_agent_policies_by_id_task';
import { createAgentPolicyWithPackages } from './agent_policy_create';
import { agentlessAgentService } from './agents/agentless_agent';
import { getPackageInfo } from './epm/packages';
import { ensureInstalledPackage } from './epm/packages/install';

jest.mock('./spaces/helpers');

function getSavedObjectMock(agentPolicyAttributes: any) {
  const mock = createSavedObjectClientMock();
  const mockPolicy = {
    type: AGENT_POLICY_SAVED_OBJECT_TYPE,
    references: [],
    attributes: agentPolicyAttributes as AgentPolicy,
  };
  mock.get.mockImplementation(async (type: string, id: string) => {
    return {
      id,
      ...mockPolicy,
    };
  });
  mock.bulkGet.mockImplementation(async (options) => {
    return {
      saved_objects: options.map(({ id }) => {
        return {
          id,
          ...mockPolicy,
        };
      }),
    };
  });
  mock.find.mockImplementation(async (options) => {
    switch (options.type) {
      case AGENT_POLICY_SAVED_OBJECT_TYPE:
        return {
          saved_objects: [
            {
              id: 'agent-policy-id',
              score: 1,
              ...mockPolicy,
            },
          ],
          total: 1,
          page: 1,
          per_page: 1,
        };
      case PACKAGE_POLICY_SAVED_OBJECT_TYPE:
        return {
          saved_objects: [],
          total: 0,
          page: 1,
          per_page: 1,
        };
      default:
        return {
          saved_objects: [
            {
              id: '93f74c0-e876-11ea-b7d3-8b2acec6f75c',
              attributes: {
                fleet_server_hosts: ['http://fleetserver:8220'],
              },
              type: 'ingest_manager_settings',
              score: 1,
              references: [],
            },
          ],
          total: 1,
          page: 1,
          per_page: 1,
        };
    }
  });

  return mock;
}

jest.mock('./output');
jest.mock('./download_source');
jest.mock('./agent_policy_update');
jest.mock('./agents');
jest.mock('./package_policy');
jest.mock('./app_context');
jest.mock('./audit_logging');
jest.mock('./agent_policies/full_agent_policy');
jest.mock('./agent_policies/outputs_helpers');
jest.mock('./agent_policies/deploy_agent_policies_task');
jest.mock('./agent_policies/bump_agent_policies_by_id_task');
jest.mock('./agent_policy_create');
jest.mock('./epm/packages/install');
jest.mock('./epm/packages');

const mockedAppContextService = appContextService as jest.Mocked<typeof appContextService>;
mockedAppContextService.getSecuritySetup.mockImplementation(() => ({
  ...securityMock.createSetup(),
}));

const mockedAuditLoggingService = auditLoggingService as jest.Mocked<typeof auditLoggingService>;
const mockOutputsHelpers = outputsHelpers as jest.Mocked<typeof outputsHelpers>;
const mockedOutputService = outputService as jest.Mocked<typeof outputService>;
const mockedDownloadSourceService = downloadSourceService as jest.Mocked<
  typeof downloadSourceService
>;
const mockedPackagePolicyService = packagePolicyService as jest.Mocked<typeof packagePolicyService>;

const mockedGetFullAgentPolicy = getFullAgentPolicy as jest.Mock<
  ReturnType<typeof getFullAgentPolicy>
>;
const mockedCreateAgentPolicyWithPackages = createAgentPolicyWithPackages as jest.MockedFunction<
  typeof createAgentPolicyWithPackages
>;

function getAgentPolicyCreateMock() {
  const soClient = createSavedObjectClientMock();
  soClient.create.mockImplementation(async (type, attributes) => {
    return {
      attributes: attributes as unknown as NewAgentPolicy,
      id: 'mocked',
      type: 'mocked',
      references: [],
    };
  });
  return soClient;
}
let mockedLogger: jest.Mocked<Logger>;

let otelExporter: tracing.InMemorySpanExporter;
let otelProvider: tracing.BasicTracerProvider;

beforeAll(() => {
  otelExporter = new tracing.InMemorySpanExporter();
  otelProvider = new tracing.BasicTracerProvider({
    spanProcessors: [new tracing.SimpleSpanProcessor(otelExporter)],
  });
  trace.setGlobalTracerProvider(otelProvider);
});

afterAll(async () => {
  await otelProvider.shutdown();
});

describe('Agent policy', () => {
  beforeEach(() => {
    otelExporter?.reset();
    mockedLogger = loggerMock.create();
    mockedAppContextService.getLogger.mockReturnValue(mockedLogger);
    mockedAppContextService.getExperimentalFeatures.mockReturnValue({} as any);
    jest.mocked(isSpaceAwarenessEnabled).mockResolvedValue(true);
    jest
      .mocked(getPackagePolicySavedObjectType)
      .mockResolvedValue(PACKAGE_POLICY_SAVED_OBJECT_TYPE);
    jest.spyOn(apm, 'startTransaction').mockReturnValue({ end: jest.fn() } as any);
    mockedPackagePolicyService.findAllForAgentPolicy.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('create', () => {
    it('is_managed present and false by default', async () => {
      const soClient = getAgentPolicyCreateMock();
      // ignore unrelated unique name constraint
      jest.spyOn(agentPolicyService, 'requireUniqueName').mockResolvedValue(undefined);
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      await expect(
        agentPolicyService.create(soClient, esClient, {
          name: 'No is_managed provided',
          namespace: 'default',
        })
      ).resolves.toHaveProperty('is_managed', false);

      const [, attributes] = soClient.create.mock.calls[0];
      expect(attributes).toHaveProperty('is_managed', false);
    });

    it('should set is_managed property, if given', async () => {
      // ignore unrelated unique name constraint
      jest.spyOn(agentPolicyService, 'requireUniqueName').mockResolvedValue(undefined);
      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await expect(
        agentPolicyService.create(soClient, esClient, {
          name: 'is_managed: true provided',
          namespace: 'default',
          is_managed: true,
        })
      ).resolves.toHaveProperty('is_managed', true);

      const [, attributes] = soClient.create.mock.calls[0];
      expect(attributes).toHaveProperty('is_managed', true);
    });

    it('should call audit logger', async () => {
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const soClient = createSavedObjectClientMock();

      soClient.find.mockResolvedValueOnce({
        total: 0,
        saved_objects: [],
        per_page: 0,
        page: 1,
      });

      soClient.create.mockResolvedValueOnce({
        id: 'test-agent-policy',
        type: AGENT_POLICY_SAVED_OBJECT_TYPE,
        attributes: {
          name: 'test',
        },
        references: [],
      });

      mockOutputsHelpers.validateOutputForPolicy.mockResolvedValueOnce(undefined);

      await agentPolicyService.create(
        soClient,
        esClient,
        {
          name: 'test',
          namespace: 'default',
        },
        { id: 'test-agent-policy' }
      );

      expect(mockedAuditLoggingService.writeCustomSoAuditLog).toHaveBeenCalledWith({
        action: 'create',
        name: 'test',
        id: 'test-agent-policy',
        savedObjectType: AGENT_POLICY_SAVED_OBJECT_TYPE,
      });
    });

    it('should write to the correct saved object-type if user opt-in for space awerness', async () => {
      jest.mocked(isSpaceAwarenessEnabled).mockResolvedValue(true);
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const soClient = createSavedObjectClientMock();

      soClient.find.mockResolvedValueOnce({
        total: 0,
        saved_objects: [],
        per_page: 0,
        page: 1,
      });

      soClient.create.mockResolvedValueOnce({
        id: 'test-agent-policy',
        type: AGENT_POLICY_SAVED_OBJECT_TYPE,
        attributes: {},
        references: [],
      });

      mockOutputsHelpers.validateOutputForPolicy.mockResolvedValueOnce(undefined);

      await agentPolicyService.create(
        soClient,
        esClient,
        {
          name: 'test',
          namespace: 'default',
        },
        { id: 'test-agent-policy' }
      );
      expect(soClient.create).toBeCalledWith(
        AGENT_POLICY_SAVED_OBJECT_TYPE,
        expect.anything(),
        expect.anything()
      );
      expect(mockedAuditLoggingService.writeCustomSoAuditLog).toHaveBeenCalledWith({
        action: 'create',
        id: 'test-agent-policy',
        name: 'test',
        savedObjectType: AGENT_POLICY_SAVED_OBJECT_TYPE,
      });
    });

    it('should throw FleetUnauthorizedError if is_protected=true with insufficient license', async () => {
      jest.spyOn(licenseService, 'hasAtLeast').mockReturnValue(false);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      await expect(
        agentPolicyService.create(soClient, esClient, {
          name: 'test',
          namespace: 'default',
          is_protected: true,
        })
      ).rejects.toThrowError(
        new FleetUnauthorizedError('Tamper protection requires Platinum license')
      );
    });

    it('should not throw FleetUnauthorizedError if is_protected=false with insufficient license', async () => {
      jest.spyOn(licenseService, 'hasAtLeast').mockReturnValue(false);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      await expect(
        agentPolicyService.create(soClient, esClient, {
          name: 'test',
          namespace: 'default',
        })
      ).resolves.not.toThrowError(
        new FleetUnauthorizedError('Tamper protection requires Platinum license')
      );
    });

    it('should throw AgentPolicyInvalidError if support_agentless is defined in stateful without agentless enabled', async () => {
      jest
        .spyOn(appContextService, 'getCloud')
        .mockReturnValue({ isServerlessEnabled: false } as any);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      await expect(
        agentPolicyService.create(soClient, esClient, {
          name: 'test',
          namespace: 'default',
          supports_agentless: true,
        })
      ).rejects.toThrowError(
        new AgentPolicyInvalidError(
          'supports_agentless is only allowed in serverless and cloud environments that support the agentless feature'
        )
      );
    });

    it('should throw AgentPolicyInvalidError if agentless is disabled in serverless', async () => {
      jest
        .spyOn(appContextService, 'getCloud')
        .mockReturnValue({ isServerlessEnabled: true } as any);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      await expect(
        agentPolicyService.create(soClient, esClient, {
          name: 'test',
          namespace: 'default',
          supports_agentless: true,
        })
      ).rejects.toThrowError(
        new AgentPolicyInvalidError(
          'supports_agentless is only allowed in serverless and cloud environments that support the agentless feature'
        )
      );
    });

    it('should create an agentless policy when agentless config is set and in serverless env', async () => {
      jest
        .spyOn(appContextService, 'getConfig')
        .mockReturnValue({ agentless: { enabled: true } } as any);
      jest
        .spyOn(appContextService, 'getCloud')
        .mockReturnValue({ isServerlessEnabled: true } as any);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.find.mockResolvedValueOnce({
        total: 0,
        saved_objects: [],
        per_page: 0,
        page: 1,
      });

      const res = await agentPolicyService.create(soClient, esClient, {
        name: 'test',
        namespace: 'default',
        supports_agentless: true,
      });
      expect(res).toEqual(
        expect.objectContaining({
          id: 'mocked',
          name: 'test',
          namespace: 'default',
          supports_agentless: true,
          status: 'active',
          is_managed: false,
          revision: 1,
          updated_at: expect.anything(),
          updated_by: 'system',
          schema_version: '1.1.1',
          is_protected: false,
          fleet_server_host_id: 'default-fleet-server-internal',
        })
      );
    });

    it('should create a policy if agentless feature flag is set and in cloud env', async () => {
      jest.spyOn(appContextService, 'getCloud').mockReturnValue({ isCloudEnabled: true } as any);
      jest.spyOn(appContextService, 'getConfig').mockReturnValue({
        agentless: { enabled: true },
      } as any);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.find.mockResolvedValueOnce({
        total: 0,
        saved_objects: [],
        per_page: 0,
        page: 1,
      });

      const res = await agentPolicyService.create(soClient, esClient, {
        name: 'test',
        namespace: 'default',
        supports_agentless: true,
      });
      expect(res).toEqual(
        expect.objectContaining({
          id: 'mocked',
          name: 'test',
          namespace: 'default',
          supports_agentless: true,
          status: 'active',
          is_managed: false,
          revision: 1,
          updated_at: expect.anything(),
          updated_by: 'system',
          schema_version: '1.1.1',
          is_protected: false,
          fleet_server_host_id: 'internal-agentless-fleet-server',
        })
      );
    });

    it('should create an agentless policy with a fallback fleet_server_host_id if not provided', async () => {
      jest
        .spyOn(appContextService, 'getConfig')
        .mockReturnValue({ agentless: { enabled: true } } as any);
      jest
        .spyOn(appContextService, 'getCloud')
        .mockReturnValue({ isServerlessEnabled: true } as any);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.find.mockResolvedValueOnce({
        total: 0,
        saved_objects: [],
        per_page: 0,
        page: 1,
      });

      const res = await agentPolicyService.create(soClient, esClient, {
        name: 'test',
        namespace: 'default',
        supports_agentless: true,
      });
      expect(res).toEqual(
        expect.objectContaining({
          id: 'mocked',
          name: 'test',
          namespace: 'default',
          supports_agentless: true,
          status: 'active',
          is_managed: false,
          revision: 1,
          updated_at: expect.anything(),
          updated_by: 'system',
          schema_version: '1.1.1',
          is_protected: false,
          fleet_server_host_id: 'default-fleet-server-internal',
        })
      );
    });

    it('should throw error when attempting to create policy with supports_agentless true on cloud environment that does not support the agentless feature', async () => {
      jest.spyOn(appContextService, 'getConfig').mockReturnValue({
        agentless: { enabled: false },
      } as any);

      jest
        .spyOn(appContextService, 'getCloud')
        .mockReturnValue({ isCloudEnabled: true, isServerlessEnabled: false } as any);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      await expect(
        agentPolicyService.create(soClient, esClient, {
          name: 'test',
          namespace: 'default',
          supports_agentless: true,
        })
      ).rejects.toThrowError(
        new AgentPolicyInvalidError(
          'supports_agentless is only allowed in serverless and cloud environments that support the agentless feature'
        )
      );
    });

    it('should throw FleetError when given an invalid id', async () => {
      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      await expect(
        agentPolicyService.create(
          soClient,
          esClient,
          { name: 'test', namespace: 'default' },
          { id: '../bad-id' }
        )
      ).rejects.toThrow('id is not valid');
    });

    it('should throw error when attempting to create policy with supports_agentless true on serverless environment that does not support the agentless feature', async () => {
      jest
        .spyOn(appContextService, 'getExperimentalFeatures')
        .mockReturnValue({ agentless: false } as any);

      jest
        .spyOn(appContextService, 'getCloud')
        .mockReturnValue({ isCloudEnabled: false, isServerlessEnabled: true } as any);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      await expect(
        agentPolicyService.create(soClient, esClient, {
          name: 'test',
          namespace: 'default',
          supports_agentless: true,
        })
      ).rejects.toThrowError(
        new AgentPolicyInvalidError(
          'supports_agentless is only allowed in serverless and cloud environments that support the agentless feature'
        )
      );
    });

    it('should not generate uninstall token for agentless policies', async () => {
      jest.spyOn(appContextService, 'getConfig').mockReturnValue({
        agentless: { enabled: true },
      } as any);
      jest
        .spyOn(appContextService, 'getCloud')
        .mockReturnValue({ isServerlessEnabled: false, isCloudEnabled: true } as any);

      const generateTokenForPolicyId = jest.fn().mockResolvedValue(undefined);
      mockedAppContextService.getUninstallTokenService.mockReturnValueOnce({
        scoped: jest.fn().mockReturnValue({ generateTokenForPolicyId }),
      } as unknown as UninstallTokenServiceInterface);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      await agentPolicyService.create(soClient, esClient, {
        name: 'test agentless policy',
        namespace: 'default',
        supports_agentless: true,
      });

      expect(generateTokenForPolicyId).not.toHaveBeenCalled();
    });

    it('should generate uninstall token for non-agentless policies', async () => {
      const generateTokenForPolicyId = jest.fn().mockResolvedValue(undefined);
      mockedAppContextService.getUninstallTokenService.mockReturnValueOnce({
        scoped: jest.fn().mockReturnValue({ generateTokenForPolicyId }),
      } as unknown as UninstallTokenServiceInterface);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      await agentPolicyService.create(soClient, esClient, {
        name: 'test regular policy',
        namespace: 'default',
      });

      expect(generateTokenForPolicyId).toHaveBeenCalled();
    });
  });

  describe('createWithPackagePolicies', () => {
    let deleteSpy: any;
    beforeEach(() => {
      deleteSpy = jest.spyOn(agentPolicyService, 'delete');
    });

    afterEach(() => {
      deleteSpy.mockRestore();
    });
    it('should create an agent policy with package policies', async () => {
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const mockAgentPolicy = {
        name: 'Test Agent Policy',
        namespace: 'default',
        description: 'A test agent policy with package policies',
        is_managed: false,
        supports_agentless: true,
      };
      const mockPackagePolicy = {
        name: 'Test Package Policy',
        policy_ids: [],
        package: { name: 'test-package', title: 'Test Package', version: '1.0.0' },
        inputs: [],
        enabled: true,
      };

      mockedCreateAgentPolicyWithPackages.mockResolvedValue({
        ...mockAgentPolicy,
        id: 'test-agent-policy',
      } as any);
      mockedPackagePolicyService.create.mockResolvedValue(mockPackagePolicy as any);
      soClient.bulkGet.mockResolvedValueOnce({
        saved_objects: [
          {
            id: 'test-agent-policy',
            attributes: {
              name: mockAgentPolicy.name,
            },
          },
        ],
      } as any);
      const agentPolicy = await agentPolicyService.createWithPackagePolicies({
        soClient,
        esClient,
        agentPolicy: mockAgentPolicy,
        packagePolicies: [mockPackagePolicy],
        options: { withSysMonitoring: true, spaceId: 'default' },
      });

      expect(agentPolicy.name).toEqual(mockAgentPolicy.name);
    });

    it('should throw error if a package policy creation fails and delete all policies', async () => {
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      mockedAppContextService.getInternalUserSOClient.mockReturnValue(soClient);
      mockedAppContextService.getInternalUserESClient.mockReturnValue(esClient);

      const mockAgentPolicy = {
        name: 'Test Agent Policy',
        namespace: 'default',
        description: 'A test agent policy with package policies',
        is_managed: false,
        supports_agentless: true,
      };
      const mockAgentPolicyId = 'test-agent-policy-id';
      const mockPackagePolicy1 = {
        name: 'Test Package Policy 1',
        policy_ids: [],
        package: { name: 'test-package1', title: 'Test Package1', version: '1.0.0' },
        inputs: [],
        enabled: true,
      };
      const packagePolicy1Id = 'package-policy-1-id';

      const mockPackagePolicy2 = {
        name: 'Test Package Policy 2',
        policy_ids: [],
        package: { name: 'test-package2', title: 'Test Package2', version: '1.0.0' },
        inputs: [],
        enabled: true,
      };

      const mockError = new Error('Package policy creation failed');

      mockedCreateAgentPolicyWithPackages.mockResolvedValue({
        id: mockAgentPolicyId,
        ...mockAgentPolicy,
      } as any);
      mockedPackagePolicyService.create.mockImplementation(
        (_soClient, _esClient, packagePolicy) => {
          if (packagePolicy.name === 'Test Package Policy 2') {
            throw mockError;
          } else {
            return Promise.resolve({ id: packagePolicy1Id, ...packagePolicy } as any);
          }
        }
      );

      deleteSpy.mockResolvedValueOnce({ id: mockAgentPolicyId, name: mockAgentPolicy.name });

      let error;

      try {
        await agentPolicyService.createWithPackagePolicies({
          soClient,
          esClient,
          agentPolicy: mockAgentPolicy,
          packagePolicies: [mockPackagePolicy1, mockPackagePolicy2],
          options: { withSysMonitoring: true, spaceId: 'default' },
        });
      } catch (e) {
        error = e;
      }

      expect(error).toEqual(mockError);
      expect(deleteSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        mockAgentPolicyId,
        expect.anything()
      );
      expect(mockedPackagePolicyService.delete).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        [packagePolicy1Id],
        expect.anything()
      );
    });
  });

  // TODO: Add more test coverage to `get` service method
  describe('get', () => {
    it('should call audit logger', async () => {
      const soClient = createSavedObjectClientMock();

      soClient.bulkGet.mockResolvedValueOnce({
        saved_objects: [
          {
            id: 'test-agent-policy',
            attributes: {
              name: 'Test',
            },
            references: [],
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
          },
        ],
      });

      await agentPolicyService.get(soClient, 'test-agent-policy', false);

      expect(mockedAuditLoggingService.writeCustomSoAuditLog).toBeCalledWith({
        action: 'get',
        id: 'test-agent-policy',
        name: 'Test',
        savedObjectType: AGENT_POLICY_SAVED_OBJECT_TYPE,
      });
    });
  });

  describe('getByIds', () => {
    it('should call audit logger', async () => {
      const soClient = createSavedObjectClientMock();

      soClient.bulkGet.mockResolvedValueOnce({
        saved_objects: [
          {
            id: 'test-agent-policy-1',
            attributes: {
              name: 'Test 1',
            },
            references: [],
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
          },
          {
            id: 'test-agent-policy-2',
            attributes: {
              name: 'Test 2',
            },
            references: [],
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
          },
        ],
      });

      await agentPolicyService.getByIds(soClient, ['test-agent-policy-1', 'test-agent-policy-2']);

      expect(mockedAuditLoggingService.writeCustomSoAuditLog).toHaveBeenNthCalledWith(1, {
        action: 'get',
        id: 'test-agent-policy-1',
        name: 'Test 1',
        savedObjectType: AGENT_POLICY_SAVED_OBJECT_TYPE,
      });

      expect(mockedAuditLoggingService.writeCustomSoAuditLog).toHaveBeenNthCalledWith(2, {
        action: 'get',
        id: 'test-agent-policy-2',
        name: 'Test 2',
        savedObjectType: AGENT_POLICY_SAVED_OBJECT_TYPE,
      });
    });
  });

  describe('list', () => {
    it('should call audit logger', async () => {
      const soClient = createSavedObjectClientMock();

      soClient.find.mockResolvedValueOnce({
        total: 2,
        saved_objects: [
          {
            id: 'test-agent-policy-1',
            attributes: {
              name: 'Test 1',
            },
            references: [],
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
            score: 0,
          },
          {
            id: 'test-agent-policy-2',
            attributes: {
              name: 'Test 2',
            },
            references: [],
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
            score: 0,
          },
        ],
        per_page: 0,
        page: 1,
      });

      await agentPolicyService.list(soClient, {
        page: 1,
        perPage: 10,
        kuery: '',
      });

      expect(mockedAuditLoggingService.writeCustomSoAuditLog).toHaveBeenNthCalledWith(1, {
        action: 'find',
        id: 'test-agent-policy-1',
        name: 'Test 1',
        savedObjectType: AGENT_POLICY_SAVED_OBJECT_TYPE,
      });

      expect(mockedAuditLoggingService.writeCustomSoAuditLog).toHaveBeenNthCalledWith(2, {
        action: 'find',
        id: 'test-agent-policy-2',
        name: 'Test 2',
        savedObjectType: AGENT_POLICY_SAVED_OBJECT_TYPE,
      });
    });
  });

  describe('delete', () => {
    let soClient: ReturnType<typeof savedObjectsClientMock.create>;
    let esClient: ReturnType<typeof elasticsearchServiceMock.createClusterClient>['asInternalUser'];

    beforeEach(() => {
      soClient = getSavedObjectMock({ revision: 1, name: 'Test', package_policies: ['package-1'] });
      mockedPackagePolicyService.findAllForAgentPolicy.mockReturnValue([
        {
          id: 'package-1',
        },
      ] as any);
      esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      (getAgentsByKuery as jest.Mock).mockResolvedValue({
        agents: [],
        total: 0,
        page: 1,
        perPage: 10,
      });
      mockedPackagePolicyService.create.mockReset();
    });

    it('should throw error for agent policy which has managed package policy', async () => {
      mockedPackagePolicyService.findAllForAgentPolicy.mockReturnValue([
        {
          id: 'package-1',
          is_managed: true,
        },
      ] as any);
      try {
        await agentPolicyService.delete(soClient, esClient, 'mocked');
      } catch (e) {
        expect(e.message).toEqual(
          new PackagePolicyRestrictionRelatedError(
            `Cannot delete agent policy mocked that contains managed package policies`
          ).message
        );
      }
    });

    it('should allow delete with force for agent policy which has managed package policy', async () => {
      mockedPackagePolicyService.findAllForAgentPolicy.mockReturnValue([
        {
          id: 'package-1',
          is_managed: true,
        },
      ] as any);
      const response = await agentPolicyService.delete(soClient, esClient, 'mocked', {
        force: true,
      });
      expect(response.id).toEqual('mocked');
    });

    it('should call audit logger', async () => {
      await agentPolicyService.delete(soClient, esClient, 'mocked');

      expect(mockedAuditLoggingService.writeCustomSoAuditLog).toHaveBeenCalledWith({
        action: 'delete',
        id: 'mocked',
        name: 'Test',
        savedObjectType: AGENT_POLICY_SAVED_OBJECT_TYPE,
      });
    });

    it('should throw error if active agents are assigned to the policy', async () => {
      (getAgentsByKuery as jest.Mock).mockResolvedValue({
        agents: [],
        total: 2,
        page: 1,
        perPage: 10,
      });
      await expect(agentPolicyService.delete(soClient, esClient, 'mocked')).rejects.toThrowError(
        'Cannot delete an agent policy that is assigned to any active or inactive agents'
      );
    });

    it('should delete .fleet-policies entries on agent policy delete', async () => {
      esClient.deleteByQuery.mockResolvedValueOnce({
        deleted: 2,
      });

      await agentPolicyService.delete(soClient, esClient, 'mocked');

      expect(esClient.deleteByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          index: AGENT_POLICY_INDEX,
          query: {
            term: {
              policy_id: 'mocked',
            },
          },
        })
      );
    });

    it('should only delete package polices that are not shared with other agent policies', async () => {
      mockedPackagePolicyService.findAllForAgentPolicy.mockReturnValue([
        {
          id: 'package-1',
          policy_id: ['policy_1'],
          policy_ids: ['policy_1', 'int_policy_2'],
        },
        {
          id: 'package-2',
          policy_id: ['policy_1'],
          policy_ids: ['policy_1'],
        },
        {
          id: 'package-3',
        },
      ] as any);
      await agentPolicyService.delete(soClient, esClient, 'policy_1');
      expect(mockedPackagePolicyService.delete).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        ['package-2', 'package-3'],
        expect.anything()
      );
      expect(mockedPackagePolicyService.bulkUpdate).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        [
          {
            id: 'package-1',
            policy_id: 'int_policy_2',
            policy_ids: ['int_policy_2'],
          },
        ]
      );
    });
  });

  describe('bumpRevision', () => {
    beforeEach(() => {
      mockedPackagePolicyService.findAllForAgentPolicy.mockResolvedValue([]);
    });

    it('should call agentPolicyUpdateEventHandler with updated event once', async () => {
      const soClient = getSavedObjectMock({
        revision: 1,
        monitoring_enabled: ['metrics'],
      });
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      await agentPolicyService.bumpRevision(soClient, esClient, 'agent-policy');

      expect(agentPolicyUpdateEventHandler).toHaveBeenCalledTimes(1);
    });

    it('should compute and persist min_agent_version using the highest minimum from package policy version conditions', async () => {
      const soClient = getSavedObjectMock({ revision: 1, monitoring_enabled: [] });
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      mockedPackagePolicyService.findAllForAgentPolicy.mockResolvedValue([
        {
          id: 'pp-1',
          package: { name: 'apache', title: 'Apache', version: '1.3.2' },
          package_agent_version_condition: '>=9.3.0',
        } as any,
        {
          id: 'pp-2',
          package: { name: 'nginx', title: 'Nginx', version: '1.0.0' },
          package_agent_version_condition: '>=8.0.0',
        } as any,
      ]);

      await agentPolicyService.bumpRevision(soClient, esClient, 'agent-policy');

      expect(soClient.update).toHaveBeenCalledWith(
        expect.anything(),
        'agent-policy',
        expect.objectContaining({
          has_agent_version_conditions: true,
          // 9.3.0 is the highest minimum version across both conditions
          min_agent_version: '9.3.0',
          package_agent_version_conditions: [
            { name: 'apache', title: 'Apache', version_condition: '>=9.3.0' },
            { name: 'nginx', title: 'Nginx', version_condition: '>=8.0.0' },
          ],
        })
      );
    });

    it('should persist null min_agent_version when no package policies have version conditions', async () => {
      const soClient = getSavedObjectMock({ revision: 1, monitoring_enabled: [] });
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      // Omit `package` so that no EPM fallback lookup is triggered
      mockedPackagePolicyService.findAllForAgentPolicy.mockResolvedValue([
        {
          id: 'pp-1',
          package_agent_version_condition: undefined,
        } as any,
      ]);

      await agentPolicyService.bumpRevision(soClient, esClient, 'agent-policy');

      expect(soClient.update).toHaveBeenCalledWith(
        expect.anything(),
        'agent-policy',
        expect.objectContaining({
          has_agent_version_conditions: false,
          min_agent_version: null,
          package_agent_version_conditions: null,
        })
      );
    });
  });

  describe('bumpAllAgentPoliciesForOutput', () => {
    it('should call scheduleDeployAgentPoliciesTask with updated event once', async () => {
      const soClient = getSavedObjectMock({
        revision: 1,
        monitoring_enabled: ['metrics'],
      });
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValueOnce(
        soClient
      );
      await agentPolicyService.bumpAllAgentPoliciesForOutput(esClient, 'output-id-123');

      expect(scheduleDeployAgentPoliciesTask).toHaveBeenCalledTimes(1);
    });

    it('should include policies inheriting default data output when isDefault is true', async () => {
      jest.mocked(isSpaceAwarenessEnabled).mockResolvedValue(false);

      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.find.mockResolvedValueOnce({
        saved_objects: [
          {
            id: 'policy-inheriting',
            type: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
            attributes: { revision: 1 },
            score: 1,
            references: [],
          },
        ],
        total: 1,
        per_page: 10000,
        page: 1,
      } as any);

      soClient.find.mockResolvedValueOnce({
        saved_objects: [],
        total: 0,
        per_page: 10000,
        page: 1,
      } as any);

      soClient.bulkUpdate.mockResolvedValue({ saved_objects: [] } as any);

      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValue(
        soClient
      );

      await agentPolicyService.bumpAllAgentPoliciesForOutput(esClient, 'output-id-123', {
        isDefault: true,
      });

      expect(soClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining(
            `NOT ${LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE}.attributes.data_output_id:*`
          ),
        })
      );
      expect(soClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.not.stringContaining('monitoring_output_id:*'),
        })
      );
    });

    it('should include policies inheriting default monitoring output when isDefaultMonitoring is true', async () => {
      jest.mocked(isSpaceAwarenessEnabled).mockResolvedValue(false);

      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.find.mockResolvedValueOnce({
        saved_objects: [],
        total: 0,
        per_page: 10000,
        page: 1,
      } as any);

      soClient.find.mockResolvedValueOnce({
        saved_objects: [],
        total: 0,
        per_page: 10000,
        page: 1,
      } as any);

      soClient.bulkUpdate.mockResolvedValue({ saved_objects: [] } as any);

      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValue(
        soClient
      );

      await agentPolicyService.bumpAllAgentPoliciesForOutput(esClient, 'output-id-123', {
        isDefaultMonitoring: true,
      });

      expect(soClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining(
            `NOT ${LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE}.attributes.monitoring_output_id:*`
          ),
        })
      );
      expect(soClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.not.stringContaining(
            `NOT ${LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE}.attributes.data_output_id:*`
          ),
        })
      );
    });

    it('should only match explicit references when no default flags are set', async () => {
      jest.mocked(isSpaceAwarenessEnabled).mockResolvedValue(false);

      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.find.mockResolvedValueOnce({
        saved_objects: [],
        total: 0,
        per_page: 10000,
        page: 1,
      } as any);

      soClient.find.mockResolvedValueOnce({
        saved_objects: [],
        total: 0,
        per_page: 10000,
        page: 1,
      } as any);

      soClient.bulkUpdate.mockResolvedValue({ saved_objects: [] } as any);

      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValue(
        soClient
      );

      await agentPolicyService.bumpAllAgentPoliciesForOutput(esClient, 'output-id-123');

      const findCall = soClient.find.mock.calls[0][0] as any;
      expect(findCall.filter).toContain('data_output_id:"output-id-123"');
      expect(findCall.filter).toContain('monitoring_output_id:"output-id-123"');
      expect(findCall.filter).not.toContain('NOT');
    });

    it('should handle package policies using output when space awareness is not enabled', async () => {
      jest.mocked(isSpaceAwarenessEnabled).mockResolvedValue(false);

      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      // Mock find for agent policies
      soClient.find.mockResolvedValueOnce({
        saved_objects: [
          {
            id: 'policy-1',
            type: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
            attributes: {
              revision: 1,
              data_output_id: 'output-id-123',
            },
            score: 1,
            references: [],
          },
        ],
        total: 1,
        per_page: 10000,
        page: 1,
      } as any);

      // Mock find for package policies
      soClient.find.mockResolvedValueOnce({
        saved_objects: [
          {
            id: 'package-policy-1',
            type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
            attributes: {
              output_id: 'output-id-123',
              policy_ids: ['policy-2'],
            },
            score: 1,
            references: [],
          },
        ],
        total: 1,
        per_page: 10000,
        page: 1,
      } as any);

      // Mock bulkGet for agent policies of package policies
      soClient.bulkGet.mockResolvedValueOnce({
        saved_objects: [
          {
            id: 'policy-2',
            type: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
            attributes: {
              revision: 2,
            },
            references: [],
          },
        ],
      } as any);

      soClient.bulkUpdate.mockResolvedValue({
        saved_objects: [],
      } as any);

      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValue(
        soClient
      );

      await agentPolicyService.bumpAllAgentPoliciesForOutput(esClient, 'output-id-123');

      // Verify bulkGet was called without namespaces parameter when space awareness is disabled
      expect(soClient.bulkGet).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
            id: 'policy-2',
            fields: ['revision', 'data_output_id', 'monitoring_output_id', 'namespaces'],
          }),
        ])
      );
      expect(soClient.bulkGet).toHaveBeenCalledWith(
        expect.not.arrayContaining([
          expect.objectContaining({
            namespaces: expect.anything(),
          }),
        ])
      );
    });

    it('should offload the bump to a background task when above the async threshold', async () => {
      jest.mocked(isSpaceAwarenessEnabled).mockResolvedValue(false);

      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      // 101 policies, just above BUMP_AGENT_POLICIES_ASYNC_THRESHOLD (100)
      soClient.find.mockResolvedValueOnce({
        saved_objects: Array.from({ length: 101 }, (_, i) => ({
          id: `policy-${i}`,
          type: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
          attributes: { revision: 1 },
          score: 1,
          references: [],
        })),
        total: 101,
        per_page: 10000,
        page: 1,
      } as any);

      soClient.find.mockResolvedValueOnce({
        saved_objects: [],
        total: 0,
        per_page: 10000,
        page: 1,
      } as any);

      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValue(
        soClient
      );

      await agentPolicyService.bumpAllAgentPoliciesForOutput(esClient, 'output-id-123');

      // The bulk Saved Objects update must not run on the request thread...
      expect(soClient.bulkUpdate).not.toHaveBeenCalled();
      expect(scheduleDeployAgentPoliciesTask).not.toHaveBeenCalled();
      // ...it is offloaded to the background task instead.
      expect(scheduleBumpAgentPoliciesByIdTask).toHaveBeenCalledTimes(1);
      const scheduledPolicies = jest.mocked(scheduleBumpAgentPoliciesByIdTask).mock.calls[0][1];
      expect(scheduledPolicies).toHaveLength(101);
      expect(scheduledPolicies).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'policy-0' })])
      );
    });

    it('should bump inline when at or below the async threshold', async () => {
      jest.mocked(isSpaceAwarenessEnabled).mockResolvedValue(false);

      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.find.mockResolvedValueOnce({
        saved_objects: [
          {
            id: 'policy-1',
            type: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
            attributes: { revision: 1 },
            score: 1,
            references: [],
          },
        ],
        total: 1,
        per_page: 10000,
        page: 1,
      } as any);

      soClient.find.mockResolvedValueOnce({
        saved_objects: [],
        total: 0,
        per_page: 10000,
        page: 1,
      } as any);

      soClient.bulkUpdate.mockResolvedValue({ saved_objects: [] } as any);

      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValue(
        soClient
      );

      await agentPolicyService.bumpAllAgentPoliciesForOutput(esClient, 'output-id-123');

      expect(soClient.bulkUpdate).toHaveBeenCalledTimes(1);
      expect(scheduleDeployAgentPoliciesTask).toHaveBeenCalledTimes(1);
      expect(scheduleBumpAgentPoliciesByIdTask).not.toHaveBeenCalled();
    });
  });

  describe('removeOutputFromAll', () => {
    let mockedAgentPolicyServiceUpdate: jest.SpyInstance<
      ReturnType<(typeof agentPolicyService)['update']>
    >;
    beforeEach(() => {
      mockedAgentPolicyServiceUpdate = jest
        .spyOn(agentPolicyService, 'update')
        .mockResolvedValue({} as any);
    });

    afterEach(() => {
      mockedAgentPolicyServiceUpdate.mockRestore();
    });
    it('should update policies using deleted output', async () => {
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      soClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: 'test1',
            attributes: {
              data_output_id: 'output-id-123',
              monitoring_output_id: 'output-id-another-output',
            },
          },
          {
            id: 'test2',
            attributes: {
              data_output_id: 'output-id-another-output',
              monitoring_output_id: 'output-id-123',
            },
          },
        ],
      } as any);
      soClient.bulkGet.mockImplementation(async (objects): Promise<any> => {
        if (objects.some(({ id }) => id === 'test1')) {
          return {
            saved_objects: [
              {
                id: 'test1',
                attributes: {
                  data_output_id: 'output-id-123',
                  monitoring_output_id: 'output-id-another-output',
                },
              },
            ],
          };
        }
        if (objects.some(({ id }) => id === 'test2')) {
          return {
            saved_objects: [
              {
                id: 'test2',
                attributes: {
                  data_output_id: 'output-id-another-output',
                  monitoring_output_id: 'output-id-123',
                },
              },
            ],
          };
        }

        return { saved_objects: [] };
      });
      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValue(
        soClient
      );
      mockedAppContextService.getInternalUserSOClientForSpaceId.mockReturnValue(soClient);
      await agentPolicyService.removeOutputFromAll(esClient, 'output-id-123');

      expect(mockedAgentPolicyServiceUpdate).toHaveBeenCalledTimes(2);
      expect(mockedAgentPolicyServiceUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test1',
        { data_output_id: null, monitoring_output_id: 'output-id-another-output' },
        { skipValidation: true }
      );
      expect(mockedAgentPolicyServiceUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test2',
        { data_output_id: 'output-id-another-output', monitoring_output_id: null },
        { skipValidation: true }
      );
    });
  });

  describe('removeDefaultSourceFromAll', () => {
    let mockedAgentPolicyServiceUpdate: jest.SpyInstance<
      ReturnType<(typeof agentPolicyService)['update']>
    >;
    beforeEach(() => {
      mockedAgentPolicyServiceUpdate = jest
        .spyOn(agentPolicyService, 'update')
        .mockResolvedValue({} as any);
    });

    afterEach(() => {
      mockedAgentPolicyServiceUpdate.mockRestore();
    });

    it('should update policies using deleted download source host', async () => {
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      mockedDownloadSourceService.getDefaultDownloadSourceId.mockResolvedValue(
        'default-download-source-id'
      );
      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValue(
        soClient
      );
      mockedAppContextService.getInternalUserSOClientForSpaceId.mockReturnValue(soClient);
      soClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: 'test-ds-1',
            attributes: {
              download_source_id: 'ds-id-1',
            },
          },
          {
            id: 'test-ds-2',
            attributes: {
              download_source_id: 'default-download-source-id',
            },
          },
        ],
      } as any);

      await agentPolicyService.removeDefaultSourceFromAll(esClient, 'default-download-source-id');

      expect(mockedAgentPolicyServiceUpdate).toHaveBeenCalledTimes(2);
      expect(mockedAgentPolicyServiceUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test-ds-1',
        { download_source_id: 'ds-id-1' }
      );
      expect(mockedAgentPolicyServiceUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test-ds-2',
        { download_source_id: null }
      );
    });
  });

  describe('bumpAllAgentPoliciesForDownloadSource', () => {
    it('should call scheduleDeployAgentPoliciesTask with updated event once', async () => {
      const soClient = getSavedObjectMock({
        revision: 1,
        monitoring_enabled: ['metrics'],
      });
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValueOnce(
        soClient
      );
      await agentPolicyService.bumpAllAgentPoliciesForDownloadSource(esClient, 'test-id-1');

      expect(scheduleDeployAgentPoliciesTask).toHaveBeenCalledTimes(1);
    });

    it('should include policies inheriting default when isDefault is true', async () => {
      jest.mocked(isSpaceAwarenessEnabled).mockResolvedValue(false);

      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.find.mockResolvedValueOnce({
        saved_objects: [],
        total: 0,
        per_page: 10000,
        page: 1,
      } as any);

      soClient.bulkUpdate.mockResolvedValue({ saved_objects: [] } as any);

      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValue(
        soClient
      );

      await agentPolicyService.bumpAllAgentPoliciesForDownloadSource(esClient, 'ds-id-123', {
        isDefault: true,
      });

      expect(soClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining(
            `NOT ${LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE}.attributes.download_source_id:*`
          ),
        })
      );
    });

    it('should only match explicit references when no default flag is set', async () => {
      jest.mocked(isSpaceAwarenessEnabled).mockResolvedValue(false);

      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.find.mockResolvedValueOnce({
        saved_objects: [],
        total: 0,
        per_page: 10000,
        page: 1,
      } as any);

      soClient.bulkUpdate.mockResolvedValue({ saved_objects: [] } as any);

      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValue(
        soClient
      );

      await agentPolicyService.bumpAllAgentPoliciesForDownloadSource(esClient, 'ds-id-123');

      const findCall = soClient.find.mock.calls[0][0] as any;
      expect(findCall.filter).toContain('download_source_id:"ds-id-123"');
      expect(findCall.filter).not.toContain('NOT');
    });
  });

  describe('bumpAllAgentPoliciesForFleetServerHosts', () => {
    it('should include policies inheriting default when isDefault is true', async () => {
      jest.mocked(isSpaceAwarenessEnabled).mockResolvedValue(false);

      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.find.mockResolvedValueOnce({
        saved_objects: [],
        total: 0,
        per_page: 10000,
        page: 1,
      } as any);

      soClient.bulkUpdate.mockResolvedValue({ saved_objects: [] } as any);

      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValue(
        soClient
      );

      await agentPolicyService.bumpAllAgentPoliciesForFleetServerHosts(esClient, 'fsh-id-123', {
        isDefault: true,
      });

      expect(soClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining(
            `NOT ${LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE}.attributes.fleet_server_host_id:*`
          ),
          namespaces: ['*'],
        })
      );
    });

    it('should only match explicit references when no default flag is set', async () => {
      jest.mocked(isSpaceAwarenessEnabled).mockResolvedValue(false);

      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.find.mockResolvedValueOnce({
        saved_objects: [],
        total: 0,
        per_page: 10000,
        page: 1,
      } as any);

      soClient.bulkUpdate.mockResolvedValue({ saved_objects: [] } as any);

      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValue(
        soClient
      );

      await agentPolicyService.bumpAllAgentPoliciesForFleetServerHosts(esClient, 'fsh-id-123');

      const findCall = soClient.find.mock.calls[0][0] as any;
      expect(findCall.filter).toContain('fleet_server_host_id:"fsh-id-123"');
      expect(findCall.filter).not.toContain('NOT');
      expect(findCall.namespaces).toEqual(['*']);
    });
  });

  describe('update', () => {
    it('should update is_managed property, if given', async () => {
      // ignore unrelated unique name constraint
      jest.spyOn(agentPolicyService, 'requireUniqueName').mockResolvedValue(undefined);
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: {},
            id: 'mocked',
            type: 'mocked',
            references: [],
          },
        ],
      });
      await agentPolicyService.update(soClient, esClient, 'mocked', {
        name: 'mocked',
        namespace: 'default',
        is_managed: false,
      });
      // soClient.update is called with updated values
      let calledWith = soClient.update.mock.calls[0];
      expect(calledWith[2]).toHaveProperty('is_managed', false);

      await agentPolicyService.update(soClient, esClient, 'mocked', {
        name: 'is_managed: true provided',
        namespace: 'default',
        is_managed: true,
      });
      // soClient.update is called with updated values
      calledWith = soClient.update.mock.calls[1];
      expect(calledWith[2]).toHaveProperty('is_managed', true);
    });

    it('should throw a HostedAgentRestrictionRelated error if user enables "is_protected" for a managed policy', async () => {
      jest.spyOn(licenseService, 'hasAtLeast').mockReturnValue(true);
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: { is_managed: true },
            id: 'mocked',
            type: 'mocked',
            references: [],
          },
        ],
      });

      await expect(
        agentPolicyService.update(soClient, esClient, 'test-id', {
          is_protected: true,
        })
      ).rejects.toThrowError(
        new HostedAgentPolicyRestrictionRelatedError('Cannot update is_protected')
      );
    });

    it('should throw a HostedAgentPolicyRestrictionRelatedError if user tries to update namespace for a managed policy', async () => {
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: { is_managed: true },
            id: 'mocked',
            type: 'mocked',
            references: [],
          },
        ],
      });

      await expect(
        agentPolicyService.update(soClient, esClient, 'test-id', {
          namespace: 'test-namespace',
        })
      ).rejects.toThrowError(
        new HostedAgentPolicyRestrictionRelatedError('Cannot update namespace')
      );
    });
    it('should not throw if user tries to update namespace for a managed policy with option force', async () => {
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: { is_managed: true },
            id: 'mocked',
            type: 'mocked',
            references: [],
          },
        ],
      });

      await expect(
        agentPolicyService.update(
          soClient,
          esClient,
          'test-id',
          {
            namespace: 'test-namespace',
          },
          { force: true }
        )
      ).resolves.not.toThrowError(
        new HostedAgentPolicyRestrictionRelatedError('Cannot update namespace')
      );
    });

    it('should call audit logger', async () => {
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: {
              name: 'Test',
            },
            references: [],
            id: 'test-agent-policy',
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
          },
        ],
      });

      await agentPolicyService.update(soClient, esClient, 'test-agent-policy', {
        name: 'Test Agent Policy',
        namespace: 'default',
        is_managed: false,
      });

      expect(mockedAuditLoggingService.writeCustomSoAuditLog).toHaveBeenCalledWith({
        action: 'update',
        name: 'Test',
        id: 'test-agent-policy',
        savedObjectType: AGENT_POLICY_SAVED_OBJECT_TYPE,
      });
    });

    it('should throw FleetUnauthorizedError if is_protected=true with insufficient license', async () => {
      jest.spyOn(licenseService, 'hasAtLeast').mockReturnValue(false);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: {},
            id: 'test-id',
            type: 'mocked',
            references: [],
          },
        ],
      });

      await expect(
        agentPolicyService.update(soClient, esClient, 'test-id', {
          name: 'test',
          namespace: 'default',
          is_protected: true,
        })
      ).rejects.toThrowError(
        new FleetUnauthorizedError('Tamper protection requires Platinum license')
      );
    });

    it('should not throw FleetUnauthorizedError if is_protected=false with insufficient license', async () => {
      jest.spyOn(licenseService, 'hasAtLeast').mockReturnValue(false);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: {},
            id: 'test-id',
            type: 'mocked',
            references: [],
          },
        ],
      });

      await expect(
        agentPolicyService.update(soClient, esClient, 'test-id', {
          name: 'test',
          namespace: 'default',
        })
      ).resolves.not.toThrowError(
        new FleetUnauthorizedError('Tamper protection requires Platinum license')
      );
    });

    it('should throw Error if is_protected=true with invalid uninstall token', async () => {
      jest.spyOn(licenseService, 'hasAtLeast').mockReturnValue(true);

      mockedAppContextService.getUninstallTokenService.mockReturnValueOnce({
        checkTokenValidityForPolicy: jest
          .fn()
          .mockResolvedValueOnce({ error: new Error('reason') }),
      } as unknown as UninstallTokenServiceInterface);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: {},
            id: 'test-id',
            type: 'mocked',
            references: [],
          },
        ],
      });

      await expect(
        agentPolicyService.update(soClient, esClient, 'test-id', {
          name: 'test',
          namespace: 'default',
          is_protected: true,
        })
      ).rejects.toThrowError(new Error('Cannot enable Agent Tamper Protection: reason'));
    });

    it('should not throw AgentPolicyInvalidError if support_agentless is defined in stateful', async () => {
      jest.spyOn(appContextService, 'getConfig').mockReturnValue({
        agentless: { enabled: true },
      } as any);
      jest
        .spyOn(appContextService, 'getCloud')
        .mockReturnValue({ isServerlessEnabled: false, isCloudEnabled: true } as any);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: {},
            id: 'test-id',
            type: 'mocked',
            references: [],
          },
        ],
      });

      await expect(
        agentPolicyService.update(soClient, esClient, 'test-id', {
          name: 'test',
          namespace: 'default',
          supports_agentless: true,
        })
      ).resolves.not.toThrow();
    });

    it('should not throw AgentPolicyInvalidError if support_agentless is defined in serverless', async () => {
      jest.spyOn(appContextService, 'getConfig').mockReturnValue({
        agentless: { enabled: true },
      } as any);
      jest
        .spyOn(appContextService, 'getCloud')
        .mockReturnValue({ isServerlessEnabled: true, isCloudEnabled: false } as any);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: {},
            id: 'test-id',
            type: 'mocked',
            references: [],
          },
        ],
      });

      await expect(
        agentPolicyService.update(soClient, esClient, 'test-id', {
          name: 'test',
          namespace: 'default',
          supports_agentless: true,
        })
      ).resolves.not.toThrow();
    });

    it('should not throw in serverless if support_agentless and agentless config is set', async () => {
      jest
        .spyOn(appContextService, 'getConfig')
        .mockReturnValue({ agentless: { enabled: true } } as any);
      jest
        .spyOn(appContextService, 'getCloud')
        .mockReturnValue({ isServerlessEnabled: true } as any);

      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: {},
            id: 'test-id',
            type: 'mocked',
            references: [],
          },
        ],
      });

      await expect(
        agentPolicyService.update(soClient, esClient, 'test-id', {
          name: 'test',
          namespace: 'default',
          supports_agentless: true,
        })
      ).resolves.not.toThrow();
    });

    it('should run external "agentPolicyPostUpdate" callbacks when update is successful', async () => {
      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      const postUpdateCallback = jest.fn(async (policy) => policy);
      mockedAppContextService.getExternalCallbacks.mockImplementation((type) => {
        if (type === 'agentPolicyPostUpdate') {
          return new Set([postUpdateCallback]);
        }
      });

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: {},
            id: 'test-id',
            type: 'mocked',
            references: [],
          },
        ],
      });

      await expect(
        agentPolicyService.update(soClient, esClient, 'test-id', {
          name: 'test',
          namespace: 'default',
        })
      ).resolves.not.toThrow();

      expect(mockedAppContextService.getExternalCallbacks).toHaveBeenCalledWith(
        'agentPolicyPostUpdate'
      );

      expect(postUpdateCallback).toHaveBeenCalled();
    });

    it('should compute and persist has_agent_version_conditions from existing package policies', async () => {
      jest.spyOn(agentPolicyService, 'requireUniqueName').mockResolvedValue(undefined);
      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [{ attributes: {}, id: 'agent-policy', type: 'mocked', references: [] }],
      });

      mockedPackagePolicyService.findAllForAgentPolicy.mockResolvedValue([
        {
          id: 'pp-1',
          package: { name: 'apache', title: 'Apache', version: '1.3.2' },
          package_agent_version_condition: '>=9.3.0',
        } as any,
      ]);

      await agentPolicyService.update(soClient, esClient, 'agent-policy', {
        name: 'updated',
        namespace: 'default',
      });

      expect(soClient.update).toHaveBeenCalledWith(
        expect.anything(),
        'agent-policy',
        expect.objectContaining({ has_agent_version_conditions: true })
      );
    });

    it('should persist has_agent_version_conditions: false when no package policies have version conditions', async () => {
      jest.spyOn(agentPolicyService, 'requireUniqueName').mockResolvedValue(undefined);
      const soClient = getAgentPolicyCreateMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [{ attributes: {}, id: 'agent-policy', type: 'mocked', references: [] }],
      });

      // global beforeEach already mocks findAllForAgentPolicy to return []
      await agentPolicyService.update(soClient, esClient, 'agent-policy', {
        name: 'updated',
        namespace: 'default',
      });

      expect(soClient.update).toHaveBeenCalledWith(
        expect.anything(),
        'agent-policy',
        expect.objectContaining({ has_agent_version_conditions: false })
      );
    });
  });

  describe('copy', () => {
    let soClient: ReturnType<typeof savedObjectsClientMock.create>;
    let esClient: ReturnType<typeof elasticsearchServiceMock.createClusterClient>['asInternalUser'];

    beforeEach(() => {
      soClient = getSavedObjectMock({ revision: 1, package_policies: ['package-1'] });
      esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
    });

    it('should throw error for agent policy which has managed package policy', async () => {
      mockedPackagePolicyService.findAllForAgentPolicy.mockReturnValue([
        {
          id: 'package-1',
          is_managed: true,
        },
      ] as any);
      try {
        await agentPolicyService.copy(soClient, esClient, 'mocked', {
          name: 'copy mocked',
        });
      } catch (e) {
        expect(e.message).toEqual(
          new PackagePolicyRestrictionRelatedError(
            `Cannot copy an agent policy mocked that contains managed package policies`
          ).message
        );
      }
    });

    it('should link shared package policies', async () => {
      jest.spyOn(agentPolicyService, 'requireUniqueName').mockResolvedValue(undefined);
      soClient = createSavedObjectClientMock();
      const mockPolicy = {
        type: AGENT_POLICY_SAVED_OBJECT_TYPE,
        references: [],
        attributes: { revision: 1, package_policies: ['package-1'] } as any,
      };
      soClient.bulkGet.mockImplementation(async (objects) => {
        return {
          saved_objects: objects.map(({ id }) => {
            return {
              id,
              ...mockPolicy,
            };
          }),
        };
      });
      soClient.find
        .mockImplementationOnce(async () => ({
          saved_objects: [
            {
              id: 'agent-policy-id',
              score: 1,
              ...{ ...mockPolicy, name: 'mocked-policy' },
            },
          ],
          total: 1,
          page: 1,
          per_page: 1,
        }))
        .mockImplementationOnce(async () => ({
          saved_objects: [
            {
              id: 'agent-policy-id-copy',
              score: 1,
              ...{ ...mockPolicy, name: 'mocked-policy' },
            },
          ],
          total: 1,
          page: 1,
          per_page: 1,
        }));
      soClient.create.mockImplementation(async (type, attributes) => {
        return {
          attributes: attributes as unknown as NewAgentPolicy,
          id: 'mocked',
          type: 'mocked',
          references: [],
        };
      });
      const packagePolicies = [
        {
          id: 'package-1',
          name: 'package-1',
          policy_id: 'policy_1',
          policy_ids: ['policy_1', 'policy_2'],
        },
        {
          id: 'package-2',
          name: 'package-2',
          policy_id: 'policy_1',
          policy_ids: ['policy_1'],
        },
      ] as any;
      mockedPackagePolicyService.findAllForAgentPolicy.mockReturnValue(packagePolicies);
      mockedPackagePolicyService.list.mockResolvedValue({ items: packagePolicies } as any);
      await agentPolicyService.copy(soClient, esClient, 'mocked', {
        name: 'copy mocked',
      });
      expect(mockedPackagePolicyService.bulkCreate).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        [
          {
            name: 'package-2 (copy)',
            policy_id: 'policy_1',
            policy_ids: ['mocked'],
          },
        ],
        expect.anything()
      );
      expect(mockedPackagePolicyService.bulkUpdate).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        [
          {
            id: 'package-1',
            name: 'package-1',
            policy_id: 'policy_1',
            policy_ids: ['policy_1', 'policy_2', 'mocked'],
          },
        ]
      );
    });

    it('should remove copied endpoint package policy input ids before bulk create', async () => {
      jest.spyOn(agentPolicyService, 'requireUniqueName').mockResolvedValue(undefined);
      soClient = createSavedObjectClientMock();
      const mockPolicy = {
        type: AGENT_POLICY_SAVED_OBJECT_TYPE,
        references: [],
        attributes: { revision: 1, package_policies: ['package-1'] } as any,
      };
      soClient.bulkGet.mockImplementation(async (objects) => {
        return {
          saved_objects: objects.map(({ id }) => {
            return {
              id,
              ...mockPolicy,
            };
          }),
        };
      });
      soClient.create.mockImplementation(async (type, attributes) => {
        return {
          attributes: attributes as unknown as NewAgentPolicy,
          id: 'mocked',
          type: 'mocked',
          references: [],
        };
      });
      const packagePolicies = [
        {
          id: 'package-1',
          name: 'endpoint-1',
          policy_id: 'policy_1',
          policy_ids: ['policy_1'],
          package: {
            name: 'endpoint',
            title: 'Elastic Endpoint',
            version: '1.0.0',
          },
          inputs: [
            {
              id: 'stale-input-id',
              type: 'endpoint',
              enabled: true,
              streams: [
                {
                  id: 'stale-stream-id',
                  enabled: true,
                  data_stream: { type: 'logs', dataset: 'endpoint.events' },
                },
              ],
            },
          ],
        },
      ] as any;
      mockedPackagePolicyService.findAllForAgentPolicy.mockReturnValue(packagePolicies);
      mockedPackagePolicyService.list.mockResolvedValue({ items: packagePolicies } as any);

      await agentPolicyService.copy(soClient, esClient, 'mocked', {
        name: 'copy mocked',
      });

      const copiedPackagePolicies = mockedPackagePolicyService.bulkCreate.mock.calls[0][2];

      expect(copiedPackagePolicies[0].inputs).toEqual([
        {
          type: 'endpoint',
          enabled: true,
          streams: [
            {
              enabled: true,
              data_stream: { type: 'logs', dataset: 'endpoint.events' },
            },
          ],
        },
      ]);
      expect(copiedPackagePolicies[0]).toEqual(
        expect.objectContaining({
          name: 'endpoint-1 (copy)',
          policy_ids: ['mocked'],
        })
      );
    });
  });

  describe('deployPolicy', () => {
    beforeEach(() => {
      mockedGetFullAgentPolicy.mockReset();
    });
    it('should not create a .fleet-policy document if we cannot get the full policy', async () => {
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      mockedAppContextService.getInternalUserESClient.mockReturnValue(esClient);
      mockedOutputService.getDefaultDataOutputId.mockResolvedValue('default-output');
      mockedGetFullAgentPolicy.mockResolvedValue(null);

      const mockFleetServerHost = {
        id: 'id1',
        name: 'fleet server 1',
        host_urls: ['https://host1.fr:8220', 'https://host2-with-a-longer-name.fr:8220'],
        is_default: false,
        is_preconfigured: false,
      };
      soClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: 'existing-fleet-server-host',
            type: 'fleet-fleet-server-host',
            score: 1,
            references: [],
            version: '1.0.0',
            attributes: mockFleetServerHost,
          },
        ],
        page: 0,
        per_page: 0,
        total: 0,
      });

      const mockSo = {
        attributes: {},
        id: 'policy123',
        type: 'mocked',
        references: [],
      };
      soClient.bulkGet.mockResolvedValue({
        saved_objects: [mockSo],
      });
      await agentPolicyService.deployPolicy(soClient, 'policy123');

      expect(esClient.create).not.toBeCalled();
    });

    it('should create a .fleet-policy document if we can get the full policy', async () => {
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      mockedAppContextService.getInternalUserESClient.mockReturnValue(esClient);
      mockedOutputService.getDefaultDataOutputId.mockResolvedValue('default-output');
      mockedGetFullAgentPolicy.mockResolvedValue({
        id: 'policy123',
        revision: 1,
        namespaces: ['mySpace'],
        inputs: [
          {
            id: 'input-123',
          },
        ],
      } as FullAgentPolicy);

      const mockSo = {
        attributes: { revision: 1 },
        id: 'policy123',
        type: 'mocked',
        references: [],
      };
      const mockFleetServerHost = {
        id: 'id1',
        name: 'fleet server 1',
        host_urls: ['https://host1.fr:8220', 'https://host2-with-a-longer-name.fr:8220'],
        is_default: false,
        is_preconfigured: false,
      };
      soClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: 'existing-fleet-server-host',
            type: 'fleet-fleet-server-host',
            score: 1,
            references: [],
            version: '1.0.0',
            attributes: mockFleetServerHost,
          },
        ],
        page: 0,
        per_page: 0,
        total: 0,
      });
      soClient.bulkGet.mockResolvedValue({
        saved_objects: [mockSo],
      });
      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [{ _source: { policy_id: 'policy123', revision_idx: 1 } }],
        },
      } as any);
      await agentPolicyService.deployPolicy(soClient, 'policy123');

      expect(esClient.bulk).toBeCalledWith(
        expect.objectContaining({
          index: AGENT_POLICY_INDEX,
          operations: [
            expect.objectContaining({
              index: {
                _id: expect.anything(),
              },
            }),
            expect.objectContaining({
              '@timestamp': expect.anything(),
              data: {
                id: 'policy123',
                inputs: [{ id: 'input-123' }],
                revision: 1,
                namespaces: ['mySpace'],
              },
              default_fleet_server: false,
              policy_id: 'policy123',
              revision_idx: 1,
              namespaces: ['mySpace'],
            }),
          ],
          refresh: 'wait_for',
        })
      );

      const spans = otelExporter.getFinishedSpans();
      const span = spans.find((s) => s.name === 'deploy-policies');
      expect(span).toBeDefined();
      expect(span!.attributes['transaction.type']).toBe('fleet');
      expect(span!.status.code).not.toBe(SpanStatusCode.ERROR);
    });

    it('should call audit logger', async () => {
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const soClient = createSavedObjectClientMock();

      mockedAppContextService.getInternalUserESClient.mockReturnValue(esClient);
      mockedOutputService.getDefaultDataOutputId.mockResolvedValueOnce('default-output');

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: {},
            references: [],
            id: 'test-agent-policy',
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
          },
        ],
      });

      await agentPolicyService.deployPolicy(soClient, 'test-agent-policy');

      expect(mockedAuditLoggingService.writeCustomAuditLog).toHaveBeenCalledWith({
        message: `User deploying policy [id=test-agent-policy]`,
      });
    });

    it('should call agentless API for agentless policies', async () => {
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      mockedAppContextService.getInternalUserESClient.mockReturnValue(esClient);
      mockedOutputService.getDefaultDataOutputId.mockResolvedValueOnce('default-output');
      mockedGetFullAgentPolicy.mockResolvedValue({
        id: 'test-agentless-policy',
        revision: 1,
        namespaces: ['mySpace'],
        inputs: [
          {
            id: 'input-123',
          },
        ],
      } as FullAgentPolicy);
      const mockFleetServerHost = {
        id: 'id1',
        name: 'fleet server 1',
        host_urls: ['https://host1.fr:8220', 'https://host2-with-a-longer-name.fr:8220'],
        is_default: false,
        is_preconfigured: false,
      };
      soClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: 'existing-fleet-server-host',
            type: 'fleet-fleet-server-host',
            score: 1,
            references: [],
            version: '1.0.0',
            attributes: mockFleetServerHost,
          },
        ],
        page: 0,
        per_page: 0,
        total: 0,
      });

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: {
              supports_agentless: true,
            },
            references: [],
            id: 'test-agentless-policy',
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
          },
        ],
      });

      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [{ _source: { policy_id: 'test-agentless-policy', revision_idx: 1 } }],
        },
      } as any);

      jest.spyOn(agentlessAgentService, 'createAgentlessAgent');

      await agentPolicyService.deployPolicy(soClient, 'test-agentless-policy');
      expect(esClient.bulk).toBeCalled();
      expect(jest.mocked(agentlessAgentService.createAgentlessAgent)).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          id: 'test-agentless-policy',
        })
      );
    });

    it('should throw on error during agentless API calls for agentless policies', async () => {
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      jest
        .mocked(agentlessAgentService.createAgentlessAgent)
        .mockRejectedValueOnce(new Error('createAgentlessAgent error'));
      mockedAppContextService.getInternalUserESClient.mockReturnValue(esClient);
      mockedOutputService.getDefaultDataOutputId.mockResolvedValueOnce('default-output');
      mockedGetFullAgentPolicy.mockResolvedValue({
        id: 'test-agentless-policy',
        revision: 1,
        namespaces: ['mySpace'],
        inputs: [
          {
            id: 'input-123',
          },
        ],
      } as FullAgentPolicy);
      const mockFleetServerHost = {
        id: 'id1',
        name: 'fleet server 1',
        host_urls: ['https://host1.fr:8220', 'https://host2-with-a-longer-name.fr:8220'],
        is_default: false,
        is_preconfigured: false,
      };
      soClient.find.mockResolvedValue({
        saved_objects: [
          {
            id: 'existing-fleet-server-host',
            type: 'fleet-fleet-server-host',
            score: 1,
            references: [],
            version: '1.0.0',
            attributes: mockFleetServerHost,
          },
        ],
        page: 0,
        per_page: 0,
        total: 0,
      });

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          {
            attributes: {
              supports_agentless: true,
            },
            references: [],
            id: 'test-agentless-policy',
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
          },
        ],
      });

      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [{ _source: { policy_id: 'test-agentless-policy', revision_idx: 1 } }],
        },
      } as any);

      jest.spyOn(agentlessAgentService, 'createAgentlessAgent');

      await expect(
        agentPolicyService.deployPolicy(soClient, 'test-agentless-policy', undefined, {
          throwOnAgentlessError: true,
        })
      ).rejects.toThrow('createAgentlessAgent error');
    });

    it('should log a warning when .fleet-policies revision does not match .kibana_ingest revision after deploy', async () => {
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      mockedAppContextService.getInternalUserESClient.mockReturnValue(esClient);
      mockedOutputService.getDefaultDataOutputId.mockResolvedValue('default-output');
      mockedGetFullAgentPolicy.mockResolvedValue({
        id: 'policy123',
        revision: 2,
        namespaces: ['default'],
        inputs: [{ id: 'input-1' }],
      } as FullAgentPolicy);

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          { attributes: { revision: 2 }, id: 'policy123', type: 'mocked', references: [] },
        ],
      });
      soClient.find.mockResolvedValue({
        saved_objects: [],
        page: 0,
        per_page: 0,
        total: 0,
      });

      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [{ _source: { policy_id: 'policy123', revision_idx: 1 } }],
        },
        aggregations: {
          policies: { buckets: [{ key: 'policy123', latest_revision: { value: 1 } }] },
        },
      } as any);

      await agentPolicyService.deployPolicy(soClient, 'policy123');

      expect(mockedLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Policy [policy123] has mismatched revisions after deploy')
      );
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('.kibana_ingest revision [2]')
      );
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('.fleet-policies revision_idx [1]')
      );
    });

    it('should not log a warning when .fleet-policies revision matches .kibana_ingest revision after deploy', async () => {
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      mockedAppContextService.getInternalUserESClient.mockReturnValue(esClient);
      mockedOutputService.getDefaultDataOutputId.mockResolvedValue('default-output');
      mockedGetFullAgentPolicy.mockResolvedValue({
        id: 'policy123',
        revision: 2,
        namespaces: ['default'],
        inputs: [{ id: 'input-1' }],
      } as FullAgentPolicy);

      soClient.bulkGet.mockResolvedValue({
        saved_objects: [
          { attributes: { revision: 2 }, id: 'policy123', type: 'mocked', references: [] },
        ],
      });
      soClient.find.mockResolvedValue({
        saved_objects: [],
        page: 0,
        per_page: 0,
        total: 0,
      });

      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [{ _source: { policy_id: 'policy123', revision_idx: 2 } }],
        },
        aggregations: {
          policies: { buckets: [{ key: 'policy123', latest_revision: { value: 2 } }] },
        },
      } as any);

      await agentPolicyService.deployPolicy(soClient, 'policy123');

      expect(mockedLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('has mismatched revisions after deploy')
      );
    });
  });

  describe('ensurePreconfiguredAgentPolicy', () => {
    it('should use preconfigured id if provided for policy', async () => {
      const soClient = createSavedObjectClientMock();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      const preconfiguredAgentPolicy: PreconfiguredAgentPolicy = {
        id: 'my-unique-id',
        name: 'My Preconfigured Policy',
        package_policies: [
          {
            name: 'my-package-policy',
            id: 'my-package-policy-id',
            package: {
              name: 'test-package',
            },
          },
        ],
      };

      soClient.find.mockResolvedValueOnce({ total: 0, saved_objects: [], page: 1, per_page: 10 });
      soClient.bulkGet.mockRejectedValueOnce({ saved_objects: [] });

      soClient.create.mockResolvedValueOnce({
        id: 'my-unique-id',
        type: AGENT_POLICY_SAVED_OBJECT_TYPE,
        attributes: {},
        references: [],
      });

      await agentPolicyService.ensurePreconfiguredAgentPolicy(
        soClient,
        esClient,
        preconfiguredAgentPolicy
      );

      expect(soClient.create).toHaveBeenCalledWith(
        AGENT_POLICY_SAVED_OBJECT_TYPE,
        expect.anything(),
        expect.objectContaining({ id: 'my-unique-id' })
      );
    });
  });

  describe('getInactivityTimeouts', () => {
    const createPolicySO = (id: string, inactivityTimeout: number) => ({
      id,
      type: AGENT_POLICY_SAVED_OBJECT_TYPE,
      attributes: { inactivity_timeout: inactivityTimeout },
      references: [],
      score: 1,
    });

    const createMockSoClientThatReturns = (policies: Array<ReturnType<typeof createPolicySO>>) => {
      const mockSoClient = createSavedObjectClientMock();
      mockSoClient.find.mockResolvedValue({
        saved_objects: policies,
        page: 1,
        per_page: 10,
        total: policies.length,
      });
      return mockSoClient;
    };

    it('should return empty array if no policies with inactivity timeouts', async () => {
      const mockSoClient = createMockSoClientThatReturns([]);
      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValueOnce(
        mockSoClient
      );
      expect(await agentPolicyService.getInactivityTimeouts()).toEqual([]);
    });
    it('should return single inactivity timeout', async () => {
      const mockSoClient = createMockSoClientThatReturns([createPolicySO('policy1', 1000)]);
      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValueOnce(
        mockSoClient
      );
      expect(await agentPolicyService.getInactivityTimeouts()).toEqual([
        { inactivityTimeout: 1000, policyIds: ['policy1'] },
      ]);
    });
    it('should return group policies with same inactivity timeout', async () => {
      const mockSoClient = createMockSoClientThatReturns([
        createPolicySO('policy1', 1000),
        createPolicySO('policy2', 1000),
      ]);
      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValueOnce(
        mockSoClient
      );

      expect(await agentPolicyService.getInactivityTimeouts()).toEqual([
        { inactivityTimeout: 1000, policyIds: ['policy1', 'policy2'] },
      ]);
    });
    it('should return handle single and grouped policies', async () => {
      const mockSoClient = createMockSoClientThatReturns([
        createPolicySO('policy1', 1000),
        createPolicySO('policy2', 1000),
        createPolicySO('policy3', 2000),
      ]);
      mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValueOnce(
        mockSoClient
      );
      expect(await agentPolicyService.getInactivityTimeouts()).toEqual([
        { inactivityTimeout: 1000, policyIds: ['policy1', 'policy2'] },
        { inactivityTimeout: 2000, policyIds: ['policy3'] },
      ]);
    });
  });

  describe('Fetch Agent Policies Methods', () => {
    const soList = Array.from({ length: 2 }, () => ({
      updated_at: '2020-01-01T00:00:00.000Z',
    }));

    const createSOMock = (soResult?: []) => {
      return {
        saved_objects: !soResult
          ? soList.map((soAttributes) => {
              return {
                score: 1,
                id: 'so-123',
                type: AGENT_POLICY_SAVED_OBJECT_TYPE,
                version: 'abc',
                updated_at: soAttributes.updated_at,
                attributes: soAttributes,
                references: [],
                sort: ['created_at'],
              };
            })
          : soResult,
        total: soList.length,
        per_page: 10,
        page: 1,
        pit_id: 'pit-id-1',
      };
    };

    describe('fetchAllAgentPolicyIds()', () => {
      let soClientMock: ReturnType<typeof savedObjectsClientMock.create>;

      beforeEach(() => {
        soClientMock = createSavedObjectClientMock();

        soClientMock.find
          .mockResolvedValueOnce(createSOMock())
          .mockResolvedValueOnce(createSOMock())
          .mockResolvedValueOnce(createSOMock([]));
      });

      it('should return an iterator', async () => {
        expect(await agentPolicyService.fetchAllAgentPolicyIds(soClientMock)).toEqual({
          [Symbol.asyncIterator]: expect.any(Function),
        });
      });

      it('should provide item ids on every iteration', async () => {
        for await (const ids of await agentPolicyService.fetchAllAgentPolicyIds(soClientMock)) {
          expect(ids).toEqual(['so-123', 'so-123']);
        }

        expect(soClientMock.find).toHaveBeenCalledTimes(3);
      });

      it('should use default options', async () => {
        for await (const ids of await agentPolicyService.fetchAllAgentPolicyIds(soClientMock)) {
          expect(ids);
        }

        expect(soClientMock.find).toHaveBeenCalledWith(
          expect.objectContaining({
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
            perPage: 1000,
            sortField: 'updated_at',
            sortOrder: 'asc',
            fields: ['id', 'name'],
            filter: undefined,
          })
        );
      });

      it('should use custom options when defined', async () => {
        for await (const ids of await agentPolicyService.fetchAllAgentPolicyIds(soClientMock, {
          perPage: 13,
          kuery: 'one=two',
        })) {
          expect(ids);
        }

        expect(soClientMock.find).toHaveBeenCalledWith(
          expect.objectContaining({
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
            perPage: 13,
            sortField: 'updated_at',
            sortOrder: 'asc',
            fields: ['id', 'name'],
            filter: 'one=two',
          })
        );
      });
    });

    describe('fetchAllItems()', () => {
      let soClientMock: ReturnType<typeof savedObjectsClientMock.create>;

      beforeEach(() => {
        soClientMock = createSavedObjectClientMock();

        soClientMock.find
          .mockResolvedValueOnce(createSOMock())
          .mockResolvedValueOnce(createSOMock())
          .mockResolvedValueOnce(createSOMock([]));
      });

      it('should return an iterator', async () => {
        expect(await agentPolicyService.fetchAllAgentPolicies(soClientMock)).toEqual({
          [Symbol.asyncIterator]: expect.any(Function),
        });
      });

      it('should provide items on every iteration', async () => {
        for await (const items of await agentPolicyService.fetchAllAgentPolicies(soClientMock)) {
          expect(items.map((item) => item.id)).toEqual(soList.map((_so) => 'so-123'));
        }

        expect(soClientMock.find).toHaveBeenCalledTimes(3);
      });

      it('should use default options', async () => {
        for await (const ids of await agentPolicyService.fetchAllAgentPolicies(soClientMock)) {
          expect(ids);
        }

        expect(soClientMock.find).toHaveBeenCalledWith(
          expect.objectContaining({
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
            perPage: 1000,
            sortField: 'updated_at',
            sortOrder: 'asc',
            fields: [],
            filter: undefined,
          })
        );
      });

      it('should use new saved object if user opt-in for space awareness', async () => {
        jest.mocked(isSpaceAwarenessEnabled).mockResolvedValue(true);
        for await (const ids of await agentPolicyService.fetchAllAgentPolicies(soClientMock)) {
          expect(ids);
        }

        expect(soClientMock.find).toHaveBeenCalledWith(
          expect.objectContaining({
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
            perPage: 1000,
            sortField: 'updated_at',
            sortOrder: 'asc',
            fields: [],
            filter: undefined,
          })
        );
      });

      it('should use custom options when defined', async () => {
        for await (const ids of await agentPolicyService.fetchAllAgentPolicies(soClientMock, {
          kuery: 'one=two',
          perPage: 12,
          sortOrder: 'desc',
          sortField: 'updated_by',
        })) {
          expect(ids);
        }

        expect(soClientMock.find).toHaveBeenCalledWith(
          expect.objectContaining({
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
            perPage: 12,
            sortField: 'updated_by',
            sortOrder: 'desc',
            filter: 'one=two',
          })
        );
      });
    });
  });

  describe('turnOffAgentTamperProtections', () => {
    const createPolicySO = (id: string, isProtected: boolean, error?: SavedObjectError) => ({
      id,
      type: AGENT_POLICY_SAVED_OBJECT_TYPE,
      attributes: {
        is_protected: isProtected,
      },
      references: [],
      score: 1,
      ...(error ? { error } : {}),
    });

    const generateAgentPolicy = (id: string, isProtected: boolean): AgentPolicy => ({
      id,
      is_protected: isProtected,
      updated_at: '2020-01-01T00:00:00.000Z',
      updated_by: 'user',
      revision: 1,
      name: 'test',
      namespace: 'default',
      status: 'active',
      is_managed: false,
    });

    const getMockAgentPolicyFetchAllAgentPolicies = (items: AgentPolicy[]) =>
      jest.fn().mockResolvedValue(
        jest.fn(async function* () {
          yield items;
        })()
      );

    it('should return if all policies are compliant', async () => {
      const mockSoClient = createSavedObjectClientMock();

      jest.spyOn(agentPolicyService, 'fetchAllAgentPolicies').mockReturnValue([] as any);

      expect(await agentPolicyService.turnOffAgentTamperProtections(mockSoClient)).toEqual({
        failedPolicies: [],
        updatedPolicies: null,
      });
      expect(mockSoClient.bulkUpdate).not.toHaveBeenCalled();
    });

    it('should bulk update policies that are not compliant', async () => {
      const mockSoClient = createSavedObjectClientMock();

      agentPolicyService.fetchAllAgentPolicies = getMockAgentPolicyFetchAllAgentPolicies([
        generateAgentPolicy('policy1', true),
        generateAgentPolicy('policy2', true),
      ]);

      mockSoClient.bulkUpdate.mockResolvedValueOnce({
        saved_objects: [createPolicySO('policy1', false), createPolicySO('policy2', false)],
      });

      const expectedResponse = expect.arrayContaining([
        expect.objectContaining({
          id: 'policy1',
          attributes: expect.objectContaining({ is_protected: false }),
        }),
        expect.objectContaining({
          id: 'policy2',
          attributes: expect.objectContaining({ is_protected: false }),
        }),
      ]);

      expect(await agentPolicyService.turnOffAgentTamperProtections(mockSoClient)).toEqual({
        failedPolicies: [],
        updatedPolicies: expectedResponse,
      });

      expect(mockSoClient.bulkUpdate).toHaveBeenCalledWith(expectedResponse);
    });

    it('should return failed policies if bulk update fails', async () => {
      const mockSoClient = createSavedObjectClientMock();

      agentPolicyService.fetchAllAgentPolicies = getMockAgentPolicyFetchAllAgentPolicies([
        generateAgentPolicy('policy1', true),
        generateAgentPolicy('policy2', true),
        generateAgentPolicy('policy3', false),
      ]);

      mockSoClient.bulkUpdate.mockResolvedValueOnce({
        saved_objects: [
          createPolicySO('policy1', false, { error: 'Oops!', message: 'Ooops!', statusCode: 500 }),
          createPolicySO('policy2', false),
        ],
      });
      expect(await agentPolicyService.turnOffAgentTamperProtections(mockSoClient)).toEqual({
        failedPolicies: [
          expect.objectContaining({
            id: 'policy1',
            error: expect.objectContaining({ message: 'Ooops!' }),
          }),
        ],
        updatedPolicies: [expect.objectContaining({ id: 'policy2' })],
      });
    });
  });

  describe('deleteFleetServerPoliciesForPolicyId', () => {
    it('should call audit logger', async () => {
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      esClient.deleteByQuery.mockResolvedValueOnce({} as any);

      await agentPolicyService.deleteFleetServerPoliciesForPolicyId(esClient, 'test-agent-policy');

      expect(mockedAuditLoggingService.writeCustomAuditLog).toHaveBeenCalledWith({
        message: 'User deleting policy [id=test-agent-policy]',
      });
    });

    it('should call deleteByQuery multiple time if there is more than 10000 .fleet-policies', async () => {
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

      esClient.deleteByQuery.mockResolvedValueOnce({
        deleted: SO_SEARCH_LIMIT,
      });
      esClient.deleteByQuery.mockResolvedValueOnce({
        deleted: 10,
      });

      await agentPolicyService.deleteFleetServerPoliciesForPolicyId(esClient, 'test-agent-policy');

      expect(esClient.deleteByQuery).toBeCalledTimes(2);
    });
  });

  describe('requireUniqueName', () => {
    const getAllSpacesSoClientSpy = jest.spyOn(
      appContextService,
      'getInternalUserSOClientWithoutSpaceExtension'
    );
    beforeAll(() => {
      jest.spyOn(agentPolicyService, 'requireUniqueName').mockRestore();
    });

    const testAgentPolicy = {
      id: 'policy1',
      name: 'unique-policy-name',
      space_ids: ['default'],
    };
    it('should not throw error when no policies with same name exist', async () => {
      const allSpacesSoClient = createSavedObjectClientMock();
      getAllSpacesSoClientSpy.mockReturnValue(allSpacesSoClient);
      const soClient = createSavedObjectClientMock();
      allSpacesSoClient.find.mockResolvedValue({
        total: 0,
        saved_objects: [],
        page: 1,
        per_page: 10,
      });

      await expect(
        agentPolicyService.requireUniqueName(soClient, testAgentPolicy)
      ).resolves.not.toThrow();

      expect(allSpacesSoClient.find).toHaveBeenCalledWith({
        type: AGENT_POLICY_SAVED_OBJECT_TYPE,
        searchFields: ['name'],
        search: `\"${testAgentPolicy.name}\"`,
        namespaces: testAgentPolicy.space_ids,
      });
    });

    it('should not throw error when the only other policy with the same name is the current policy', async () => {
      const allSpacesSoClient = createSavedObjectClientMock();
      getAllSpacesSoClientSpy.mockReturnValue(allSpacesSoClient);
      const soClient = createSavedObjectClientMock();
      allSpacesSoClient.find.mockResolvedValue({
        total: 1,
        saved_objects: [
          {
            id: testAgentPolicy.id,
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
            attributes: { name: testAgentPolicy.name },
            references: [],
            score: 1,
          },
        ],
        page: 1,
        per_page: 10,
      });

      await expect(
        agentPolicyService.requireUniqueName(soClient, testAgentPolicy)
      ).resolves.not.toThrow();

      expect(allSpacesSoClient.find).toHaveBeenCalledWith({
        type: AGENT_POLICY_SAVED_OBJECT_TYPE,
        searchFields: ['name'],
        search: `\"${testAgentPolicy.name}\"`,
        namespaces: testAgentPolicy.space_ids,
      });
    });

    it('should throw an error when policies exist with the same name', async () => {
      const otherAgentPolicy = {
        ...testAgentPolicy,
        id: 'other-agent-policy',
      };
      const allSpacesSoClient = createSavedObjectClientMock();
      getAllSpacesSoClientSpy.mockReturnValue(allSpacesSoClient);
      const soClient = createSavedObjectClientMock();
      allSpacesSoClient.find.mockResolvedValue({
        total: 1,
        saved_objects: [
          {
            id: otherAgentPolicy.id,
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
            attributes: { name: testAgentPolicy.name },
            references: [],
            score: 1,
          },
        ],
        page: 1,
        per_page: 10,
      });

      await expect(
        agentPolicyService.requireUniqueName(soClient, testAgentPolicy)
      ).rejects.toThrow();

      expect(allSpacesSoClient.find).toHaveBeenCalledWith({
        type: AGENT_POLICY_SAVED_OBJECT_TYPE,
        searchFields: ['name'],
        search: `\"${testAgentPolicy.name}\"`,
        namespaces: testAgentPolicy.space_ids,
      });
    });

    it('should not throw error when a same-name policy exists only in the URL space but the new policy targets a different space', async () => {
      const singleOtherSpacePolicy = {
        id: 'policy-in-other-space',
        name: 'shared-name',
        space_ids: ['other-space'],
      };

      const allSpacesSoClient = createSavedObjectClientMock();
      getAllSpacesSoClientSpy.mockReturnValue(allSpacesSoClient);
      const soClient = createSavedObjectClientMock();

      // The internal client finds no policies in 'other-space' with this name
      allSpacesSoClient.find.mockResolvedValue({
        total: 0,
        saved_objects: [],
        page: 1,
        per_page: 10,
      });

      await expect(
        agentPolicyService.requireUniqueName(soClient, singleOtherSpacePolicy)
      ).resolves.not.toThrow();

      // Query is scoped to 'other-space', not the URL space
      expect(allSpacesSoClient.find).toHaveBeenCalledWith({
        type: AGENT_POLICY_SAVED_OBJECT_TYPE,
        searchFields: ['name'],
        search: `\"${singleOtherSpacePolicy.name}\"`,
        namespaces: singleOtherSpacePolicy.space_ids,
      });
      expect(soClient.find).not.toHaveBeenCalled();
    });

    it('should query across spaces if multiple space ids are provided', async () => {
      const otherAgentPolicy = {
        ...testAgentPolicy,
        id: 'other-agent-policy',
      };

      const multiSpacesTestAgentPolicy = {
        ...testAgentPolicy,
        space_ids: ['default', 'outerspace'],
      };

      const allSpacesSoClient = createSavedObjectClientMock();
      getAllSpacesSoClientSpy.mockReturnValue(allSpacesSoClient);
      const soClient = createSavedObjectClientMock();

      soClient.find.mockResolvedValue({
        total: 0,
        saved_objects: [],
        page: 1,
        per_page: 10,
      });

      allSpacesSoClient.find.mockResolvedValue({
        total: 1,
        saved_objects: [
          {
            id: otherAgentPolicy.id,
            type: AGENT_POLICY_SAVED_OBJECT_TYPE,
            attributes: { name: multiSpacesTestAgentPolicy.name },
            references: [],
            score: 1,
          },
        ],
        page: 1,
        per_page: 10,
      });

      await expect(
        agentPolicyService.requireUniqueName(soClient, multiSpacesTestAgentPolicy)
      ).rejects.toThrow();

      expect(allSpacesSoClient.find).toHaveBeenCalledWith({
        type: AGENT_POLICY_SAVED_OBJECT_TYPE,
        searchFields: ['name'],
        search: `\"${multiSpacesTestAgentPolicy.name}\"`,
        namespaces: multiSpacesTestAgentPolicy.space_ids,
      });
    });
  });

  describe('createVerifierPolicy', () => {
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    const baseConnector = {
      id: 'connector-123',
      attributes: {
        name: 'my-connector',
        cloudProvider: 'aws' as const,
        accountType: 'single-account' as const,
        namespace: 'default',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        vars: {
          role_arn: { type: 'text' as const, value: 'arn:aws:iam::123456:role/test' },
          external_id: { type: 'password' as const, value: 'ext-id-secret' },
        },
      },
    };

    const baseVerificationInfo = {
      policyTemplates: ['cspm'],
      packageName: 'aws',
      packageTitle: 'AWS',
      packageVersion: '2.17.0',
    };

    let soClient: ReturnType<typeof createSavedObjectClientMock>;

    beforeEach(() => {
      soClient = getAgentPolicyCreateMock();
      jest.spyOn(agentPolicyService, 'requireUniqueName').mockResolvedValue(undefined);
      jest.spyOn(agentPolicyService, 'deployPolicy').mockResolvedValue(undefined as any);

      mockedPackagePolicyService.create.mockResolvedValue({ id: 'pp-id' } as any);

      jest.mocked(ensureInstalledPackage).mockResolvedValue({
        status: 'already_installed',
        package: { version: '0.0.0' },
      } as any);
      jest.mocked(getPackageInfo).mockResolvedValue({
        name: 'verifier_otel',
        title: 'Permission Verifier',
        version: '0.0.0',
      } as any);

      mockedAppContextService.getCloud.mockReturnValue({
        isCloudEnabled: true,
      } as any);
      mockedAppContextService.getConfig.mockReturnValue({
        agentless: { enabled: true },
      } as any);
    });

    it('should create a package policy with vars at the stream level (not input level)', async () => {
      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        baseConnector as any,
        baseVerificationInfo
      );

      const createCall = mockedPackagePolicyService.create.mock.calls[0];
      const newPackagePolicy = createCall[2];
      const input = newPackagePolicy.inputs[0];

      expect(input.type).toBe('otelcol');
      expect(input.policy_template).toBe('verifierreceiver');
      expect(input.enabled).toBe(true);
      expect(input.streams).toHaveLength(1);

      const stream = input.streams[0];
      expect(stream.enabled).toBe(true);
      expect(stream.data_stream).toEqual({
        type: 'logs',
        dataset: 'verifier_otel.verifierreceiver',
      });
      expect(stream.vars).toBeDefined();
      expect(stream.vars!['data_stream.dataset']).toEqual({
        type: 'text',
        value: 'verifier_otel.verifierreceiver',
      });
    });

    it('should pass account_type "single-account" directly', async () => {
      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        {
          ...baseConnector,
          attributes: { ...baseConnector.attributes, accountType: 'single-account' as const },
        } as any,
        baseVerificationInfo
      );

      const { streams: s0 } = mockedPackagePolicyService.create.mock.calls[0][2].inputs[0];
      expect(s0[0].vars!.account_type).toEqual({
        type: 'select',
        value: 'single-account',
      });
    });

    it('should pass account_type "organization-account" directly', async () => {
      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        {
          ...baseConnector,
          attributes: {
            ...baseConnector.attributes,
            accountType: 'organization-account' as const,
          },
        } as any,
        baseVerificationInfo
      );

      const { streams: s1 } = mockedPackagePolicyService.create.mock.calls[0][2].inputs[0];
      expect(s1[0].vars!.account_type).toEqual({
        type: 'select',
        value: 'organization-account',
      });
    });

    it('should default account_type to "single-account" when accountType is undefined', async () => {
      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        {
          ...baseConnector,
          attributes: { ...baseConnector.attributes, accountType: undefined },
        } as any,
        baseVerificationInfo
      );

      const { streams: s2 } = mockedPackagePolicyService.create.mock.calls[0][2].inputs[0];
      expect(s2[0].vars!.account_type).toEqual({
        type: 'select',
        value: 'single-account',
      });
    });

    it('should include all required verifier vars in the stream', async () => {
      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        baseConnector as any,
        baseVerificationInfo
      );

      const { streams: s3 } = mockedPackagePolicyService.create.mock.calls[0][2].inputs[0];
      const vars = s3[0].vars!;

      expect(vars.identity_federation_id).toEqual({ type: 'text', value: 'connector-123' });
      expect(vars.identity_federation_name).toEqual({ type: 'text', value: 'my-connector' });
      expect(vars.verification_id).toBeDefined();
      expect(vars.verification_id.value).toBeTruthy();
      expect(vars.verification_type).toEqual({ type: 'select', value: 'scheduled' });
      expect(vars.provider).toEqual({ type: 'text', value: 'aws' });
      expect(vars.policy_templates).toEqual({ type: 'text', value: ['cspm'] });
      expect(vars.package_name).toEqual({ type: 'text', value: 'aws' });
      expect(vars.package_title).toEqual({ type: 'text', value: 'AWS' });
      expect(vars.package_version).toEqual({ type: 'text', value: '2.17.0' });
      expect(vars.namespace).toBeUndefined();
      expect(vars.default_region).toBeUndefined();
    });

    it('should include AWS credential vars for aws provider', async () => {
      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        baseConnector as any,
        baseVerificationInfo
      );

      const { streams: awsStreams } = mockedPackagePolicyService.create.mock.calls[0][2].inputs[0];
      const vars = awsStreams[0].vars!;

      expect(vars.credentials_role_arn).toEqual({
        type: 'text',
        value: 'arn:aws:iam::123456:role/test',
      });
      expect(vars.credentials_external_id).toEqual({
        type: 'password',
        value: 'ext-id-secret',
      });
    });

    it('should include Azure credential vars for azure provider', async () => {
      const azureConnector = {
        ...baseConnector,
        attributes: {
          ...baseConnector.attributes,
          cloudProvider: 'azure' as const,
          vars: {
            tenant_id: { type: 'password' as const, value: 'azure-tenant-id' },
            client_id: { type: 'password' as const, value: 'azure-client-id' },
          },
        },
      };

      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        azureConnector as any,
        baseVerificationInfo
      );

      const { streams: azStreams } = mockedPackagePolicyService.create.mock.calls[0][2].inputs[0];
      const vars = azStreams[0].vars!;

      expect(vars.credentials_tenant_id).toEqual({ type: 'password', value: 'azure-tenant-id' });
      expect(vars.credentials_client_id).toEqual({ type: 'password', value: 'azure-client-id' });
      expect(vars.credentials_role_arn).toBeUndefined();
    });

    it('should include GCP credential vars for gcp provider', async () => {
      const gcpConnector = {
        ...baseConnector,
        attributes: {
          ...baseConnector.attributes,
          cloudProvider: 'gcp' as const,
          vars: {
            service_account: { type: 'text' as const, value: 'sa@project.iam.gserviceaccount.com' },
            audience: {
              type: 'text' as const,
              value:
                '//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/pool/providers/prov',
            },
          },
        },
      };

      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        gcpConnector as any,
        baseVerificationInfo
      );

      const { streams: gcpStreams } = mockedPackagePolicyService.create.mock.calls[0][2].inputs[0];
      const vars = gcpStreams[0].vars!;

      expect(vars.credentials_service_account_email).toEqual({
        type: 'text',
        value: 'sa@project.iam.gserviceaccount.com',
      });
      const expectedAudienceValue =
        '//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/pool/providers/prov';
      expect(vars.credentials_audience).toEqual({
        type: 'text',
        value: expectedAudienceValue,
      });
      expect(vars.credentials_role_arn).toBeUndefined();
    });

    it('should pass force and skipEnsureInstalled options to packagePolicyService.create', async () => {
      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        baseConnector as any,
        baseVerificationInfo
      );

      const createOptions = mockedPackagePolicyService.create.mock.calls[0][3];
      expect(createOptions).toMatchObject({
        bumpRevision: false,
        force: true,
        skipEnsureInstalled: true,
      });
      expect(createOptions?.packageInfo).toBeDefined();
    });

    it('should create the agent policy with is_verifier and supports_agentless flags', async () => {
      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        baseConnector as any,
        baseVerificationInfo
      );

      const createAttrs = soClient.create.mock.calls[0][1] as any;
      expect(createAttrs.is_verifier).toBe(true);
      expect(createAttrs.supports_agentless).toBe(true);
      expect(createAttrs.namespace).toBe('default');
    });

    it('should call deployPolicy after successful package policy creation', async () => {
      const deploySpy = jest.spyOn(agentPolicyService, 'deployPolicy');
      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        baseConnector as any,
        baseVerificationInfo
      );

      expect(deploySpy).toHaveBeenCalledWith(soClient, 'mocked', undefined, {
        throwOnAgentlessError: true,
      });
    });

    it('should throw and not deploy if package policy creation fails', async () => {
      mockedPackagePolicyService.create.mockRejectedValueOnce(new Error('validation error'));
      const deploySpy = jest.spyOn(agentPolicyService, 'deployPolicy');

      await expect(
        agentPolicyService.createVerifierPolicy(
          soClient,
          esClient,
          baseConnector as any,
          baseVerificationInfo
        )
      ).rejects.toThrow('validation error');

      expect(deploySpy).not.toHaveBeenCalled();
    });

    it('should roll back the verifier policy and re-throw when deployPolicy fails', async () => {
      jest
        .spyOn(agentPolicyService, 'deployPolicy')
        .mockRejectedValueOnce(new Error('agentless provisioning limit'));
      const deleteSpy = jest
        .spyOn(agentPolicyService, 'deleteVerifierPolicy')
        .mockResolvedValue(undefined);

      await expect(
        agentPolicyService.createVerifierPolicy(
          soClient,
          esClient,
          baseConnector as any,
          baseVerificationInfo
        )
      ).rejects.toThrow('agentless provisioning limit');

      expect(deleteSpy).toHaveBeenCalledWith(soClient, esClient, 'mocked');
    });

    it('should propagate secret_references from created package policy', async () => {
      mockedPackagePolicyService.create.mockResolvedValueOnce({
        id: 'pp-id',
        secret_references: [{ id: 'secret-1' }, { id: 'secret-2' }],
      } as any);

      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        baseConnector as any,
        baseVerificationInfo
      );

      expect(mockedPackagePolicyService.create).toHaveBeenCalledTimes(1);
    });

    it('should include all manifest-required vars for the verifier_otel package', async () => {
      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        baseConnector as any,
        baseVerificationInfo
      );

      const { streams } = mockedPackagePolicyService.create.mock.calls[0][2].inputs[0];
      const vars = streams[0].vars!;

      const requiredVarNames = [
        'identity_federation_id',
        'verification_id',
        'provider',
        'policy_id',
        'policy_templates',
        'package_name',
      ];

      for (const varName of requiredVarNames) {
        expect(vars[varName]).toBeDefined();
        expect(vars[varName].value).toBeTruthy();
      }
    });

    it('should use verifier constants for input type, policy template, and dataset', async () => {
      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        baseConnector as any,
        baseVerificationInfo
      );

      const newPolicy = mockedPackagePolicyService.create.mock.calls[0][2];
      const input = newPolicy.inputs[0];
      const stream = input.streams[0];

      expect(newPolicy.package?.name).toBe('verifier_otel');
      expect(input.type).toBe('otelcol');
      expect(input.policy_template).toBe('verifierreceiver');
      expect(stream.data_stream.type).toBe('logs');
      expect(stream.data_stream.dataset).toBe('verifier_otel.verifierreceiver');
      expect(stream.vars!['data_stream.dataset'].value).toBe('verifier_otel.verifierreceiver');
    });

    it('should set cloud_connector_id and supports_cloud_connector on the package policy', async () => {
      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        baseConnector as any,
        baseVerificationInfo
      );

      const newPolicy = mockedPackagePolicyService.create.mock.calls[0][2];
      expect(newPolicy.cloud_connector_id).toBe('connector-123');
      expect(newPolicy.cloud_connector_name).toBe('my-connector');
      expect(newPolicy.supports_cloud_connector).toBe(true);
      expect(newPolicy.supports_agentless).toBe(true);
    });

    it('should create agent policy with agentless.cloud_connectors targeting the cloud provider', async () => {
      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        baseConnector as any,
        baseVerificationInfo
      );

      const createAttrs = soClient.create.mock.calls[0][1] as any;
      expect(createAttrs.agentless).toEqual({
        cloud_connectors: {
          enabled: true,
          target_csp: 'aws',
        },
      });
    });

    it('should not include vars that are absent from the verifier_otel manifest', async () => {
      await agentPolicyService.createVerifierPolicy(
        soClient,
        esClient,
        baseConnector as any,
        baseVerificationInfo
      );

      const { streams } = mockedPackagePolicyService.create.mock.calls[0][2].inputs[0];
      const vars = streams[0].vars!;

      expect(vars.default_region).toBeUndefined();
      expect(vars.namespace).toBeUndefined();
      expect(vars.cloud_connector_id).toBeUndefined();
      expect(vars.cloud_connector_name).toBeUndefined();
    });
  });

  describe('getLatestFleetPolicyRevisions', () => {
    it('returns an empty map without querying when no policy ids are provided', async () => {
      const esClient = elasticsearchServiceMock.createInternalClient();

      const result = await agentPolicyService.getLatestFleetPolicyRevisions(esClient, []);

      expect(result).toEqual(new Map());
      expect(esClient.search).not.toHaveBeenCalled();
    });

    it('maps each policy id to its latest deployed revision, omitting policies with none', async () => {
      const esClient = elasticsearchServiceMock.createInternalClient();
      esClient.search.mockResolvedValue({
        aggregations: {
          policies: {
            buckets: [
              { key: 'policy1', latest_revision: { value: 3 } },
              { key: 'policy2', latest_revision: { value: 1 } },
              { key: 'policy3', latest_revision: { value: null } },
            ],
          },
        },
      } as any);

      const result = await agentPolicyService.getLatestFleetPolicyRevisions(esClient, [
        'policy1',
        'policy2',
        'policy3',
      ]);

      expect(result).toEqual(
        new Map([
          ['policy1', 3],
          ['policy2', 1],
        ])
      );
      expect(esClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: AGENT_POLICY_INDEX,
          size: 0,
          query: { terms: { policy_id: ['policy1', 'policy2', 'policy3'] } },
        })
      );
    });
  });
});
