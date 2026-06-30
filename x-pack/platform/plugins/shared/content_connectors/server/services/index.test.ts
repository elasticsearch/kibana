/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { ElasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import type { ConnectorMetadata, PackagePolicyMetadata } from '.';
import { AgentlessConnectorsInfraService, getConnectorsToDeploy, getPoliciesToDelete } from '.';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import type { MockedLogger } from '@kbn/logging-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import {
  createPackagePolicyServiceMock,
  createMockAgentService,
  createMockAgentlessPoliciesService,
} from '@kbn/fleet-plugin/server/mocks';
import type {
  AgentlessPoliciesService,
  AgentService,
  PackagePolicyClient,
} from '@kbn/fleet-plugin/server';
import type { AgentlessPolicy, PackagePolicy, PackagePolicyInput } from '@kbn/fleet-plugin/common';
import { createAgentlessPolicyMock, createPackagePolicyMock } from '@kbn/fleet-plugin/common/mocks';

jest.mock('@kbn/fleet-plugin/server/services/epm/packages', () => {
  const mockedGetPackageInfo = ({ pkgName }: { pkgName: string }) => {
    if (pkgName === 'elastic_connectors') {
      const pkg = {
        version: '0.0.5',
        policy_templates: [
          {
            name: 'github_elastic_connectors',
            inputs: [
              {
                type: 'connectors-py',
                vars: [
                  {
                    name: 'connector_id',
                    required: false,
                    type: 'string',
                  },
                  {
                    name: 'connector_name',
                    required: false,
                    type: 'string',
                  },
                  {
                    name: 'service_type',
                    required: false,
                    type: 'string',
                  },
                ],
              },
            ],
          },
        ],
      };

      return Promise.resolve(pkg);
    }
  };
  return {
    getPackageInfo: jest.fn().mockImplementation(mockedGetPackageInfo),
  };
});

