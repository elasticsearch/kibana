/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  elasticsearchServiceMock,
  loggingSystemMock,
  savedObjectsClientMock,
} from '@kbn/core/server/mocks';
import { cloudMock } from '@kbn/cloud-plugin/server/mocks';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';

import { createAppContextStartContractMock, createPackagePolicyServiceMock } from '../../mocks';
import { getPackageInfo } from '../epm/packages';
import { appContextService, cloudConnectorService } from '..';
import { agentPolicyService } from '../agent_policy';
import { agentlessAgentService } from '../agents/agentless_agent';

import { AgentlessPoliciesServiceImpl } from './agentless_policies';

jest.mock('../epm/packages/get');

jest.mock('../agent_policy');

describe('AgentlessPoliciesService', () => {
  describe('createAgentlessPolicy', () => {
    let packagePolicyService: ReturnType<typeof createPackagePolicyServiceMock>;
    beforeEach(() => {
      const cloudSetup = cloudMock.createSetup();
      cloudSetup.isCloudEnabled = true;

      appContextService.start({
        ...createAppContextStartContractMock({
          agentless: { enabled: true },
        }),
        cloud: cloudSetup,
      });

      jest.resetAllMocks();
      packagePolicyService = createPackagePolicyServiceMock();
      packagePolicyService.create.mockImplementation(async (_, __, policy, opts) => {
        return {
          id: opts?.id || 'new-agentless-package-policy-id',
          name: policy.name,
          package: policy.package,
          inputs: [],
          namespace: policy.namespace,
          revision: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: 'system',
          updated_by: 'system',
          enabled: true,
          policy_ids: policy.policy_ids || [],
        };
      });

      jest.mocked(agentPolicyService.create).mockImplementationOnce(async (_, __, policy, opts) => {
        return {
          id: opts?.id || 'new-agentless-policy-id',
          status: 'active',
          name: policy.name,
          namespace: policy.namespace,
          is_managed: policy.is_managed || false,
          revision: 1,
          created_at: new Date().toISOString(),
          is_protected: false,
          updated_at: new Date().toISOString(),
          updated_by: 'system',
        };
      });
      jest.mocked(agentPolicyService.delete).mockImplementationOnce(async () => ({} as any));

      jest.mocked(getPackageInfo).mockImplementation(async ({ pkgName, pkgVersion }) => {
        if (pkgName === 'agentless_integration') {
          return {
            name: 'agentless_integration',
            version: '1.0.0',
            policy_templates: [
              {
                name: 'agentless_template',
                deployment_modes: ['agentless'],
              },
            ],
          } as any;
        }
        throw new Error('Package not found in mock');
      });
    });

    it('should create a new agentless policy', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const logger = loggingSystemMock.createLogger();

      const agentlessPoliciesService = new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        soClient,
        esClient,
        logger
      );

      const result = await agentlessPoliciesService.createAgentlessPolicy({
        name: 'Test Agentless Policy',
        namespace: 'default',
        package: {
          name: 'agentless_integration',
          version: '1.0.0',
        },
        inputs: {},
      });

      expect(result).toBeDefined();

      expect(jest.mocked(agentPolicyService.create)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(agentPolicyService.create)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          supports_agentless: true,
        }),
        expect.objectContaining({})
      );
      expect(jest.mocked(packagePolicyService.create)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(packagePolicyService.create)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          supports_agentless: true,
        }),
        expect.anything(),
        undefined,
        undefined
      );
      expect(jest.mocked(agentPolicyService.deployPolicy)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(agentPolicyService.deployPolicy)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        expect.objectContaining({
          throwOnAgentlessError: true,
        })
      );
    });

    it('should delete agent policy if an error occurs during package policy creation', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const logger = loggingSystemMock.createLogger();

      const agentlessPoliciesService = new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        soClient,
        esClient,
        logger
      );
      jest.mocked(packagePolicyService.create).mockImplementationOnce(async () => {
        throw new Error('Error creating package policy');
      });

      await expect(() =>
        agentlessPoliciesService.createAgentlessPolicy({
          id: 'test-agentless-policy-id',
          name: 'Test Agentless Policy',
          namespace: 'default',
          package: {
            name: 'agentless_integration',
            version: '1.0.0',
          },
          inputs: {},
        })
      ).rejects.toThrow('Error creating package policy');

      expect(jest.mocked(agentPolicyService.create)).toHaveBeenCalledTimes(1);

      expect(jest.mocked(agentPolicyService.delete)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(agentPolicyService.delete)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test-agentless-policy-id',
        expect.objectContaining({
          force: true,
        })
      );
    });

    it('should delete agent policy if an error occurs during deployment', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const logger = loggingSystemMock.createLogger();

      const agentlessPoliciesService = new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        soClient,
        esClient,
        logger
      );
      jest.mocked(agentPolicyService.deployPolicy).mockImplementationOnce(async () => {
        throw new Error('Error calling agentless API');
      });

      await expect(() =>
        agentlessPoliciesService.createAgentlessPolicy({
          id: 'test-agentless-policy-id',
          name: 'Test Agentless Policy',
          namespace: 'default',
          package: {
            name: 'agentless_integration',
            version: '1.0.0',
          },
          inputs: {},
        })
      ).rejects.toThrow('Error calling agentless API');

      expect(jest.mocked(agentPolicyService.create)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(packagePolicyService.create)).toHaveBeenCalledTimes(1);

      expect(jest.mocked(agentPolicyService.delete)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(agentPolicyService.delete)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test-agentless-policy-id',
        expect.objectContaining({
          force: true,
        })
      );
    });
  });

  describe('deleteAgentlessPolicy', () => {
    let packagePolicyService: ReturnType<typeof createPackagePolicyServiceMock>;
    beforeEach(() => {
      const cloudSetup = cloudMock.createSetup();
      cloudSetup.isCloudEnabled = true;

      appContextService.start({
        ...createAppContextStartContractMock({
          agentless: { enabled: true },
        }),
        cloud: cloudSetup,
      });

      jest.resetAllMocks();
      packagePolicyService = createPackagePolicyServiceMock();

      jest.mocked(agentPolicyService.delete).mockImplementationOnce(async () => ({} as any));
    });

    it('should delete an existing agentless policy', async () => {
      jest.mocked(agentPolicyService.get).mockResolvedValueOnce({
        supports_agentless: true,
      } as any);

      packagePolicyService.list.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        perPage: 1,
      });

      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const logger = loggingSystemMock.createLogger();

      const agentlessPoliciesService = new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        soClient,
        esClient,
        logger
      );

      await agentlessPoliciesService.deleteAgentlessPolicy('existing-agentless-policy-id');

      expect(jest.mocked(agentPolicyService.delete)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(agentPolicyService.delete)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'existing-agentless-policy-id',
        expect.objectContaining({})
      );
    });

    it('should throw when deleting a non agentless policy', async () => {
      jest.mocked(agentPolicyService.get).mockResolvedValueOnce({
        supports_agentless: false,
      } as any);

      packagePolicyService.list.mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        perPage: 1,
      });

      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const logger = loggingSystemMock.createLogger();

      const agentlessPoliciesService = new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        soClient,
        esClient,
        logger
      );

      await expect(() =>
        agentlessPoliciesService.deleteAgentlessPolicy('non-agentless-policy-id')
      ).rejects.toThrow(`Policy non-agentless-policy-id is not an agentless policy`);

      expect(jest.mocked(agentPolicyService.delete)).toHaveBeenCalledTimes(0);
    });

    it('should clean up orphaned resources when agent policy is not found (404)', async () => {
      const deleteAgentlessAgentSpy = jest
        .spyOn(agentlessAgentService, 'deleteAgentlessAgent')
        .mockResolvedValueOnce(undefined as any);

      jest
        .mocked(agentPolicyService.get)
        .mockRejectedValueOnce(SavedObjectsErrorHelpers.createGenericNotFoundError('test'));

      packagePolicyService.findAllForAgentPolicy.mockResolvedValueOnce([
        { id: 'orphaned-pp-1' },
        { id: 'orphaned-pp-2' },
      ] as any);

      packagePolicyService.delete.mockResolvedValueOnce([
        { id: 'orphaned-pp-1', success: true },
        { id: 'orphaned-pp-2', success: true },
      ] as any);

      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const logger = loggingSystemMock.createLogger();

      const agentlessPoliciesService = new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        soClient,
        esClient,
        logger
      );

      await agentlessPoliciesService.deleteAgentlessPolicy('orphaned-policy-id');

      expect(jest.mocked(agentPolicyService.delete)).not.toHaveBeenCalled();
      expect(packagePolicyService.findAllForAgentPolicy).toHaveBeenCalledWith(
        soClient,
        'orphaned-policy-id'
      );
      expect(packagePolicyService.delete).toHaveBeenCalledWith(
        soClient,
        esClient,
        ['orphaned-pp-1', 'orphaned-pp-2'],
        expect.objectContaining({ force: true })
      );
      expect(deleteAgentlessAgentSpy).toHaveBeenCalledWith('orphaned-policy-id');

      deleteAgentlessAgentSpy.mockRestore();
    });

    it('should rethrow non-404 errors from agentPolicyService.get', async () => {
      jest.mocked(agentPolicyService.get).mockRejectedValueOnce({
        output: { statusCode: 500 },
        message: 'Internal server error',
      });

      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const logger = loggingSystemMock.createLogger();

      const agentlessPoliciesService = new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        soClient,
        esClient,
        logger
      );

      await expect(() =>
        agentlessPoliciesService.deleteAgentlessPolicy('some-policy-id')
      ).rejects.toEqual(expect.objectContaining({ output: { statusCode: 500 } }));

      expect(jest.mocked(agentPolicyService.delete)).not.toHaveBeenCalled();
    });
  });

  describe('createAgentlessPolicy with cloud connectors', () => {
    let packagePolicyService: ReturnType<typeof createPackagePolicyServiceMock>;

    const createMockPackageInfo = (
      inputType: string,
      vars: Array<{ name: string; type: string; default?: any }>
    ) =>
      ({
        name: 'cloud_security_posture',
        title: 'Cloud Security Posture',
        version: '3.1.1',
        description: 'Cloud Security Posture Management',
        type: 'integration',
        categories: [],
        conditions: { kibana: { version: '' } },
        format_version: '',
        download: '',
        path: '',
        release: 'ga',
        owner: { github: '' },
        assets: {} as any,
        status: 'not_installed',
        latestVersion: '3.1.1',
        keepPoliciesUpToDate: false,
        data_streams: [
          {
            dataset: 'cloud_security_posture.findings',
            type: 'logs',
            title: 'Cloud Security Posture Findings',
            release: 'ga',
            package: 'cloud_security_posture',
            path: 'findings',
            streams: [
              {
                input: inputType,
                enabled: true,
                template_path: 'findings.yml.hbs',
                title: 'Cloud Security Posture Findings',
                vars,
              },
            ],
          },
        ],
        policy_templates: [
          {
            name: 'cspm',
            deployment_modes: {
              agentless: {
                enabled: true,
                resources: {},
              },
            },
            inputs: [
              {
                type: inputType,
                title: inputType.includes('aws') ? 'CIS AWS' : 'CIS Azure',
              },
            ],
          },
        ],
      } as any);

    beforeEach(() => {
      const cloudSetup = cloudMock.createSetup();
      cloudSetup.isCloudEnabled = true;

      appContextService.start({
        ...createAppContextStartContractMock({
          agentless: { enabled: true },
        }),
        cloud: cloudSetup,
      });

      jest.clearAllMocks();

      // Reset getPackageInfo mock to allow mockResolvedValueOnce to work
      jest.mocked(getPackageInfo).mockReset();

      // Set up cloud connector service mocks - use mockReset to ensure clean state
      const createSpy = jest.spyOn(cloudConnectorService, 'create');
      createSpy.mockReset();

      const deleteSpy = jest.spyOn(cloudConnectorService, 'delete');
      deleteSpy.mockReset();
      deleteSpy.mockResolvedValue(undefined as any);

      const getByIdSpy = jest.spyOn(cloudConnectorService, 'getById');
      getByIdSpy.mockReset();

      const updateSpy = jest.spyOn(cloudConnectorService, 'update');
      updateSpy.mockReset();

      packagePolicyService = createPackagePolicyServiceMock();
      packagePolicyService.create.mockImplementation(async (_, __, policy, opts) => {
        return {
          id: opts?.id || 'new-agentless-package-policy-id',
          name: policy.name,
          package: policy.package,
          inputs: (policy.inputs || []).map((input) => ({
            ...input,
            streams: input.streams.map((stream) => ({
              ...stream,
              id: stream.id || 'stream-id',
            })),
          })),
          namespace: policy.namespace,
          revision: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: 'system',
          updated_by: 'system',
          enabled: true,
          policy_ids: policy.policy_ids || [],
          cloud_connector_id: (policy as any).cloud_connector_id,
        };
      });

      jest.mocked(agentPolicyService.delete).mockImplementation(async () => ({} as any));
    });

    it('should create agentless policy with AWS cloud connector', async () => {
      jest.mocked(agentPolicyService.create).mockImplementationOnce(async (_, __, policy, opts) => {
        return {
          id: opts?.id || 'new-agentless-policy-id',
          status: 'active',
          name: policy.name,
          namespace: policy.namespace,
          is_managed: policy.is_managed || false,
          revision: 1,
          created_at: new Date().toISOString(),
          is_protected: false,
          updated_at: new Date().toISOString(),
          updated_by: 'system',
          agentless: {
            cloud_connectors: {
              enabled: true,
              target_csp: 'aws',
            },
          },
        };
      });

      jest.mocked(getPackageInfo).mockResolvedValueOnce(
        createMockPackageInfo('cloudbeat/cis_aws', [
          { name: 'role_arn', type: 'text', default: '' },
          { name: 'external_id', type: 'text', default: '' },
        ])
      );

      const createSpy = jest.spyOn(cloudConnectorService, 'create');
      createSpy.mockResolvedValueOnce({
        id: 'aws-cloud-connector-123',
        name: 'aws-cloud-connector: cspm-aws-policy',
        cloudProvider: 'aws',
        vars: {
          role_arn: { type: 'text', value: 'arn:aws:iam::123456789012:role/TestRole' },
          external_id: { id: 'ABCDEFGHIJKLMNOPQRST', isSecretRef: true },
        },
        packagePolicyCount: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);

      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const logger = loggingSystemMock.createLogger();

      const agentlessPoliciesService = new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        soClient,
        esClient,
        logger
      );

      const result = await agentlessPoliciesService.createAgentlessPolicy({
        name: 'cspm-aws-policy',
        namespace: 'default',
        package: {
          name: 'cloud_security_posture',
          version: '3.1.1',
        },
        cloud_connector: {
          enabled: true,
        },
        inputs: {
          'cspm-cloudbeat/cis_aws': {
            enabled: true,
            streams: {
              'cloud_security_posture.findings': {
                enabled: true,
                vars: {
                  role_arn: 'arn:aws:iam::123456789012:role/TestRole',
                  external_id: {
                    id: 'ABCDEFGHIJKLMNOPQRST',
                    isSecretRef: true,
                  },
                },
              },
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result.cloud_connector).toEqual({
        enabled: true,
        cloud_connector_id: 'aws-cloud-connector-123',
      });
      expect(createSpy).toHaveBeenCalledWith(
        soClient,
        expect.objectContaining({
          cloudProvider: 'aws',
          name: 'arn:aws:iam::123456789012:role/TestRole',
          vars: expect.objectContaining({
            role_arn: expect.objectContaining({ value: 'arn:aws:iam::123456789012:role/TestRole' }),
          }),
        })
      );
    });

    it('should create agentless policy with Azure cloud connector', async () => {
      jest.mocked(agentPolicyService.create).mockImplementationOnce(async (_, __, policy, opts) => {
        return {
          id: opts?.id || 'new-agentless-policy-id',
          status: 'active',
          name: policy.name,
          namespace: policy.namespace,
          is_managed: policy.is_managed || false,
          revision: 1,
          created_at: new Date().toISOString(),
          is_protected: false,
          updated_at: new Date().toISOString(),
          updated_by: 'system',
          agentless: {
            cloud_connectors: {
              enabled: true,
              target_csp: 'azure',
            },
          },
        };
      });

      jest.mocked(getPackageInfo).mockResolvedValueOnce(
        createMockPackageInfo('cloudbeat/cis_azure', [
          { name: 'tenant_id', type: 'text', default: '' },
          { name: 'client_id', type: 'text', default: '' },
          { name: 'azure_credentials_cloud_connector_id', type: 'text', default: '' },
        ])
      );

      const createSpy = jest.spyOn(cloudConnectorService, 'create');
      createSpy.mockResolvedValueOnce({
        id: 'azure-cloud-connector-123',
        name: 'azure-cloud-connector: cspm-azure-policy',
        cloudProvider: 'azure',
        vars: {
          tenant_id: { id: 'tenant-secret-id', isSecretRef: true },
          client_id: { id: 'client-secret-id', isSecretRef: true },
          azure_credentials_cloud_connector_id: { value: 'azure-creds-connector', type: 'text' },
        },
        packagePolicyCount: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);

      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const logger = loggingSystemMock.createLogger();

      const agentlessPoliciesService = new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        soClient,
        esClient,
        logger
      );

      const result = await agentlessPoliciesService.createAgentlessPolicy({
        name: 'cspm-azure-policy',
        namespace: 'default',
        package: {
          name: 'cloud_security_posture',
          version: '3.1.1',
        },
        cloud_connector: {
          enabled: true,
        },
        inputs: {
          'cspm-cloudbeat/cis_azure': {
            enabled: true,
            streams: {
              'cloud_security_posture.findings': {
                enabled: true,
                vars: {
                  tenant_id: {
                    id: 'tenant-secret-id',
                    isSecretRef: true,
                  },
                  client_id: {
                    id: 'client-secret-id',
                    isSecretRef: true,
                  },
                  azure_credentials_cloud_connector_id: 'azure-creds-connector',
                },
              },
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result.cloud_connector).toEqual({
        enabled: true,
        cloud_connector_id: 'azure-cloud-connector-123',
      });
      expect(createSpy).toHaveBeenCalledWith(
        soClient,
        expect.objectContaining({
          cloudProvider: 'azure',
          name: 'azure-creds-connector',
          vars: expect.objectContaining({
            tenant_id: expect.any(Object),
            client_id: expect.any(Object),
            azure_credentials_cloud_connector_id: expect.objectContaining({
              value: 'azure-creds-connector',
            }),
          }),
        })
      );
    });

    it('should rollback cloud connector if package policy creation fails', async () => {
      jest.mocked(agentPolicyService.create).mockImplementationOnce(async (_, __, policy, opts) => {
        return {
          id: opts?.id || 'new-agentless-policy-id',
          status: 'active',
          name: policy.name,
          namespace: policy.namespace,
          is_managed: policy.is_managed || false,
          revision: 1,
          created_at: new Date().toISOString(),
          is_protected: false,
          updated_at: new Date().toISOString(),
          updated_by: 'system',
          agentless: {
            cloud_connectors: {
              enabled: true,
              target_csp: 'aws',
            },
          },
        };
      });

      jest.mocked(getPackageInfo).mockResolvedValueOnce(
        createMockPackageInfo('cloudbeat/cis_aws', [
          { name: 'role_arn', type: 'text', default: '' },
          { name: 'external_id', type: 'text', default: '' },
        ])
      );

      const createSpy = jest.spyOn(cloudConnectorService, 'create');
      createSpy.mockResolvedValueOnce({
        id: 'aws-cloud-connector-123',
        name: 'aws-cloud-connector: cspm-aws-policy',
        cloudProvider: 'aws',
        vars: {
          role_arn: { type: 'text', value: 'arn:aws:iam::123456789012:role/TestRole' },
          external_id: { id: 'ABCDEFGHIJKLMNOPQRST', isSecretRef: true },
        },
        packagePolicyCount: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);

      const deleteSpy = jest.spyOn(cloudConnectorService, 'delete');
      deleteSpy.mockResolvedValueOnce({ id: 'aws-cloud-connector-123' } as any);

      packagePolicyService.create.mockImplementationOnce(async () => {
        throw new Error('Error creating package policy');
      });

      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const logger = loggingSystemMock.createLogger();

      const agentlessPoliciesService = new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        soClient,
        esClient,
        logger
      );

      await expect(() =>
        agentlessPoliciesService.createAgentlessPolicy({
          id: 'test-agentless-policy-id',
          name: 'cspm-aws-policy',
          namespace: 'default',
          package: {
            name: 'cloud_security_posture',
            version: '3.1.1',
          },
          cloud_connector: {
            enabled: true,
          },
          inputs: {
            'cspm-cloudbeat/cis_aws': {
              enabled: true,
              streams: {
                'cloud_security_posture.findings': {
                  enabled: true,
                  vars: {
                    role_arn: 'arn:aws:iam::123456789012:role/TestRole',
                    external_id: {
                      id: 'ABCDEFGHIJKLMNOPQRST',
                      isSecretRef: true,
                    },
                  },
                },
              },
            },
          },
        })
      ).rejects.toThrow('Error creating package policy');

      // Verify cloud connector was created
      expect(createSpy).toHaveBeenCalledTimes(1);

      // Verify rollback: cloud connector should be deleted
      expect(deleteSpy).toHaveBeenCalledWith(soClient, esClient, 'aws-cloud-connector-123', true);

      // Verify rollback: agent policy should be deleted
      expect(jest.mocked(agentPolicyService.delete)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'test-agentless-policy-id',
        expect.objectContaining({
          force: true,
        })
      );
    });

    it('should create AWS cloud connector with custom name from API request', async () => {
      jest.mocked(agentPolicyService.create).mockImplementationOnce(async (_, __, policy, opts) => {
        return {
          id: opts?.id || 'new-agentless-policy-id',
          status: 'active',
          name: policy.name,
          namespace: policy.namespace,
          is_managed: policy.is_managed || false,
          revision: 1,
          created_at: new Date().toISOString(),
          is_protected: false,
          updated_at: new Date().toISOString(),
          updated_by: 'system',
          agentless: {
            cloud_connectors: {
              enabled: true,
              target_csp: 'aws',
            },
          },
        };
      });

      jest.mocked(getPackageInfo).mockResolvedValueOnce(
        createMockPackageInfo('cloudbeat/cis_aws', [
          { name: 'role_arn', type: 'text', default: '' },
          { name: 'external_id', type: 'text', default: '' },
        ])
      );

      const createSpy = jest.spyOn(cloudConnectorService, 'create');
      createSpy.mockResolvedValueOnce({
        id: 'aws-cloud-connector-123',
        name: 'my-custom-connector-name',
        cloudProvider: 'aws',
        vars: {
          role_arn: { type: 'text', value: 'arn:aws:iam::123456789012:role/TestRole' },
          external_id: { id: 'ABCDEFGHIJKLMNOPQRST', isSecretRef: true },
        },
        packagePolicyCount: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);

      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const logger = loggingSystemMock.createLogger();

      const agentlessPoliciesService = new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        soClient,
        esClient,
        logger
      );

      const result = await agentlessPoliciesService.createAgentlessPolicy({
        name: 'cspm-aws-policy',
        namespace: 'default',
        package: {
          name: 'cloud_security_posture',
          version: '3.1.1',
        },
        cloud_connector: {
          enabled: true,
          name: 'my-custom-connector-name',
        },
        inputs: {
          'cspm-cloudbeat/cis_aws': {
            enabled: true,
            streams: {
              'cloud_security_posture.findings': {
                enabled: true,
                vars: {
                  role_arn: 'arn:aws:iam::123456789012:role/TestRole',
                  external_id: {
                    id: 'ABCDEFGHIJKLMNOPQRST',
                    isSecretRef: true,
                  },
                },
              },
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result.cloud_connector).toEqual({
        enabled: true,
        cloud_connector_id: 'aws-cloud-connector-123',
      });
      // Verify that the custom name from API request is used
      expect(createSpy).toHaveBeenCalledWith(
        soClient,
        expect.objectContaining({
          cloudProvider: 'aws',
          name: 'my-custom-connector-name',
          vars: expect.objectContaining({
            role_arn: expect.objectContaining({ value: 'arn:aws:iam::123456789012:role/TestRole' }),
          }),
        })
      );
    });

    it('should fallback to auto-generated name when no custom name is provided', async () => {
      jest.mocked(agentPolicyService.create).mockImplementationOnce(async (_, __, policy, opts) => {
        return {
          id: opts?.id || 'new-agentless-policy-id',
          status: 'active',
          name: policy.name,
          namespace: policy.namespace,
          is_managed: policy.is_managed || false,
          revision: 1,
          created_at: new Date().toISOString(),
          is_protected: false,
          updated_at: new Date().toISOString(),
          updated_by: 'system',
          agentless: {
            cloud_connectors: {
              enabled: true,
              target_csp: 'aws',
            },
          },
        };
      });

      jest.mocked(getPackageInfo).mockResolvedValueOnce(
        createMockPackageInfo('cloudbeat/cis_aws', [
          { name: 'role_arn', type: 'text', default: '' },
          { name: 'external_id', type: 'text', default: '' },
        ])
      );

      const createSpy = jest.spyOn(cloudConnectorService, 'create');
      createSpy.mockResolvedValueOnce({
        id: 'aws-cloud-connector-123',
        name: 'arn:aws:iam::123456789012:role/TestRole',
        cloudProvider: 'aws',
        vars: {
          role_arn: { type: 'text', value: 'arn:aws:iam::123456789012:role/TestRole' },
          external_id: { id: 'ABCDEFGHIJKLMNOPQRST', isSecretRef: true },
        },
        packagePolicyCount: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);

      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const logger = loggingSystemMock.createLogger();

      const agentlessPoliciesService = new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        soClient,
        esClient,
        logger
      );

      const result = await agentlessPoliciesService.createAgentlessPolicy({
        name: 'cspm-aws-policy',
        namespace: 'default',
        package: {
          name: 'cloud_security_posture',
          version: '3.1.1',
        },
        cloud_connector: {
          enabled: true,
          // No custom name provided - should use role_arn as fallback
        },
        inputs: {
          'cspm-cloudbeat/cis_aws': {
            enabled: true,
            streams: {
              'cloud_security_posture.findings': {
                enabled: true,
                vars: {
                  role_arn: 'arn:aws:iam::123456789012:role/TestRole',
                  external_id: {
                    id: 'ABCDEFGHIJKLMNOPQRST',
                    isSecretRef: true,
                  },
                },
              },
            },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result.cloud_connector).toEqual({
        enabled: true,
        cloud_connector_id: 'aws-cloud-connector-123',
      });
      // Verify that the fallback name (role_arn) is used when no custom name is provided
      expect(createSpy).toHaveBeenCalledWith(
        soClient,
        expect.objectContaining({
          cloudProvider: 'aws',
          name: 'arn:aws:iam::123456789012:role/TestRole',
          vars: expect.objectContaining({
            role_arn: expect.objectContaining({ value: 'arn:aws:iam::123456789012:role/TestRole' }),
          }),
        })
      );
    });
  });
});
