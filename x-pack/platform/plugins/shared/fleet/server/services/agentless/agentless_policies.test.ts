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

const buildAgentlessPackagePolicy = (overrides: Record<string, any> = {}): any => ({
  id: 'agentless-policy-id',
  name: 'Test Agentless Policy',
  namespace: 'default',
  description: 'test agentless policy',
  package: { name: 'test_agentless', title: 'Test Agentless', version: '1.0.0' },
  inputs: [],
  vars: {},
  policy_ids: ['agentless-policy-id'],
  revision: 1,
  supports_agentless: true,
  enabled: true,
  created_at: '2024-01-01T00:00:00.000Z',
  created_by: 'system',
  updated_at: '2024-01-01T00:00:00.000Z',
  updated_by: 'system',
  ...overrides,
});

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

  describe('updateAgentlessPolicy', () => {
    let packagePolicyService: ReturnType<typeof createPackagePolicyServiceMock>;

    const createService = () =>
      new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        savedObjectsClientMock.create(),
        elasticsearchServiceMock.createClusterClient().asInternalUser,
        loggingSystemMock.createLogger()
      );

    const buildUpdateRequest = (overrides: Record<string, any> = {}): any => ({
      name: 'Test Agentless Policy',
      namespace: 'default',
      package: { name: 'test_agentless', version: '1.0.0' },
      inputs: {},
      ...overrides,
    });

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

      // Existing (stored) agentless package + agent policy.
      packagePolicyService.get.mockResolvedValue(buildAgentlessPackagePolicy());
      jest.mocked(agentPolicyService.get).mockResolvedValue({
        id: 'agentless-policy-id',
        name: 'Agentless policy for Test Agentless Policy',
        namespace: 'default',
        supports_agentless: true,
        agentless: { cluster_id: 'cluster-123' },
      } as any);

      // The update echoes back the new package policy so the mapper has a package to read.
      packagePolicyService.update.mockImplementation(async (_, __, id, policy: any) => ({
        id,
        name: policy.name,
        namespace: policy.namespace,
        package: policy.package,
        inputs: [],
        vars: policy.vars,
        revision: 2,
        supports_agentless: true,
        enabled: true,
        policy_ids: policy.policy_ids || [],
        cloud_connector_id: policy.cloud_connector_id,
        created_at: '2024-01-01T00:00:00.000Z',
        created_by: 'system',
        updated_at: '2024-01-02T00:00:00.000Z',
        updated_by: 'system',
      }));

      jest.mocked(agentPolicyService.update).mockResolvedValue({} as any);
      jest.mocked(agentPolicyService.deployPolicy).mockResolvedValue(undefined as any);

      jest.mocked(getPackageInfo).mockImplementation(
        async ({ pkgName, pkgVersion }) =>
          ({
            name: pkgName,
            title: 'Test Agentless',
            version: pkgVersion,
            policy_templates: [
              {
                name: 'test_template',
                deployment_modes: { agentless: { enabled: true, resources: {} } },
              },
            ],
          } as any)
      );
    });

    it('should update the package + agent policy, re-deploy, and return the mapped policy', async () => {
      const result = await createService().updateAgentlessPolicy(
        'agentless-policy-id',
        buildUpdateRequest({
          namespace: 'production',
        })
      );

      // Package policy is updated without bumping its revision (matches create).
      expect(packagePolicyService.update).toHaveBeenCalledTimes(1);
      expect(packagePolicyService.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'agentless-policy-id',
        expect.objectContaining({ supports_agentless: true, namespace: 'production' }),
        expect.objectContaining({ bumpRevision: false })
      );

      // Backing agent policy is kept in sync (name derived, namespace mirrored).
      expect(jest.mocked(agentPolicyService.update)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(agentPolicyService.update)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'agentless-policy-id',
        expect.objectContaining({
          name: 'Agentless policy for Test Agentless Policy',
          namespace: 'production',
        }),
        expect.anything()
      );

      // Live workload reconcile is the final step and surfaces agentless errors.
      expect(jest.mocked(agentPolicyService.deployPolicy)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(agentPolicyService.deployPolicy)).toHaveBeenCalledWith(
        expect.anything(),
        'agentless-policy-id',
        undefined,
        expect.objectContaining({ throwOnAgentlessError: true })
      );

      // Response is the clean agentless contract (no Fleet internals).
      expect(result).toEqual(
        expect.objectContaining({ id: 'agentless-policy-id', namespace: 'production' })
      );
      expect(result).not.toHaveProperty('supports_agentless');
      expect(result).not.toHaveProperty('policy_ids');
      expect(result).not.toHaveProperty('revision');
    });

    it('should preserve the runtime cluster_id on the agent policy across the update', async () => {
      await createService().updateAgentlessPolicy('agentless-policy-id', buildUpdateRequest());

      expect(jest.mocked(agentPolicyService.update)).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'agentless-policy-id',
        expect.objectContaining({
          agentless: expect.objectContaining({ cluster_id: 'cluster-123' }),
        }),
        expect.anything()
      );
    });

    it('should throw a not found error when the package policy does not exist', async () => {
      packagePolicyService.get.mockReset();
      packagePolicyService.get.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createGenericNotFoundError('test')
      );

      await expect(() =>
        createService().updateAgentlessPolicy('missing-policy-id', buildUpdateRequest())
      ).rejects.toThrow('Agentless policy missing-policy-id not found');

      expect(packagePolicyService.update).not.toHaveBeenCalled();
      expect(jest.mocked(agentPolicyService.update)).not.toHaveBeenCalled();
    });

    it('should throw a not found error when the package policy is not agentless', async () => {
      packagePolicyService.get.mockReset();
      packagePolicyService.get.mockResolvedValueOnce(
        buildAgentlessPackagePolicy({ supports_agentless: false })
      );

      await expect(() =>
        createService().updateAgentlessPolicy('regular-policy-id', buildUpdateRequest())
      ).rejects.toThrow('Agentless policy regular-policy-id not found');

      expect(packagePolicyService.update).not.toHaveBeenCalled();
    });

    it('should throw a not found error when the backing agent policy is not agentless', async () => {
      jest.mocked(agentPolicyService.get).mockReset();
      jest.mocked(agentPolicyService.get).mockResolvedValueOnce({
        id: 'agentless-policy-id',
        supports_agentless: false,
      } as any);

      await expect(() =>
        createService().updateAgentlessPolicy('agentless-policy-id', buildUpdateRequest())
      ).rejects.toThrow('Agentless policy agentless-policy-id not found');

      expect(packagePolicyService.update).not.toHaveBeenCalled();
    });

    it('should reject a change to the package name', async () => {
      await expect(() =>
        createService().updateAgentlessPolicy(
          'agentless-policy-id',
          buildUpdateRequest({ package: { name: 'a_different_package', version: '1.0.0' } })
        )
      ).rejects.toThrow(
        'Cannot change the integration package of an agentless policy (from "test_agentless" to "a_different_package").'
      );

      expect(packagePolicyService.update).not.toHaveBeenCalled();
      expect(jest.mocked(agentPolicyService.update)).not.toHaveBeenCalled();
    });

    it('should allow a package version change and re-derive package info from the requested version', async () => {
      await createService().updateAgentlessPolicy(
        'agentless-policy-id',
        buildUpdateRequest({ package: { name: 'test_agentless', version: '2.0.0' } })
      );

      // Package info must be loaded for the requested version, not the stored one.
      expect(jest.mocked(getPackageInfo)).toHaveBeenCalledWith(
        expect.objectContaining({ pkgName: 'test_agentless', pkgVersion: '2.0.0' })
      );
      expect(packagePolicyService.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'agentless-policy-id',
        expect.objectContaining({ package: expect.objectContaining({ version: '2.0.0' }) }),
        expect.objectContaining({ bumpRevision: false })
      );
      expect(jest.mocked(agentPolicyService.deployPolicy)).toHaveBeenCalledTimes(1);
    });

    it('should roll back the package and agent policy when the deploy fails', async () => {
      jest
        .mocked(agentPolicyService.deployPolicy)
        .mockRejectedValueOnce(new Error('Error calling agentless API'));

      await expect(() =>
        createService().updateAgentlessPolicy('agentless-policy-id', buildUpdateRequest())
      ).rejects.toThrow('Error calling agentless API');

      // Once for the update, once for the restore.
      expect(packagePolicyService.update).toHaveBeenCalledTimes(2);
      expect(jest.mocked(agentPolicyService.update)).toHaveBeenCalledTimes(2);
      // The restore re-applies the prior agent policy state.
      expect(jest.mocked(agentPolicyService.update)).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        'agentless-policy-id',
        expect.objectContaining({
          name: 'Agentless policy for Test Agentless Policy',
          agentless: expect.objectContaining({ cluster_id: 'cluster-123' }),
        }),
        expect.objectContaining({ force: true })
      );
    });

    it('should detach the cloud connector when cloud_connector is omitted on update', async () => {
      packagePolicyService.get.mockReset();
      packagePolicyService.get.mockResolvedValue(
        buildAgentlessPackagePolicy({ cloud_connector_id: 'old-connector-id' })
      );
      const createSpy = jest.spyOn(cloudConnectorService, 'create');
      const deleteSpy = jest.spyOn(cloudConnectorService, 'delete');

      const result = await createService().updateAgentlessPolicy(
        'agentless-policy-id',
        buildUpdateRequest()
      );

      expect(createSpy).not.toHaveBeenCalled();
      expect(result.cloud_connector).toBeNull();
      // The connector fields must be sent as explicit clearing values (null / false), NOT omitted:
      // `packagePolicyService.update` persists via a partial saved-object update where an omitted
      // (undefined) field is dropped on serialization and the stale stored value would be retained.
      expect(packagePolicyService.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'agentless-policy-id',
        expect.objectContaining({ cloud_connector_id: null, supports_cloud_connector: false }),
        expect.anything()
      );
      // The previously-attached connector saved object is left intact: connectors have an
      // independent, shareable lifecycle and Fleet never garbage-collects them on detach.
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('should not delete the previously-attached connector when swapping to a different one', async () => {
      packagePolicyService.get.mockReset();
      packagePolicyService.get.mockResolvedValue(
        buildAgentlessPackagePolicy({
          package: {
            name: 'cloud_security_posture',
            title: 'Cloud Security Posture',
            version: '3.1.1',
          },
          cloud_connector_id: 'old-connector-id',
        })
      );
      jest.mocked(getPackageInfo).mockReset();
      jest.mocked(getPackageInfo).mockResolvedValue({
        name: 'cloud_security_posture',
        title: 'Cloud Security Posture',
        version: '3.1.1',
        type: 'integration',
        data_streams: [
          {
            dataset: 'cloud_security_posture.findings',
            type: 'logs',
            title: 'Findings',
            package: 'cloud_security_posture',
            path: 'findings',
            streams: [
              {
                input: 'cloudbeat/cis_aws',
                enabled: true,
                template_path: 'findings.yml.hbs',
                title: 'Findings',
                vars: [{ name: 'role_arn', type: 'text', default: '' }],
              },
            ],
          },
        ],
        policy_templates: [
          {
            name: 'cspm',
            deployment_modes: { agentless: { enabled: true, resources: {} } },
            inputs: [{ type: 'cloudbeat/cis_aws', title: 'CIS AWS' }],
          },
        ],
      } as any);

      const getByIdSpy = jest.spyOn(cloudConnectorService, 'getById');
      getByIdSpy.mockResolvedValue({
        id: 'new-connector-id',
        name: 'new-connector',
        cloudProvider: 'aws',
        vars: {},
        packagePolicyCount: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);
      const createSpy = jest.spyOn(cloudConnectorService, 'create');
      const deleteSpy = jest.spyOn(cloudConnectorService, 'delete');

      const result = await createService().updateAgentlessPolicy(
        'agentless-policy-id',
        buildUpdateRequest({
          package: { name: 'cloud_security_posture', version: '3.1.1' },
          cloud_connector: {
            enabled: true,
            target_csp: 'aws',
            cloud_connector_id: 'new-connector-id',
          },
          inputs: {
            'cspm-cloudbeat/cis_aws': {
              enabled: true,
              streams: {
                'cloud_security_posture.findings': {
                  enabled: true,
                  vars: { role_arn: 'arn:aws:iam::123456789012:role/TestRole' },
                },
              },
            },
          },
        })
      );

      // Reused the supplied connector, created nothing, and crucially did NOT delete the old one.
      expect(createSpy).not.toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(result.cloud_connector).toEqual({
        enabled: true,
        cloud_connector_id: 'new-connector-id',
      });
    });

    it('should create and wire a cloud connector when enabling it on update', async () => {
      // The stored policy must already be on the cloud_security_posture package: the package
      // name is immutable, so the cloud-connector enable transition happens within it.
      packagePolicyService.get.mockReset();
      packagePolicyService.get.mockResolvedValue(
        buildAgentlessPackagePolicy({
          package: {
            name: 'cloud_security_posture',
            title: 'Cloud Security Posture',
            version: '3.1.1',
          },
        })
      );
      jest.mocked(getPackageInfo).mockReset();
      jest.mocked(getPackageInfo).mockResolvedValue({
        name: 'cloud_security_posture',
        title: 'Cloud Security Posture',
        version: '3.1.1',
        type: 'integration',
        data_streams: [
          {
            dataset: 'cloud_security_posture.findings',
            type: 'logs',
            title: 'Findings',
            package: 'cloud_security_posture',
            path: 'findings',
            streams: [
              {
                input: 'cloudbeat/cis_aws',
                enabled: true,
                template_path: 'findings.yml.hbs',
                title: 'Findings',
                vars: [
                  { name: 'role_arn', type: 'text', default: '' },
                  { name: 'external_id', type: 'text', default: '' },
                ],
              },
            ],
          },
        ],
        policy_templates: [
          {
            name: 'cspm',
            deployment_modes: { agentless: { enabled: true, resources: {} } },
            inputs: [{ type: 'cloudbeat/cis_aws', title: 'CIS AWS' }],
          },
        ],
      } as any);

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

      const result = await createService().updateAgentlessPolicy(
        'agentless-policy-id',
        buildUpdateRequest({
          package: { name: 'cloud_security_posture', version: '3.1.1' },
          cloud_connector: { enabled: true, target_csp: 'aws' },
          inputs: {
            'cspm-cloudbeat/cis_aws': {
              enabled: true,
              streams: {
                'cloud_security_posture.findings': {
                  enabled: true,
                  vars: {
                    role_arn: 'arn:aws:iam::123456789012:role/TestRole',
                    external_id: { id: 'ABCDEFGHIJKLMNOPQRST', isSecretRef: true },
                  },
                },
              },
            },
          },
        })
      );

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(result.cloud_connector).toEqual({
        enabled: true,
        cloud_connector_id: 'aws-cloud-connector-123',
      });
      expect(jest.mocked(agentPolicyService.deployPolicy)).toHaveBeenCalledWith(
        expect.anything(),
        'agentless-policy-id',
        undefined,
        expect.objectContaining({ throwOnAgentlessError: true })
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

  describe('getAgentlessPolicy', () => {
    let packagePolicyService: ReturnType<typeof createPackagePolicyServiceMock>;

    const createService = () =>
      new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        savedObjectsClientMock.create(),
        elasticsearchServiceMock.createClusterClient().asInternalUser,
        loggingSystemMock.createLogger()
      );

    beforeEach(() => {
      jest.resetAllMocks();
      packagePolicyService = createPackagePolicyServiceMock();
    });

    it('should return the mapped agentless policy when the package policy supports agentless', async () => {
      packagePolicyService.get.mockResolvedValueOnce(buildAgentlessPackagePolicy());

      const result = await createService().getAgentlessPolicy('agentless-policy-id');

      expect(packagePolicyService.get).toHaveBeenCalledWith(
        expect.anything(),
        'agentless-policy-id'
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: 'agentless-policy-id',
          name: 'Test Agentless Policy',
          namespace: 'default',
          package: { name: 'test_agentless', title: 'Test Agentless', version: '1.0.0' },
        })
      );
      // Internal Fleet fields must not leak through the agentless contract
      expect(result).not.toHaveProperty('policy_ids');
      expect(result).not.toHaveProperty('revision');
      expect(result).not.toHaveProperty('supports_agentless');
    });

    it('should return null when the package policy is not agentless', async () => {
      packagePolicyService.get.mockResolvedValueOnce(
        buildAgentlessPackagePolicy({ supports_agentless: false })
      );

      const result = await createService().getAgentlessPolicy('regular-policy-id');

      expect(result).toBeNull();
    });

    it('should return null when packagePolicyService.get resolves null', async () => {
      packagePolicyService.get.mockResolvedValueOnce(null);

      const result = await createService().getAgentlessPolicy('missing-policy-id');

      expect(result).toBeNull();
    });

    it('should return null when packagePolicyService.get throws a not found error', async () => {
      packagePolicyService.get.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createGenericNotFoundError('test')
      );

      const result = await createService().getAgentlessPolicy('missing-policy-id');

      expect(result).toBeNull();
    });

    it('should rethrow non not-found errors from packagePolicyService.get', async () => {
      packagePolicyService.get.mockRejectedValueOnce(new Error('boom'));

      await expect(() => createService().getAgentlessPolicy('some-policy-id')).rejects.toThrow(
        'boom'
      );
    });
  });

  describe('listAgentlessPolicies', () => {
    let packagePolicyService: ReturnType<typeof createPackagePolicyServiceMock>;

    const createService = () =>
      new AgentlessPoliciesServiceImpl(
        packagePolicyService,
        savedObjectsClientMock.create(),
        elasticsearchServiceMock.createClusterClient().asInternalUser,
        loggingSystemMock.createLogger()
      );

    beforeEach(() => {
      jest.resetAllMocks();
      packagePolicyService = createPackagePolicyServiceMock();
      packagePolicyService.list.mockResolvedValue({
        items: [buildAgentlessPackagePolicy()],
        total: 1,
        page: 1,
        perPage: 20,
      });
    });

    it('should scope the query to agentless policies and map the results', async () => {
      const result = await createService().listAgentlessPolicies();

      expect(packagePolicyService.list).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          kuery: 'fleet-package-policies.supports_agentless:true',
        })
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({ id: 'agentless-policy-id', name: 'Test Agentless Policy' })
      );
      expect(result.items[0]).not.toHaveProperty('supports_agentless');
      expect(result).toEqual(expect.objectContaining({ total: 1, page: 1, perPage: 20 }));
    });

    it('should apply the default paging and sorting contract', async () => {
      await createService().listAgentlessPolicies();

      expect(packagePolicyService.list).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          page: 1,
          perPage: 20,
          sortField: 'updated_at',
          sortOrder: 'desc',
        })
      );
    });

    it('should forward caller paging, sorting and combine the kuery', async () => {
      await createService().listAgentlessPolicies({
        page: 2,
        perPage: 5,
        sortField: 'name',
        sortOrder: 'asc',
        kuery: 'name:foo',
      });

      expect(packagePolicyService.list).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          page: 2,
          perPage: 5,
          sortField: 'name',
          sortOrder: 'asc',
          kuery:
            '(fleet-package-policies.supports_agentless:true) AND (fleet-package-policies.name: foo)',
        })
      );
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