describe('AgentlessConnectorsInfraService', () => {
  let soClient: jest.Mocked<SavedObjectsClientContract>;
  let esClient: ElasticsearchClientMock;
  let packagePolicyService: jest.Mocked<PackagePolicyClient>;
  let agentlessPoliciesService: jest.Mocked<AgentlessPoliciesService>;
  let agentService: jest.Mocked<AgentService>;
  let logger: MockedLogger;
  let service: AgentlessConnectorsInfraService;

  beforeEach(async () => {
    soClient = savedObjectsClientMock.create();
    esClient = elasticsearchClientMock.createClusterClient().asInternalUser;
    packagePolicyService = createPackagePolicyServiceMock();
    agentlessPoliciesService = createMockAgentlessPoliciesService();
    agentService = createMockAgentService();
    logger = loggerMock.create();

    service = new AgentlessConnectorsInfraService(
      soClient,
      esClient,
      packagePolicyService,
      agentlessPoliciesService,
      agentService,
      logger
    );

    jest.clearAllMocks();
  });

  describe('getNativeConnectors', () => {
    test('Lists only native connectors', async () => {
      const mockResult = {
        results: [
          {
            id: '00000001',
            name: 'Sharepoint Online Production Connector',
            service_type: 'sharepoint_online',
            is_native: false,
            deleted: false,
          },
          {
            id: '00000002',
            name: 'Github Connector for ACME Organisation',
            service_type: 'github',
            is_native: true,
            deleted: true,
          },
        ],
        count: 2,
      };
      esClient.transport.request.mockResolvedValue(mockResult);

      const nativeConnectors = await service.getNativeConnectors();
      expect(nativeConnectors.length).toBe(1);
      expect(nativeConnectors[0].id).toBe(mockResult.results[1].id);
      expect(nativeConnectors[0].name).toBe(mockResult.results[1].name);
      expect(nativeConnectors[0].service_type).toBe(mockResult.results[1].service_type);
      expect(nativeConnectors[0].is_deleted).toBe(mockResult.results[1].deleted);
    });

    test('Lists only supported service types', async () => {
      const mockResult = {
        results: [
          {
            id: '00000001',
            name: 'Sharepoint Online Production Connector',
            service_type: 'sharepoint_online',
            is_native: true,
            deleted: false,
          },
          {
            id: '00000002',
            name: 'Github Connector for ACME Organisation',
            service_type: 'github',
            is_native: true,
            deleted: true,
          },
          {
            id: '00000003',
            name: 'Connector with unexpected service_type',
            service_type: 'crawler',
            is_native: true,
            deleted: false,
          },
          {
            id: '00000004',
            name: 'Connector with no service_type',
            service_type: null,
            is_native: true,
            deleted: true,
          },
        ],
        count: 4,
      };
      esClient.transport.request.mockResolvedValue(mockResult);

      const nativeConnectors = await service.getNativeConnectors();
      expect(nativeConnectors.length).toBe(2);
      expect(nativeConnectors[0].id).toBe(mockResult.results[0].id);
      expect(nativeConnectors[0].name).toBe(mockResult.results[0].name);
      expect(nativeConnectors[0].service_type).toBe(mockResult.results[0].service_type);
      expect(nativeConnectors[0].is_deleted).toBe(mockResult.results[0].deleted);
      expect(nativeConnectors[1].id).toBe(mockResult.results[1].id);
      expect(nativeConnectors[1].name).toBe(mockResult.results[1].name);
      expect(nativeConnectors[1].service_type).toBe(mockResult.results[1].service_type);
      expect(nativeConnectors[1].is_deleted).toBe(mockResult.results[1].deleted);
    });
  });
  describe('getConnectorPackagePolicies', () => {
    const getMockPolicyFetchAllItems = (pages: PackagePolicy[][]) => {
      return {
        async *[Symbol.asyncIterator]() {
          for (const page of pages) {
            yield page;
          }
        },
      } as AsyncIterable<PackagePolicy[]>;
    };

    test('Lists only policies with expected input', async () => {
      const firstPackagePolicy = createPackagePolicyMock();
      firstPackagePolicy.id = 'this-is-package-policy-id';
      firstPackagePolicy.policy_ids = ['this-is-agent-policy-id'];
      firstPackagePolicy.supports_agentless = true;
      firstPackagePolicy.inputs = [
        {
          type: 'connectors-py',
          compiled_input: {
            connector_id: '00000001',
            connector_name: 'Sharepoint Online Production Connector',
            service_type: 'sharepoint_online',
          },
        } as PackagePolicyInput,
      ];
      const secondPackagePolicy = createPackagePolicyMock();
      secondPackagePolicy.supports_agentless = true;
      const thirdPackagePolicy = createPackagePolicyMock();
      thirdPackagePolicy.supports_agentless = true;
      thirdPackagePolicy.inputs = [
        {
          type: 'something-unsupported',
          compiled_input: {
            connector_id: '00000001',
            connector_name: 'Sharepoint Online Production Connector',
            service_type: 'sharepoint_online',
          },
        } as PackagePolicyInput,
      ];

      packagePolicyService.fetchAllItems.mockResolvedValue(
        getMockPolicyFetchAllItems([[firstPackagePolicy, secondPackagePolicy, thirdPackagePolicy]])
      );

      const policies = await service.getConnectorPackagePolicies();

      expect(policies.length).toBe(1);
      expect(policies[0].package_policy_id).toBe(firstPackagePolicy.id);
      expect(policies[0].connector_settings.id).toBe(
        firstPackagePolicy.inputs[0].compiled_input.connector_id
      );
      expect(policies[0].connector_settings.name).toBe(
        firstPackagePolicy.inputs[0].compiled_input.connector_name
      );
      expect(policies[0].connector_settings.service_type).toBe(
        firstPackagePolicy.inputs[0].compiled_input.service_type
      );
      expect(policies[0].agent_policy_ids).toBe(firstPackagePolicy.policy_ids);
    });

    test('Lists policies if they are returned over multiple pages', async () => {
      const firstPackagePolicy = createPackagePolicyMock();
      firstPackagePolicy.id = 'this-is-package-policy-id';
      firstPackagePolicy.policy_ids = ['this-is-agent-policy-id'];
      firstPackagePolicy.supports_agentless = true;
      firstPackagePolicy.inputs = [
        {
          type: 'connectors-py',
          compiled_input: {
            connector_id: '00000001',
            connector_name: 'Sharepoint Online Production Connector',
            service_type: 'sharepoint_online',
          },
        } as PackagePolicyInput,
      ];
      const secondPackagePolicy = createPackagePolicyMock();
      secondPackagePolicy.supports_agentless = true;
      const thirdPackagePolicy = createPackagePolicyMock();
      thirdPackagePolicy.supports_agentless = true;
      thirdPackagePolicy.inputs = [
        {
          type: 'connectors-py',
          compiled_input: {
            connector_id: '00000003',
            connector_name: 'Sharepoint Online Production Connector',
            service_type: 'github',
          },
        } as PackagePolicyInput,
      ];

      packagePolicyService.fetchAllItems.mockResolvedValue(
        getMockPolicyFetchAllItems([
          [firstPackagePolicy],
          [secondPackagePolicy],
          [thirdPackagePolicy],
        ])
      );

      const policies = await service.getConnectorPackagePolicies();

      expect(policies.length).toBe(2);
      expect(policies[0].package_policy_id).toBe(firstPackagePolicy.id);
      expect(policies[0].connector_settings.id).toBe(
        firstPackagePolicy.inputs[0].compiled_input.connector_id
      );
      expect(policies[0].connector_settings.name).toBe(
        firstPackagePolicy.inputs[0].compiled_input.connector_name
      );
      expect(policies[0].connector_settings.service_type).toBe(
        firstPackagePolicy.inputs[0].compiled_input.service_type
      );
      expect(policies[0].agent_policy_ids).toBe(firstPackagePolicy.policy_ids);

      expect(policies[1].package_policy_id).toBe(thirdPackagePolicy.id);
      expect(policies[1].connector_settings.id).toBe(
        thirdPackagePolicy.inputs[0].compiled_input.connector_id
      );
      expect(policies[1].connector_settings.name).toBe(
        thirdPackagePolicy.inputs[0].compiled_input.connector_name
      );
      expect(policies[1].connector_settings.service_type).toBe(
        thirdPackagePolicy.inputs[0].compiled_input.service_type
      );
      expect(policies[1].agent_policy_ids).toBe(thirdPackagePolicy.policy_ids);
    });

    test('Returns policies that have missing connector_id and connector_name but not service_type', async () => {
      const firstPackagePolicy = createPackagePolicyMock();
      firstPackagePolicy.id = 'this-is-package-policy-id';
      firstPackagePolicy.policy_ids = ['this-is-agent-policy-id'];
      firstPackagePolicy.inputs = [
        {
          type: 'connectors-py',
          compiled_input: {
            connector_id: '00000001',
            connector_name: 'Sharepoint Online Production Connector',
          },
        } as PackagePolicyInput,
      ];
      const secondPackagePolicy = createPackagePolicyMock();
      secondPackagePolicy.inputs = [
        {
          type: 'connectors-py',
          compiled_input: {
            connector_name: 'Sharepoint Online Production Connector',
            service_type: 'github',
          },
        } as PackagePolicyInput,
      ];

      const thirdPackagePolicy = createPackagePolicyMock();
      thirdPackagePolicy.inputs = [
        {
          type: 'connectors-py',
          compiled_input: {
            connector_id: '000002',
            service_type: 'github',
          },
        } as PackagePolicyInput,
      ];

      packagePolicyService.fetchAllItems.mockResolvedValue(
        getMockPolicyFetchAllItems([
          [firstPackagePolicy],
          [secondPackagePolicy],
          [thirdPackagePolicy],
        ])
      );

      const policies = await service.getConnectorPackagePolicies();

      expect(policies.length).toBe(2);
    });
  });
  describe('deployConnector', () => {
    let agentlessPolicy: AgentlessPolicy;
    let sharepointOnlinePackagePolicy: PackagePolicy;

    beforeAll(() => {
      agentlessPolicy = createAgentlessPolicyMock();

      sharepointOnlinePackagePolicy = createPackagePolicyMock();
      sharepointOnlinePackagePolicy.id = 'this-is-package-policy-id';
      sharepointOnlinePackagePolicy.policy_ids = ['this-is-agent-policy-id'];
      sharepointOnlinePackagePolicy.inputs = [
        {
          type: 'connectors-py',
          compiled_input: {
            connector_id: '00000001',
            connector_name: 'Sharepoint Online Production Connector',
            service_type: 'sharepoint_online',
          },
        } as PackagePolicyInput,
      ];
    });

    test('Raises an error if connector.id is missing', async () => {
      const connector = {
        id: '',
        name: 'something',
        service_type: 'github',
        is_deleted: false,
      };

      try {
        await service.deployConnector(connector);
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toContain('Connector id');
      }
    });

    test('Raises an error if connector.service_type is missing', async () => {
      const connector = {
        id: '000000001',
        name: 'something',
        service_type: '',
        is_deleted: false,
      };

      try {
        await service.deployConnector(connector);
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toContain('service_type');
      }
    });

    test('Raises an error if connector.service_type is unsupported', async () => {
      const connector = {
        id: '000000001',
        name: 'something',
        service_type: 'crawler',
        is_deleted: false,
      };

      try {
        await service.deployConnector(connector);
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toContain('service_type');
        expect(e.message).toContain('incompatible');
      }
    });

    test('Raises an error if connector.is_deleted is true', async () => {
      const connector = {
        id: '000000001',
        name: 'something',
        service_type: 'github',
        is_deleted: true,
      };

      try {
        await service.deployConnector(connector);
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toContain('deleted');
      }
    });

    test('Does not swallow an error if agent with package policies creation failed', async () => {
      const connector = {
        id: '000000001',
        name: 'something',
        service_type: 'github',
        is_deleted: false,
      };
      const errorMessage = 'Failed to create an agent policy hehe';

      agentlessPoliciesService.createAgentlessPolicy.mockImplementationOnce(() => {
        throw new Error(errorMessage);
      });

      try {
        await service.deployConnector(connector);
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toEqual(errorMessage);
      }
    });

    test('Returns a created agent policy when all goes well', async () => {
      const connector = {
        id: '000000001',
        name: 'something',
        service_type: 'github',
        is_deleted: false,
      };

      agentlessPoliciesService.createAgentlessPolicy.mockResolvedValue(agentlessPolicy);

      const result = await service.deployConnector(connector);
      expect(result).toBe(agentlessPolicy);
    });

    test('call agentlessPoliciesService.createAgentlessPolicy with correct params', async () => {
      const testConnector = {
        id: '000000005',
        name: 'Test Agentless Connector',
        service_type: 'github',
        is_deleted: false,
      };

      const fakeAgentPolicy = { id: 'agent-policy-005' } as AgentlessPolicy;
      agentlessPoliciesService.createAgentlessPolicy.mockResolvedValue(fakeAgentPolicy);

      const result = await service.deployConnector(testConnector);

      expect(agentlessPoliciesService.createAgentlessPolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          inputs: {
            'github-connectors-py': {
              enabled: true,
              streams: {},
              vars: {
                connector_id: '000000005',
                connector_name: 'Test Agentless Connector',
              },
            },
          },
          policy_template: 'github',
          name: 'github connector 000000005',
          namespace: '',
          package: { name: 'elastic_connectors', version: '0.0.5' },
        })
      );

      expect(result).toBe(fakeAgentPolicy);
    });

    test.each([
      ['microsoft_teams', 'teams'],
      ['mssql', 'microsoft_sql'],
      ['s3', 'amazon_s3'],
    ])(
      'maps service_type "%s" to policy_template "%s" (issue #266539)',
      async (serviceType, expectedPolicyTemplate) => {
        const testConnector = {
          id: '000000006',
          name: 'Test Agentless Connector',
          service_type: serviceType,
          is_deleted: false,
        };

        const fakeAgentPolicy = { id: 'agent-policy-006' } as AgentlessPolicy;
        agentlessPoliciesService.createAgentlessPolicy.mockResolvedValue(fakeAgentPolicy);

        await service.deployConnector(testConnector);

        expect(agentlessPoliciesService.createAgentlessPolicy).toHaveBeenCalledWith(
          expect.objectContaining({
            policy_template: expectedPolicyTemplate,
            inputs: expect.objectContaining({
              [`${expectedPolicyTemplate}-connectors-py`]: expect.anything(),
            }),
          })
        );
      }
    );
  });
  describe('removeDeployment', () => {
    const packagePolicyId = 'this-is-package-policy-id';
    const agentPolicyId = 'this-is-agent-policy-id';
    let sharepointOnlinePackagePolicy: PackagePolicy;

    beforeAll(() => {
      sharepointOnlinePackagePolicy = createPackagePolicyMock();
      sharepointOnlinePackagePolicy.id = packagePolicyId;
      sharepointOnlinePackagePolicy.policy_ids = [agentPolicyId];
      sharepointOnlinePackagePolicy.inputs = [
        {
          type: 'connectors-py',
          compiled_input: {
            connector_id: '00000001',
            connector_name: 'Sharepoint Online Production Connector',
            service_type: 'sharepoint_online',
          },
        } as PackagePolicyInput,
      ];
    });

    test('Calls for deletion of both agent policy and package policy', async () => {
      packagePolicyService.get.mockResolvedValue(sharepointOnlinePackagePolicy);

      await service.removeDeployment(packagePolicyId);

      expect(agentlessPoliciesService.deleteAgentlessPolicy).toBeCalledWith(agentPolicyId);
      expect(packagePolicyService.delete).toBeCalledWith(soClient, esClient, [packagePolicyId]);
    });

    test('Raises an error if deletion of agent policy failed', async () => {
      packagePolicyService.get.mockResolvedValue(sharepointOnlinePackagePolicy);

      const errorMessage = 'Failed to create a package policy hehe';

      agentlessPoliciesService.deleteAgentlessPolicy.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      try {
        await service.removeDeployment(packagePolicyId);
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toEqual(errorMessage);
      }
    });

    test('Raises an error if deletion of package policy failed', async () => {
      packagePolicyService.get.mockResolvedValue(sharepointOnlinePackagePolicy);

      const errorMessage = 'Failed to create a package policy hehe';

      packagePolicyService.delete.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      try {
        await service.removeDeployment(packagePolicyId);
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toEqual(errorMessage);
      }
    });

    test('Raises an error if a policy is not found', async () => {
      packagePolicyService.get.mockResolvedValue(null);

      try {
        await service.removeDeployment(packagePolicyId);
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toContain('Failed to delete policy');
        expect(e.message).toContain(packagePolicyId);
      }
    });
  });
});

describe('module', () => {
  const githubConnector: ConnectorMetadata = {
    id: '000001',
    name: 'Github Connector',
    service_type: 'github',
    is_deleted: false,
  };

  const sharepointConnector: ConnectorMetadata = {
    id: '000002',
    name: 'Sharepoint Connector',
    service_type: 'sharepoint_online',
    is_deleted: false,
  };

  const mysqlConnector: ConnectorMetadata = {
    id: '000003',
    name: 'MySQL Connector',
    service_type: 'mysql',
    is_deleted: false,
  };

  const confluenceConnector: ConnectorMetadata = {
    id: '000004',
    name: 'Confluence Connector',
    service_type: 'confluence',
    is_deleted: false,
  };

  const confluenceConnectorEmptySettings: ConnectorMetadata = {
    id: '',
    name: '',
    service_type: 'confluence',
    is_deleted: false,
  };

  const deleted = (connector: ConnectorMetadata): ConnectorMetadata => {
    return {
      id: connector.id,
      name: connector.name,
      service_type: connector.service_type,
      is_deleted: true,
    };
  };

  const githubPackagePolicy: PackagePolicyMetadata = {
    package_policy_id: 'agent-001',
    agent_policy_ids: ['agent-package-001'],
    package_policy_name: 'Agentless github_connector',
    package_name: 'Elastic Connectors',
    connector_settings: githubConnector,
  };

  const sharepointPackagePolicy: PackagePolicyMetadata = {
    package_policy_id: 'agent-002',
    agent_policy_ids: ['agent-package-002'],
    package_policy_name: 'Agentless spo_connector',
    package_name: 'Elastic Connectors',
    connector_settings: sharepointConnector,
  };

  const mysqlPackagePolicy: PackagePolicyMetadata = {
    package_policy_id: 'agent-003',
    agent_policy_ids: ['agent-package-003'],
    package_policy_name: 'Agentless mysql_connector',
    package_name: 'Elastic Connectors',
    connector_settings: mysqlConnector,
  };

  const confluencePackagePolicy: PackagePolicyMetadata = {
    package_policy_id: '000004',
    agent_policy_ids: [],
    package_policy_name: '',
    package_name: 'Elastic Connectors',
    connector_settings: confluenceConnectorEmptySettings,
  };

  describe('getPoliciesToDelete', () => {
    test('Returns one policy if connector has been soft-deleted', async () => {
      const policiesToDelete = getPoliciesToDelete(
        [githubPackagePolicy, sharepointPackagePolicy, mysqlPackagePolicy],
        [deleted(githubConnector), sharepointConnector, mysqlConnector]
      );

      expect(policiesToDelete.length).toBe(1);
      expect(policiesToDelete).toContain(githubPackagePolicy);
    });

    test('Returns empty array if no connectors were soft-deleted', async () => {
      const policiesToDelete = getPoliciesToDelete(
        [githubPackagePolicy, sharepointPackagePolicy, mysqlPackagePolicy],
        [githubConnector, sharepointConnector, mysqlConnector]
      );

      expect(policiesToDelete.length).toBe(0);
    });

    test('Returns no policies if no connectors are passed', async () => {
      const policiesToDelete = getPoliciesToDelete(
        [githubPackagePolicy, sharepointPackagePolicy, mysqlPackagePolicy],
        []
      );

      expect(policiesToDelete.length).toBe(0);
    });

    test('Returns all policies if all connectors were soft-deleted', async () => {
      const policiesToDelete = getPoliciesToDelete(
        [githubPackagePolicy, sharepointPackagePolicy, mysqlPackagePolicy],
        [deleted(githubConnector), deleted(sharepointConnector), deleted(mysqlConnector)]
      );

      expect(policiesToDelete.length).toBe(3);
      expect(policiesToDelete).toContain(githubPackagePolicy);
      expect(policiesToDelete).toContain(sharepointPackagePolicy);
      expect(policiesToDelete).toContain(mysqlPackagePolicy);
    });
  });

  describe('getConnectorsToDeploy', () => {
    test('Returns a single connector if only one is missing', async () => {
      const missingConnectors = getConnectorsToDeploy(
        [githubPackagePolicy, sharepointPackagePolicy],
        [githubConnector, sharepointConnector, mysqlConnector]
      );

      expect(missingConnectors.length).toBe(1);
      expect(missingConnectors).toContain(mysqlConnector);
    });

    test('Returns empty array if all policies have a matching connector', async () => {
      const missingConnectors = getConnectorsToDeploy(
        [githubPackagePolicy, sharepointPackagePolicy, mysqlPackagePolicy],
        [githubConnector, sharepointConnector, mysqlConnector]
      );

      expect(missingConnectors.length).toBe(0);
    });

    test('Does not include soft-deleted connectors', async () => {
      const missingConnectors = getConnectorsToDeploy(
        [],
        [deleted(githubConnector), deleted(sharepointConnector), deleted(mysqlConnector)]
      );

      expect(missingConnectors.length).toBe(0);
    });

    test('Returns all policies if no connectors are present', async () => {
      const missingConnectors = getConnectorsToDeploy(
        [],
        [githubConnector, sharepointConnector, mysqlConnector]
      );

      expect(missingConnectors.length).toBe(3);
      expect(missingConnectors).toContain(githubConnector);
      expect(missingConnectors).toContain(sharepointConnector);
      expect(missingConnectors).toContain(mysqlConnector);
    });

    test('Returns none if Policy is created without a connector_id or connector_name', async () => {
      const missingConnectors = getConnectorsToDeploy(
        [githubPackagePolicy, sharepointPackagePolicy, mysqlPackagePolicy, confluencePackagePolicy],
        [githubConnector, sharepointConnector, mysqlConnector, confluenceConnector]
      );

      expect(missingConnectors.length).toBe(0);
    });
  });
});
