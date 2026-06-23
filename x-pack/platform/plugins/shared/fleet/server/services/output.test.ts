/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock, elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { securityMock } from '@kbn/security-plugin/server/mocks';
import type { Logger } from '@kbn/logging';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';

import { RESERVED_CONFIG_YML_KEYS } from '../../common/constants';
import type { OutputSOAttributes } from '../types';
import { OUTPUT_SAVED_OBJECT_TYPE, SO_SEARCH_LIMIT } from '../constants';

import { outputService, outputIdToUuid } from './output';
import { appContextService } from './app_context';
import { agentPolicyService } from './agent_policy';
import { packagePolicyService } from './package_policy';
import { auditLoggingService } from './audit_logging';
import { findAgentlessPolicies } from './outputs/helpers';
import { outputSavedObjectToOutput } from './output';

jest.mock('./app_context');
jest.mock('./agent_policy');
jest.mock('./package_policy');
jest.mock('./audit_logging');
jest.mock('./secrets');
jest.mock('./outputs/helpers');

const mockedFindAgentlessPolicies = findAgentlessPolicies as jest.MockedFunction<
  typeof findAgentlessPolicies
>;

const mockedAuditLoggingService = auditLoggingService as jest.Mocked<typeof auditLoggingService>;
const mockedAppContextService = appContextService as jest.Mocked<typeof appContextService>;
mockedAppContextService.getSecuritySetup.mockImplementation(() => ({
  ...securityMock.createSetup(),
}));

const mockedLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;
mockedAppContextService.getLogger.mockImplementation(() => {
  return mockedLogger;
});

mockedAppContextService.getExperimentalFeatures.mockReturnValue({} as any);

const mockedAgentPolicyService = agentPolicyService as jest.Mocked<typeof agentPolicyService>;
const mockedPackagePolicyService = packagePolicyService as jest.Mocked<typeof packagePolicyService>;

const CLOUD_ID =
  'dXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRjZWM2ZjI2MWE3NGJmMjRjZTMzYmI4ODExYjg0Mjk0ZiRjNmMyY2E2ZDA0MjI0OWFmMGNjN2Q3YTllOTYyNTc0Mw==';

const CONFIG_WITH_ES_HOSTS = {
  enabled: true,
  agents: {
    enabled: true,
    elasticsearch: {
      hosts: ['http://host1.com'],
    },
  },
};

const CONFIG_WITHOUT_ES_HOSTS = {
  enabled: true,
  agents: {
    enabled: true,
    elasticsearch: {},
  },
};

function mockOutputSO(id: string, attributes: any = {}, updatedAt?: string) {
  return {
    id: outputIdToUuid(id),
    type: 'ingest-outputs',
    references: [],
    attributes: {
      name: 'Test',
      output_id: id,
      ...attributes,
    },
    updated_at: updatedAt,
  };
}

function getMockedSoClient(
  options: { defaultOutputId?: string; defaultOutputMonitoringId?: string } = {}
) {
  const soClient = savedObjectsClientMock.create();

  soClient.get.mockImplementation(async (type: string, id: string) => {
    switch (id) {
      case outputIdToUuid('output-test'): {
        return mockOutputSO('output-test');
      }
      case outputIdToUuid('existing-default-output'): {
        return mockOutputSO('existing-default-output');
      }
      case outputIdToUuid('existing-default-monitoring-output'): {
        return mockOutputSO('existing-default-monitoring-output', {
          is_default: true,
          type: 'elasticsearch',
        });
      }
      case outputIdToUuid('existing-default-and-default-monitoring-output'): {
        return mockOutputSO('existing-default-and-default-monitoring-output', {
          is_default: true,
          is_default_monitoring: true,
        });
      }
      case outputIdToUuid('existing-preconfigured-default-output'): {
        return mockOutputSO('existing-preconfigured-default-output', {
          is_default: true,
          is_preconfigured: true,
        });
      }

      case outputIdToUuid(
        'existing-preconfigured-default-output-allow-edit-write-to-logs-streams'
      ): {
        return mockOutputSO(
          'existing-preconfigured-default-output-allow-edit-write-to-logs-streams',
          {
            is_default: true,
            is_preconfigured: true,
            allow_edit: ['write_to_logs_streams'],
          }
        );
      }

      case outputIdToUuid('existing-preconfigured-default-output-allow-edit-name'): {
        return mockOutputSO('existing-preconfigured-default-output-allow-edit-name', {
          name: 'test',
          allow_edit: ['name'],
        });
      }

      case outputIdToUuid('existing-logstash-output'): {
        return mockOutputSO('existing-logstash-output', {
          type: 'logstash',
          is_default: false,
        });
      }

      case outputIdToUuid('existing-logstash-output-with-ssl'): {
        return mockOutputSO('existing-logstash-output-with-ssl', {
          type: 'logstash',
          is_default: false,
          ssl: {
            certificate: 'cert-value',
            certificate_authorities: ['/path/to/CAs'],
          },
          secrets: {
            ssl: {
              key: {
                id: 'wnES3pUBqsj3cVixODPG',
              },
            },
          },
        });
      }

      case outputIdToUuid('existing-kafka-output'): {
        return mockOutputSO('existing-kafka-output', {
          type: 'kafka',
          is_default: false,
        });
      }

      case outputIdToUuid('existing-es-output'): {
        return mockOutputSO('existing-es-output', {
          type: 'elasticsearch',
          is_default: false,
          write_to_logs_streams: false,
        });
      }

      case outputIdToUuid('existing-remote-es-output'): {
        return mockOutputSO('existing-remote-es-output', {
          type: 'remote_elasticsearch',
          is_default: false,
          service_token: 'plain',
        });
      }

      default:
        return mockOutputSO(id, {
          type: 'remote_elasticsearch',
        });
    }
  });
  soClient.update.mockImplementation(async (type, id, data) => {
    return {
      id,
      type,
      attributes: {},
      references: [],
    };
  });
  soClient.create.mockImplementation(async (type, data, createOptions) => {
    return {
      id: createOptions?.id || 'generated-id',
      type,
      attributes: {},
      references: [],
    };
  });
  soClient.find.mockImplementation(async (findOptions) => {
    if (
      options?.defaultOutputMonitoringId &&
      findOptions.searchFields &&
      findOptions.searchFields.includes('is_default_monitoring') &&
      findOptions.search === 'true'
    ) {
      return {
        page: 1,
        per_page: 10,
        saved_objects: [
          {
            score: 0,
            ...(await soClient.get(
              'ingest-outputs',
              outputIdToUuid(options.defaultOutputMonitoringId)
            )),
          },
        ],
        total: 1,
      };
    }

    if (
      options?.defaultOutputId &&
      findOptions.searchFields &&
      findOptions.searchFields.includes('is_default') &&
      findOptions.search === 'true'
    ) {
      return {
        page: 1,
        per_page: 10,
        saved_objects: [
          {
            score: 0,
            ...(await soClient.get('ingest-outputs', outputIdToUuid(options.defaultOutputId))),
          },
        ],
        total: 1,
      };
    }

    return {
      page: 1,
      per_page: 10,
      saved_objects: [],
      total: 0,
    };
  });

  mockedAppContextService.getInternalUserSOClient.mockReturnValue(soClient);
  mockedAppContextService.getInternalUserSOClientWithoutSpaceExtension.mockReturnValue(soClient);

  return soClient;
}

function getMockedEncryptedSoClient() {
  const esoClientMock: jest.Mocked<EncryptedSavedObjectsClient> = {
    getDecryptedAsInternalUser: jest.fn(),
    createPointInTimeFinderDecryptedAsInternalUser: jest.fn(),
  };

  esoClientMock.getDecryptedAsInternalUser.mockImplementation(async (type: string, id: string) => {
    switch (id) {
      case outputIdToUuid('output-test'): {
        return mockOutputSO('output-test');
      }
      case outputIdToUuid('existing-default-output'): {
        return mockOutputSO('existing-default-output');
      }
      case outputIdToUuid('existing-default-monitoring-output'): {
        return mockOutputSO('existing-default-monitoring-output', {
          is_default: true,
          type: 'elasticsearch',
        });
      }
      case outputIdToUuid('existing-default-and-default-monitoring-output'): {
        return mockOutputSO('existing-default-and-default-monitoring-output', {
          is_default: true,
          is_default_monitoring: true,
        });
      }
      case outputIdToUuid('existing-preconfigured-default-output'): {
        return mockOutputSO('existing-preconfigured-default-output', {
          is_default: true,
          is_preconfigured: true,
        });
      }
      case outputIdToUuid('existing-preconfigured-default-output-allow-edit-name'): {
        return mockOutputSO('existing-preconfigured-default-output-allow-edit-name', {
          name: 'test',
          allow_edit: ['name'],
        });
      }
      case outputIdToUuid('existing-logstash-output'): {
        return mockOutputSO('existing-logstash-output', {
          type: 'logstash',
          is_default: false,
        });
      }
      case outputIdToUuid('existing-logstash-output-with-ssl'): {
        return mockOutputSO('existing-logstash-output-with-ssl', {
          type: 'logstash',
          is_default: false,
          ssl: {
            certificate: 'cert-value',
            certificate_authorities: ['/path/to/CAs'],
          },
          secrets: {
            ssl: {
              key: {
                id: 'wnES3pUBqsj3cVixODPG',
              },
            },
          },
        });
      }
      case outputIdToUuid('existing-kafka-output'): {
        return mockOutputSO('existing-kafka-output', {
          type: 'kafka',
          is_default: false,
        });
      }
      case outputIdToUuid('existing-es-output'): {
        return mockOutputSO('existing-es-output', {
          type: 'elasticsearch',
          is_default: false,
          write_to_logs_streams: false,
        });
      }
      case outputIdToUuid('existing-remote-es-output'): {
        return mockOutputSO('existing-remote-es-output', {
          type: 'remote_elasticsearch',
          is_default: false,
          service_token: 'plain',
        });
      }
      default:
        return mockOutputSO(id, {
          type: 'remote_elasticsearch',
        });
    }
  });

  mockedAppContextService.getEncryptedSavedObjects.mockReturnValue(esoClientMock);

  return esoClientMock;
}

describe('Output Service', () => {
  const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
  const esoClientMock = getMockedEncryptedSoClient();

  const mockedAgentPolicyWithFleetServerResolvedValue = {
    items: [
      {
        name: 'fleet server policy',
        id: 'fleet_server_policy',
        is_default_fleet_server: true,
        package_policies: [
          {
            name: 'fleet-server-123',
            package: {
              name: 'fleet_server',
            },
          },
        ],
      },
      {
        name: 'agent policy 1',
        id: 'agent_policy_1',
        is_managed: false,
        package_policies: [
          {
            name: 'nginx',
            package: {
              name: 'nginx',
            },
          },
        ],
      },
    ],
  } as unknown as ReturnType<typeof mockedAgentPolicyService.list>;

  const mockedPackagePolicyWithFleetServerResolvedValue = {
    items: [
      {
        name: 'fleet-server-123',
        policy_ids: ['fleet_server_policy'],
        package: {
          name: 'fleet_server',
        },
      },
    ],
  } as unknown as ReturnType<typeof mockedPackagePolicyService.list>;

  const mockedAgentPolicyWithSyntheticsResolvedValue = {
    items: [
      {
        name: 'synthetics policy',
        id: 'synthetics_policy',
        package_policies: [
          {
            name: 'synthetics-123',
            package: {
              name: 'synthetics',
            },
          },
        ],
      },
      {
        name: 'agent policy 1',
        id: 'agent_policy_1',
        is_managed: false,
        package_policies: [
          {
            name: 'nginx',
            package: {
              name: 'nginx',
            },
          },
        ],
      },
    ],
  } as unknown as ReturnType<typeof mockedAgentPolicyService.list>;

  const mockedPackagePolicyWithSyntheticsResolvedValue = {
    items: [
      {
        name: 'synthetics-123',
        policy_ids: ['synthetics_policy'],
        package: {
          name: 'synthetics',
        },
      },
    ],
  } as unknown as ReturnType<typeof mockedPackagePolicyService.list>;

  const mockedAgentlessPolicyResolvedValue = {
    items: [
      {
        name: 'agentless policy',
        id: 'agentless_policy',
        supports_agentless: true,
        package_policies: [
          {
            name: 'elastic_connectors',
            package: {
              name: 'elastic_connectors',
            },
          },
        ],
      },
    ],
  } as unknown as ReturnType<typeof mockedAgentPolicyService.list>;

  beforeEach(() => {
    mockedAgentPolicyService.getByIds.mockResolvedValue([]);
    mockedAgentPolicyService.list.mockClear();
    mockedPackagePolicyService.list.mockReset();
    mockedAgentPolicyService.hasAPMIntegration.mockClear();
    mockedAgentPolicyService.hasFleetServerIntegration.mockClear();
    mockedAgentPolicyService.hasSyntheticsIntegration.mockClear();
    mockedAgentPolicyService.removeOutputFromAll.mockReset();
    mockedPackagePolicyService.removeOutputFromAll.mockReset();
    mockedAppContextService.getInternalUserSOClient.mockReset();
    mockedAppContextService.getEncryptedSavedObjectsSetup.mockReset();
    mockedAuditLoggingService.writeCustomSoAuditLog.mockReset();
    mockedAgentPolicyService.update.mockReset();
    mockedPackagePolicyService.list.mockResolvedValue({
      items: [],
    } as any);
    mockedFindAgentlessPolicies.mockResolvedValue([]);
  });

  afterEach(() => {
    mockedAgentPolicyService.getByIds.mockClear();
  });

  describe('create', () => {
    describe('elasticsearch output', () => {
      beforeEach(() => {
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: true,
        } as any);
      });

      it('should throw if encryptedSavedObject is not configured', async () => {
        const soClient = getMockedSoClient();
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: false,
        } as any);

        await expect(
          outputService.create(
            soClient,
            esClientMock,
            {
              is_default: false,
              is_default_monitoring: false,
              name: 'Test',
              type: 'elasticsearch',
            },
            { id: 'output-test' }
          )
        ).rejects.toThrow(`elasticsearch output needs encrypted saved object api key to be set`);
      });

      it('works with a predefined id', async () => {
        const soClient = getMockedSoClient();

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: false,
            is_default_monitoring: false,
            name: 'Test',
            type: 'elasticsearch',
          },
          { id: 'output-test' }
        );

        expect(soClient.create).toBeCalled();

        // ID should always be the same for a predefined id
        expect(soClient.create.mock.calls[0][2]?.id).toEqual(outputIdToUuid('output-test'));
        expect((soClient.create.mock.calls[0][1] as OutputSOAttributes).output_id).toEqual(
          'output-test'
        );
      });

      it('should create a new default output if none exists before', async () => {
        const soClient = getMockedSoClient();

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: true,
            is_default_monitoring: false,
            name: 'Test',
            type: 'elasticsearch',
          },
          { id: 'output-test' }
        );

        expect(soClient.update).not.toBeCalled();
      });

      it('should update existing default output when creating a new default output', async () => {
        const soClient = getMockedSoClient({
          defaultOutputId: 'existing-default-output',
        });

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: true,
            is_default_monitoring: false,
            name: 'Test',
            type: 'elasticsearch',
          },
          { id: 'output-test' }
        );

        expect(soClient.update).toBeCalledTimes(1);
        expect(soClient.update).toBeCalledWith(
          expect.anything(),
          outputIdToUuid('existing-default-output'),
          { is_default: false }
        );
      });

      it('should create a new default monitoring output if none exists before', async () => {
        const soClient = getMockedSoClient();

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: false,
            is_default_monitoring: true,
            name: 'Test',
            type: 'elasticsearch',
          },
          { id: 'output-test' }
        );

        expect(soClient.update).not.toBeCalled();
      });

      it('should update existing default monitoring output when creating a new default output', async () => {
        const soClient = getMockedSoClient({
          defaultOutputMonitoringId: 'existing-default-monitoring-output',
        });

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: true,
            is_default_monitoring: true,
            name: 'Test',
            type: 'elasticsearch',
          },
          { id: 'output-test' }
        );

        expect(soClient.update).toBeCalledTimes(1);
        expect(soClient.update).toBeCalledWith(
          expect.anything(),
          outputIdToUuid('existing-default-monitoring-output'),
          { is_default_monitoring: false }
        );
      });

      it('should call audit logger', async () => {
        const soClient = getMockedSoClient();

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: false,
            is_default_monitoring: true,
            name: 'Test',
            type: 'elasticsearch',
          },
          { id: 'output-test' }
        );

        expect(mockedAuditLoggingService.writeCustomSoAuditLog).toHaveBeenCalledWith({
          action: 'create',
          id: outputIdToUuid('output-test'),
          name: 'Test',
          savedObjectType: OUTPUT_SAVED_OBJECT_TYPE,
        });
      });

      it('should set preset: balanced by default when creating a new ES output', async () => {
        const soClient = getMockedSoClient({});

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: false,
            is_default_monitoring: false,
            name: 'Test',
            type: 'elasticsearch',
          },
          {
            id: 'output-1',
          }
        );

        expect(soClient.create).toBeCalledWith(
          OUTPUT_SAVED_OBJECT_TYPE,
          // Preset should be inferred as balanced if not provided
          expect.objectContaining({
            preset: 'balanced',
          }),
          expect.anything()
        );
      });

      it('should set preset: balanced by default when creating a new remote ES output', async () => {
        const soClient = getMockedSoClient({});
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: true,
        } as any);

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: false,
            is_default_monitoring: false,
            name: 'Test',
            type: 'remote_elasticsearch',
          },
          {
            id: 'output-1',
          }
        );

        expect(soClient.create).toBeCalledWith(
          OUTPUT_SAVED_OBJECT_TYPE,
          // Preset should be inferred as balanced if not provided
          expect.objectContaining({
            preset: 'balanced',
          }),
          expect.anything()
        );
      });

      it('should set preset: custom when config_yaml contains a reserved key', async () => {
        const soClient = getMockedSoClient({});

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: false,
            is_default_monitoring: false,
            name: 'Test',
            type: 'elasticsearch',
            config_yaml: `
              bulk_max_size: 1000
            `,
          },
          {
            id: 'output-1',
          }
        );

        expect(soClient.create).toBeCalledWith(
          OUTPUT_SAVED_OBJECT_TYPE,
          expect.objectContaining({
            preset: 'custom',
          }),
          expect.anything()
        );
      });

      it('should honor preset: custom in attributes', async () => {
        const soClient = getMockedSoClient({});

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: false,
            is_default_monitoring: false,
            name: 'Test',
            type: 'elasticsearch',
            config_yaml: `
              some_non_reserved_key: foo
            `,
            preset: 'custom',
          },
          {
            id: 'output-1',
          }
        );

        expect(soClient.create).toBeCalledWith(
          OUTPUT_SAVED_OBJECT_TYPE,
          expect.objectContaining({
            preset: 'custom',
          }),
          expect.anything()
        );
      });

      it('should throw an error when preset: balanced is provided but config_yaml contains a reserved key', async () => {
        const soClient = getMockedSoClient({});

        await expect(
          outputService.create(
            soClient,
            esClientMock,
            {
              is_default: false,
              is_default_monitoring: false,
              name: 'Test',
              type: 'elasticsearch',
              config_yaml: `
              bulk_max_size: 1000
            `,
              preset: 'balanced',
            },
            {
              id: 'output-1',
            }
          )
        ).rejects.toThrow(
          `preset cannot be balanced when config_yaml contains one of ${RESERVED_CONFIG_YML_KEYS.join(
            ', '
          )}`
        );

        expect(soClient.create).not.toBeCalled();
      });

      // With preconfigured outputs
      it('should throw when an existing preconfigured default output and creating a new default output outside of preconfiguration', async () => {
        const soClient = getMockedSoClient({
          defaultOutputId: 'existing-preconfigured-default-output',
        });

        await expect(
          outputService.create(
            soClient,
            esClientMock,
            {
              is_default: true,
              is_default_monitoring: false,
              name: 'Test',
              type: 'elasticsearch',
            },
            { id: 'output-test' }
          )
        ).rejects.toThrow(
          `Preconfigured output existing-preconfigured-default-output is_default cannot be updated outside of kibana config file.`
        );
      });

      it('should update existing default preconfigured monitoring output when creating a new default output from preconfiguration', async () => {
        const soClient = getMockedSoClient({
          defaultOutputId: 'existing-preconfigured-default-output',
        });

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: true,
            is_default_monitoring: true,
            name: 'Test',
            type: 'elasticsearch',
          },
          { id: 'output-test', fromPreconfiguration: true }
        );

        expect(soClient.update).toBeCalledTimes(1);
        expect(soClient.update).toBeCalledWith(
          expect.anything(),
          outputIdToUuid('existing-preconfigured-default-output'),
          { is_default: false }
        );
      });
    });

    describe('logstash output', () => {
      it('should throw if encryptedSavedObject is not configured', async () => {
        const soClient = getMockedSoClient({});

        await expect(
          outputService.create(
            soClient,
            esClientMock,
            {
              is_default: false,
              is_default_monitoring: false,
              name: 'Test',
              type: 'logstash',
            },
            { id: 'output-test' }
          )
        ).rejects.toThrow(`logstash output needs encrypted saved object api key to be set`);
      });

      it('should work if encryptedSavedObject is configured', async () => {
        const soClient = getMockedSoClient({});
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: true,
        } as any);
        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: false,
            is_default_monitoring: false,
            name: 'Test',
            type: 'logstash',
          },
          { id: 'output-test' }
        );
        expect(soClient.create).toBeCalled();
      });

      it('should update fleet server policies with data_output_id=default_output_id if a new default logstash output is created', async () => {
        const soClient = getMockedSoClient({
          defaultOutputId: 'output-test',
        });
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: true,
        } as any);
        mockedAgentPolicyService.list.mockResolvedValue(
          mockedAgentPolicyWithFleetServerResolvedValue
        );
        mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(true);
        mockedPackagePolicyService.list.mockResolvedValue(
          mockedPackagePolicyWithFleetServerResolvedValue
        );
        mockedAgentPolicyService.getByIds.mockResolvedValue(
          (await mockedAgentPolicyWithFleetServerResolvedValue).items
        );

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: true,
            is_default_monitoring: false,
            name: 'Test',
            type: 'logstash',
          },
          { id: 'output-1' }
        );

        expect(mockedAgentPolicyService.update).toBeCalledWith(
          expect.anything(),
          expect.anything(),
          'fleet_server_policy',
          { data_output_id: 'output-test' },
          { force: false }
        );
      });

      it('should update synthetics policies with data_output_id=default_output_id if a new default logstash output is created', async () => {
        const soClient = getMockedSoClient({
          defaultOutputId: 'output-test',
        });
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: true,
        } as any);
        mockedAgentPolicyService.list.mockResolvedValue(
          mockedAgentPolicyWithSyntheticsResolvedValue
        );
        mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(true);
        mockedPackagePolicyService.list.mockResolvedValue(
          mockedPackagePolicyWithSyntheticsResolvedValue
        );
        mockedAgentPolicyService.getByIds.mockResolvedValue(
          (await mockedAgentPolicyWithSyntheticsResolvedValue).items
        );

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: true,
            is_default_monitoring: false,
            name: 'Test',
            type: 'logstash',
          },
          { id: 'output-1' }
        );

        expect(mockedAgentPolicyService.update).toBeCalledWith(
          expect.anything(),
          expect.anything(),
          'synthetics_policy',
          { data_output_id: 'output-test' },
          { force: false }
        );
      });

      it('should update agentless policies with data_output_id=default_output_id if a new default logstash output is created', async () => {
        const soClient = getMockedSoClient({
          defaultOutputId: 'output-test',
        });
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: true,
        } as any);
        mockedAgentPolicyService.list.mockResolvedValue(mockedAgentlessPolicyResolvedValue);
        mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
        mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(false);
        mockedFindAgentlessPolicies.mockResolvedValueOnce(
          (await mockedAgentlessPolicyResolvedValue).items
        );
        mockedAgentPolicyService.getByIds.mockResolvedValue(
          (await mockedAgentlessPolicyResolvedValue).items
        );

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: true,
            is_default_monitoring: false,
            name: 'Test',
            type: 'logstash',
          },
          { id: 'output-1' }
        );

        expect(mockedAgentPolicyService.update).toBeCalledWith(
          expect.anything(),
          expect.anything(),
          'agentless_policy',
          { data_output_id: 'output-test' },
          { force: false }
        );
      });

      it('should allow to create a new logstash output with no errors if is not set as default', async () => {
        const soClient = getMockedSoClient({
          defaultOutputId: 'output-test',
        });
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: true,
        } as any);
        mockedAgentPolicyService.list.mockResolvedValue(
          mockedAgentPolicyWithFleetServerResolvedValue
        );
        mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(true);

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: false,
            is_default_monitoring: false,
            name: 'Test',
            type: 'logstash',
          },
          { id: 'output-1' }
        );
      });

      it('should store output secrets as plain text if disabled', async () => {
        const soClient = getMockedSoClient({});
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: true,
        } as any);
        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: false,
            is_default_monitoring: false,
            name: 'Test',
            type: 'logstash',
            ssl: {
              certificate: 'xxx',
            },
            secrets: {
              ssl: {
                key: 'secretKey',
              },
            },
          },
          { id: 'output-test' }
        );
        expect(soClient.create).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            ssl: JSON.stringify({ certificate: 'xxx', key: 'secretKey' }),
          }),
          expect.anything()
        );
      });
    });

    describe('kafka output', () => {
      it('should throw if encryptedSavedObject is not configured', async () => {
        const soClient = getMockedSoClient({});

        await expect(
          outputService.create(
            soClient,
            esClientMock,
            {
              is_default: false,
              is_default_monitoring: false,
              name: 'Test',
              type: 'kafka',
              topic: 'test',
            },
            { id: 'output-test' }
          )
        ).rejects.toThrow(`kafka output needs encrypted saved object api key to be set`);
      });

      it('should update fleet server policies with data_output_id=default_output_id if a new default kafka output is created', async () => {
        const soClient = getMockedSoClient({
          defaultOutputId: 'output-test',
        });
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: true,
        } as any);
        mockedAgentPolicyService.list.mockResolvedValue(
          mockedAgentPolicyWithFleetServerResolvedValue
        );
        mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(true);
        mockedPackagePolicyService.list.mockResolvedValue(
          mockedPackagePolicyWithFleetServerResolvedValue
        );
        mockedAgentPolicyService.getByIds.mockResolvedValue(
          (await mockedAgentPolicyWithFleetServerResolvedValue).items
        );

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: true,
            is_default_monitoring: false,
            name: 'Test',
            type: 'kafka',
          },
          { id: 'output-1' }
        );

        expect(mockedAgentPolicyService.update).toBeCalledWith(
          expect.anything(),
          expect.anything(),
          'fleet_server_policy',
          { data_output_id: 'output-test' },
          { force: false }
        );
      });

      it('should update synthetics policies with data_output_id=default_output_id if a new default kafka output is created', async () => {
        const soClient = getMockedSoClient({
          defaultOutputId: 'output-test',
        });
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: true,
        } as any);
        mockedAgentPolicyService.list.mockResolvedValue(
          mockedAgentPolicyWithSyntheticsResolvedValue
        );
        mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(true);
        mockedPackagePolicyService.list.mockResolvedValue(
          mockedPackagePolicyWithSyntheticsResolvedValue
        );
        mockedAgentPolicyService.getByIds.mockResolvedValue(
          (await mockedAgentPolicyWithSyntheticsResolvedValue).items
        );

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: true,
            is_default_monitoring: false,
            name: 'Test',
            type: 'kafka',
          },
          { id: 'output-1' }
        );

        expect(mockedAgentPolicyService.update).toBeCalledWith(
          expect.anything(),
          expect.anything(),
          'synthetics_policy',
          { data_output_id: 'output-test' },
          { force: false }
        );
      });

      it('should update agentless policies with data_output_id=default_output_id if a new default kafka output is created', async () => {
        const soClient = getMockedSoClient({
          defaultOutputId: 'output-test',
        });
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: true,
        } as any);
        mockedAgentPolicyService.list.mockResolvedValue(mockedAgentlessPolicyResolvedValue);
        mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
        mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(false);
        mockedFindAgentlessPolicies.mockResolvedValueOnce(
          (await mockedAgentlessPolicyResolvedValue).items
        );
        mockedAgentPolicyService.getByIds.mockResolvedValue(
          (await mockedAgentlessPolicyResolvedValue).items
        );

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: true,
            is_default_monitoring: false,
            name: 'Test',
            type: 'kafka',
          },
          { id: 'output-1' }
        );

        expect(mockedAgentPolicyService.update).toBeCalledWith(
          expect.anything(),
          expect.anything(),
          'agentless_policy',
          { data_output_id: 'output-test' },
          { force: false }
        );
      });

      it('should allow to create a new kafka output with no errors if is not set as default', async () => {
        const soClient = getMockedSoClient({
          defaultOutputId: 'output-test',
        });
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: true,
        } as any);
        mockedAgentPolicyService.list.mockResolvedValue(
          mockedAgentPolicyWithFleetServerResolvedValue
        );
        mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(true);

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: false,
            is_default_monitoring: false,
            name: 'Test',
            type: 'kafka',
          },
          { id: 'output-1' }
        );
      });
    });

    describe('remote elasticsearch output', () => {
      beforeEach(() => {
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: true,
        } as any);
      });
      it('should throw if encryptedSavedObject is not configured', async () => {
        const soClient = getMockedSoClient();
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: false,
        } as any);

        await expect(
          outputService.create(
            soClient,
            esClientMock,
            {
              is_default: true,
              is_default_monitoring: false,
              name: 'Test',
              type: 'remote_elasticsearch',
            },
            { id: 'output-1' }
          )
        ).rejects.toThrow(
          `remote_elasticsearch output needs encrypted saved object api key to be set`
        );
      });

      it('should update agentless policies with data_output_id=default_output_id if a new default remote es output is created', async () => {
        const soClient = getMockedSoClient({
          defaultOutputId: 'output-test',
        });
        mockedAppContextService.getEncryptedSavedObjectsSetup.mockReturnValue({
          canEncrypt: true,
        } as any);
        mockedAgentPolicyService.list.mockResolvedValue(mockedAgentlessPolicyResolvedValue);
        mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
        mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(false);
        mockedFindAgentlessPolicies.mockResolvedValueOnce(
          (await mockedAgentlessPolicyResolvedValue).items
        );
        mockedAgentPolicyService.getByIds.mockResolvedValue(
          (await mockedAgentlessPolicyResolvedValue).items
        );

        await outputService.create(
          soClient,
          esClientMock,
          {
            is_default: true,
            is_default_monitoring: false,
            name: 'Test',
            type: 'remote_elasticsearch',
          },
          { id: 'output-1' }
        );

        expect(mockedAgentPolicyService.update).toBeCalledWith(
          expect.anything(),
          expect.anything(),
          'agentless_policy',
          { data_output_id: 'output-test' },
          { force: false }
        );
      });
      it('should not throw when a remote es output is attempted to be created as default data output', async () => {
        const soClient = getMockedSoClient({
          defaultOutputId: 'output-test',
        });

        await expect(
          outputService.create(
            soClient,
            esClientMock,
            {
              is_default: true,
              is_default_monitoring: false,
              name: 'Test',
              type: 'remote_elasticsearch',
            },
            { id: 'output-1' }
          )
        ).resolves.not.toThrow();
      });
    });

    it('should throw FleetError when given an invalid id', async () => {
      const soClient = getMockedSoClient();

      await expect(
        outputService.create(
          soClient,
          esClientMock,
          { is_default: false, is_default_monitoring: false, name: 'Test', type: 'elasticsearch' },
          { id: '../bad-id' }
        )
      ).rejects.toThrow('id is not valid');
    });
  });

  describe('update', () => {
    it('should update existing default output when updating an output to become the default output', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'existing-default-output',
      });
      mockedPackagePolicyService.list.mockResolvedValue({ items: [] } as any);

      await outputService.update(soClient, esClientMock, 'output-test', {
        is_default: true,
      });

      expect(soClient.update).toBeCalledTimes(2);
      expect(soClient.update).toBeCalledWith(expect.anything(), outputIdToUuid('output-test'), {
        is_default: true,
      });
      expect(soClient.update).toBeCalledWith(
        expect.anything(),
        outputIdToUuid('existing-default-output'),
        { is_default: false }
      );
    });

    it('should not update existing default output when the output is already the default one', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'existing-default-output',
      });
      mockedPackagePolicyService.list.mockResolvedValue({ items: [] } as any);

      await outputService.update(soClient, esClientMock, 'existing-default-output', {
        is_default: true,
        name: 'Test',
      });

      expect(soClient.update).toBeCalledTimes(1);
      expect(soClient.update).toBeCalledWith(
        expect.anything(),
        outputIdToUuid('existing-default-output'),
        { is_default: true, name: 'Test' }
      );
    });

    it('should not set default output to false when the output is already the default one', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'existing-default-and-default-monitoring-output',
      });

      await expect(
        outputService.update(
          soClient,
          esClientMock,
          'existing-default-and-default-monitoring-output',
          {
            is_default: false,
            name: 'Test',
          }
        )
      ).rejects.toThrow(
        `Default output existing-default-and-default-monitoring-output cannot be set to is_default=false or is_default_monitoring=false manually. Make another output the default first.`
      );
    });

    it('should not set default monitoring output to false when the output is already the default one', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'existing-default-and-default-monitoring-output',
      });

      await expect(
        outputService.update(
          soClient,
          esClientMock,
          'existing-default-and-default-monitoring-output',
          {
            is_default_monitoring: false,
            name: 'Test',
          }
        )
      ).rejects.toThrow(
        `Default output existing-default-and-default-monitoring-output cannot be set to is_default=false or is_default_monitoring=false manually. Make another output the default first.`
      );
    });

    it('should update existing default monitoring output when updating an output to become the default monitoring output', async () => {
      const soClient = getMockedSoClient({
        defaultOutputMonitoringId: 'existing-default-monitoring-output',
      });

      await outputService.update(soClient, esClientMock, 'output-test', {
        is_default_monitoring: true,
      });

      expect(soClient.update).toBeCalledTimes(2);
      expect(soClient.update).toBeCalledWith(expect.anything(), outputIdToUuid('output-test'), {
        is_default_monitoring: true,
      });
      expect(soClient.update).toBeCalledWith(
        expect.anything(),
        outputIdToUuid('existing-default-monitoring-output'),
        { is_default_monitoring: false }
      );
    });

    // With preconfigured outputs
    it('Do not allow to update a preconfigured output outside from preconfiguration', async () => {
      const soClient = getMockedSoClient();
      await expect(
        outputService.update(soClient, esClientMock, 'existing-preconfigured-default-output', {
          config_yaml: 'test: 123',
        })
      ).rejects.toThrow(
        'Preconfigured output existing-preconfigured-default-output config_yaml cannot be updated outside of kibana config file.'
      );
    });

    it('should allow to update write_to_logs_streams field in preconfigured output outside from preconfiguration if allow_edits is set', async () => {
      const soClient = getMockedSoClient();
      await outputService.update(
        soClient,
        esClientMock,
        'existing-preconfigured-default-output-allow-edit-write-to-logs-streams',
        {
          write_to_logs_streams: true,
          ssl: { certificate: '', certificate_authorities: [] },
        }
      );
      expect(soClient.update).toBeCalled();
    });

    it('Allow to update a preconfigured output from preconfiguration', async () => {
      const soClient = getMockedSoClient();
      await outputService.update(
        soClient,
        esClientMock,
        'existing-preconfigured-default-output',
        {
          config_yaml: '',
        },
        {
          fromPreconfiguration: true,
        }
      );

      expect(soClient.update).toBeCalled();
    });

    it('Allow to update preconfigured output allowed to edit field from preconfiguration', async () => {
      const soClient = getMockedSoClient();
      mockedPackagePolicyService.list.mockResolvedValue({ items: [] } as any);
      await outputService.update(
        soClient,
        esClientMock,
        'existing-preconfigured-default-output-allow-edit-name',
        {
          name: 'test 123',
        },
        {
          fromPreconfiguration: false,
        }
      );

      expect(soClient.update).toBeCalled();
    });

    it('Should throw when an existing preconfigured default output and updating an output to become the default one outside of preconfiguration', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'existing-preconfigured-default-output',
      });
      mockedPackagePolicyService.list.mockResolvedValue({ items: [] } as any);

      await expect(
        outputService.update(soClient, esClientMock, 'output-test', {
          is_default: true,
          is_default_monitoring: false,
          name: 'Test',
          type: 'elasticsearch',
        })
      ).rejects.toThrow(
        `Preconfigured output existing-preconfigured-default-output is_default cannot be updated outside of kibana config file.`
      );
    });

    it('Should update existing default preconfigured monitoring output when updating an output to become the default one from preconfiguration', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'existing-default-output',
      });
      mockedPackagePolicyService.list.mockResolvedValue({ items: [] } as any);

      await outputService.update(
        soClient,
        esClientMock,
        'output-test',
        {
          is_default: true,
          is_default_monitoring: false,
          name: 'Test',
          type: 'elasticsearch',
        },
        { fromPreconfiguration: true }
      );

      expect(soClient.update).toBeCalledTimes(2);
      expect(soClient.update).toBeCalledWith(
        expect.anything(),
        outputIdToUuid('existing-default-output'),
        { is_default: false }
      );
    });

    // With ES output
    it('Should delete Logstash specific fields if the output type change to ES', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue({
        items: [{}],
      } as unknown as ReturnType<typeof mockedAgentPolicyService.list>);
      mockedAgentPolicyService.hasAPMIntegration.mockReturnValue(false);
      mockedPackagePolicyService.list.mockResolvedValue({ items: [] } as any);

      await outputService.update(soClient, esClientMock, 'existing-logstash-output', {
        type: 'elasticsearch',
        hosts: ['http://test:4343'],
      });

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'elasticsearch',
        hosts: ['http://test:4343'],
        preset: 'balanced',
      });
    });

    it('Should delete Kafka specific fields if the output type change to ES', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue({
        items: [{}],
      } as unknown as ReturnType<typeof mockedAgentPolicyService.list>);
      mockedAgentPolicyService.hasAPMIntegration.mockReturnValue(false);
      mockedPackagePolicyService.list.mockResolvedValue({ items: [] } as any);

      await outputService.update(soClient, esClientMock, 'existing-kafka-output', {
        type: 'elasticsearch',
        hosts: ['http://test:4343'],
      });

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'elasticsearch',
        hosts: ['http://test:4343'],
        auth_type: null,
        connection_type: null,
        broker_timeout: null,
        required_acks: null,
        client_id: null,
        compression: null,
        compression_level: null,
        hash: null,
        key: null,
        partition: null,
        password: null,
        random: null,
        round_robin: null,
        sasl: null,
        ssl: null,
        timeout: null,
        topic: null,
        headers: null,
        username: null,
        version: null,
        preset: 'balanced',
      });
    });

    // With logstash output
    it('Should work if you try to make that output the default output and no policies using default output has APM integration', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue({
        items: [{}],
      } as unknown as ReturnType<typeof mockedAgentPolicyService.list>);
      mockedAgentPolicyService.hasAPMIntegration.mockReturnValue(false);
      mockedPackagePolicyService.list.mockResolvedValue({ items: [] } as any);

      await outputService.update(soClient, esClientMock, 'existing-logstash-output', {
        is_default: true,
      });

      expect(soClient.update).toBeCalled();
    });

    it('Should call update with null fields if', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue({
        items: [{}],
      } as unknown as ReturnType<typeof mockedAgentPolicyService.list>);
      mockedAgentPolicyService.hasAPMIntegration.mockReturnValue(false);
      mockedPackagePolicyService.list.mockResolvedValue({ items: [] } as any);

      await outputService.update(soClient, esClientMock, 'existing-logstash-output', {
        is_default: true,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
        config_yaml: null,
        ssl: null,
      });

      expect(soClient.update).toBeCalled();
      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        is_default: true,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
        config_yaml: null,
        ssl: null,
      });
    });

    it('Should throw if you try to make that output the default output and some policies using default output has APM integration', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue({
        items: [{}],
      } as unknown as ReturnType<typeof mockedAgentPolicyService.list>);
      mockedAgentPolicyService.hasAPMIntegration.mockReturnValue(true);
      mockedPackagePolicyService.list.mockResolvedValue({ items: [] } as any);

      await expect(
        outputService.update(soClient, esClientMock, 'existing-logstash-output', {
          is_default: true,
        })
      ).rejects.toThrow(`Logstash output cannot be used with APM integration.`);
    });

    it('Should delete ES specific fields if the output type changes to logstash', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue({
        items: [{}],
      } as unknown as ReturnType<typeof mockedAgentPolicyService.list>);
      mockedPackagePolicyService.list.mockResolvedValue({ items: [] } as any);
      mockedAgentPolicyService.hasAPMIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(false);

      await outputService.update(soClient, esClientMock, 'existing-es-output', {
        type: 'logstash',
        hosts: ['test:4343'],
        write_to_logs_streams: false,
      });

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'logstash',
        hosts: ['test:4343'],
        ca_sha256: null,
        ca_trusted_fingerprint: null,
        otel_disable_beatsauth: null,
        otel_exporter_config_yaml: null,
        write_to_logs_streams: null,
      });
    });

    it('Should delete Kafka specific fields if the output type changes to logstash', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue({
        items: [{}],
      } as unknown as ReturnType<typeof mockedAgentPolicyService.list>);
      mockedAgentPolicyService.hasAPMIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedPackagePolicyService.list.mockResolvedValue({ items: [] } as any);

      await outputService.update(soClient, esClientMock, 'existing-kafka-output', {
        type: 'logstash',
        hosts: ['test:4343'],
      });

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'logstash',
        hosts: ['test:4343'],
        ca_sha256: null,
        ca_trusted_fingerprint: null,
        auth_type: null,
        connection_type: null,
        broker_timeout: null,
        required_acks: null,
        client_id: null,
        compression: null,
        compression_level: null,
        hash: null,
        ssl: null,
        key: null,
        partition: null,
        password: null,
        random: null,
        round_robin: null,
        sasl: null,
        timeout: null,
        topic: null,
        headers: null,
        username: null,
        version: null,
      });
    });

    it('Should update fleet server policies with data_output_id=default_output_id if a default ES output is changed to logstash', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      mockedAgentPolicyService.list.mockResolvedValue(
        mockedAgentPolicyWithFleetServerResolvedValue
      );
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(true);
      mockedPackagePolicyService.list.mockResolvedValue(
        mockedPackagePolicyWithFleetServerResolvedValue
      );

      await outputService.update(soClient, esClientMock, 'output-test', {
        type: 'logstash',
        hosts: ['test:4343'],
        is_default: true,
      });

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'logstash',
        hosts: ['test:4343'],
        is_default: true,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
      });
      expect(mockedAgentPolicyService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'fleet_server_policy',
        { data_output_id: 'output-test' },
        { force: false }
      );
    });

    it('Should update fleet server policies with data_output_id=default_output_id and force=true if a default ES output is changed to logstash, from preconfiguration', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      mockedAgentPolicyService.list.mockResolvedValue(
        mockedAgentPolicyWithFleetServerResolvedValue
      );
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(true);
      mockedPackagePolicyService.list.mockResolvedValue(
        mockedPackagePolicyWithFleetServerResolvedValue
      );

      await outputService.update(
        soClient,
        esClientMock,
        'output-test',
        {
          type: 'logstash',
          hosts: ['test:4343'],
          is_default: true,
        },
        {
          fromPreconfiguration: true,
        }
      );

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'logstash',
        hosts: ['test:4343'],
        is_default: true,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
      });
      expect(mockedAgentPolicyService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'fleet_server_policy',
        { data_output_id: 'output-test' },
        { force: true }
      );
    });

    it('should update synthetics policies with data_output_id=default_output_id if a default ES output is changed to logstash', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      mockedAgentPolicyService.list.mockResolvedValue(mockedAgentPolicyWithSyntheticsResolvedValue);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(true);
      mockedPackagePolicyService.list.mockResolvedValue(
        mockedPackagePolicyWithSyntheticsResolvedValue
      );

      await outputService.update(soClient, esClientMock, 'output-test', {
        type: 'logstash',
        hosts: ['test:4343'],
        is_default: true,
      });

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'logstash',
        hosts: ['test:4343'],
        is_default: true,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
      });
      expect(mockedAgentPolicyService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'synthetics_policy',
        { data_output_id: 'output-test' },
        { force: false }
      );
    });

    it('should update synthetics policies with data_output_id=default_output_id and force=true if a default ES output is changed to logstash, from preconfiguration', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      mockedAgentPolicyService.list.mockResolvedValue(mockedAgentPolicyWithSyntheticsResolvedValue);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(true);
      mockedPackagePolicyService.list.mockResolvedValue(
        mockedPackagePolicyWithSyntheticsResolvedValue
      );

      await outputService.update(
        soClient,
        esClientMock,
        'output-test',
        {
          type: 'logstash',
          hosts: ['test:4343'],
          is_default: true,
        },
        {
          fromPreconfiguration: true,
        }
      );

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'logstash',
        hosts: ['test:4343'],
        is_default: true,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
      });
      expect(mockedAgentPolicyService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'synthetics_policy',
        { data_output_id: 'output-test' },
        { force: true }
      );
    });

    it('should update agentless policies with data_output_id=default_output_id if a default ES output is changed to logstash', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      mockedAgentPolicyService.list.mockResolvedValue(mockedAgentlessPolicyResolvedValue);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(false);
      mockedFindAgentlessPolicies.mockResolvedValueOnce(
        (await mockedAgentlessPolicyResolvedValue).items
      );

      await outputService.update(soClient, esClientMock, 'output-test', {
        type: 'logstash',
        hosts: ['test:4343'],
        is_default: true,
      });

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'logstash',
        hosts: ['test:4343'],
        is_default: true,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
      });
      expect(mockedAgentPolicyService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'agentless_policy',
        { data_output_id: 'output-test' },
        { force: false }
      );
    });

    it('should update agentless policies with data_output_id=default_output_id and force=true if a default ES output is changed to logstash, from preconfiguration', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      mockedAgentPolicyService.list.mockResolvedValue(mockedAgentlessPolicyResolvedValue);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(false);
      mockedFindAgentlessPolicies.mockResolvedValueOnce(
        (await mockedAgentlessPolicyResolvedValue).items
      );

      await outputService.update(
        soClient,
        esClientMock,
        'output-test',
        {
          type: 'logstash',
          hosts: ['test:4343'],
          is_default: true,
        },
        {
          fromPreconfiguration: true,
        }
      );

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'logstash',
        hosts: ['test:4343'],
        is_default: true,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
      });
      expect(mockedAgentPolicyService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'agentless_policy',
        { data_output_id: 'output-test' },
        { force: true }
      );
    });

    it('Should return an error if trying to change the output to logstash for fleet server policy', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue(
        mockedAgentPolicyWithFleetServerResolvedValue
      );
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(true);
      mockedPackagePolicyService.list.mockResolvedValue(
        mockedPackagePolicyWithFleetServerResolvedValue
      );

      await expect(
        outputService.update(soClient, esClientMock, 'existing-es-output', {
          type: 'logstash',
          hosts: ['test:4343'],
        })
      ).rejects.toThrowError(
        'Logstash output cannot be used with Fleet Server integration in fleet server policy. Please create a new Elasticsearch output.'
      );
    });

    it('Should return an error if trying to change the output to logstash for synthetics policy', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue(mockedAgentPolicyWithSyntheticsResolvedValue);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(true);
      mockedPackagePolicyService.list.mockResolvedValue(
        mockedPackagePolicyWithSyntheticsResolvedValue
      );

      await expect(
        outputService.update(soClient, esClientMock, 'existing-es-output', {
          type: 'logstash',
          hosts: ['test:4343'],
        })
      ).rejects.toThrowError(
        'Logstash output cannot be used with Synthetics integration in synthetics policy. Please create a new Elasticsearch output.'
      );
    });

    it('Should return an error if trying to change the output to logstash for agentless policy', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue(mockedAgentlessPolicyResolvedValue);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(false);
      mockedFindAgentlessPolicies.mockResolvedValueOnce(
        (await mockedAgentlessPolicyResolvedValue).items
      );
      await expect(
        outputService.update(soClient, esClientMock, 'existing-es-output', {
          type: 'logstash',
          hosts: ['test:4343'],
        })
      ).rejects.toThrowError(
        'Logstash output cannot be used with agentless integration in agentless policy. Please create a new Elasticsearch output.'
      );
    });

    it('should call audit logger', async () => {
      const soClient = getMockedSoClient({ defaultOutputId: 'existing-es-output' });

      await outputService.update(soClient, esClientMock, 'existing-es-output', {
        hosts: ['new-host:443'],
      });

      expect(mockedAuditLoggingService.writeCustomSoAuditLog).toHaveBeenCalledWith({
        action: 'update',
        name: 'Test',
        id: outputIdToUuid('existing-es-output'),
        savedObjectType: OUTPUT_SAVED_OBJECT_TYPE,
      });
    });

    // With Kafka output
    it('Should delete ES specific fields if the output type changes to kafka', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue({
        items: [{}],
      } as unknown as ReturnType<typeof mockedAgentPolicyService.list>);
      mockedAgentPolicyService.hasAPMIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(false);
      mockedAgentPolicyService.list.mockResolvedValue({
        items: [],
      } as any);

      await outputService.update(soClient, esClientMock, 'existing-es-output', {
        type: 'kafka',
        hosts: ['test:4343'],
      });

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'kafka',
        hosts: ['test:4343'],
        ca_sha256: null,
        ca_trusted_fingerprint: null,
        password: null,
        username: null,
        ssl: null,
        sasl: null,
        broker_timeout: 10,
        required_acks: 1,
        client_id: 'Elastic',
        compression: 'gzip',
        compression_level: 4,
        otel_disable_beatsauth: null,
        otel_exporter_config_yaml: null,
        partition: 'hash',
        timeout: 30,
        version: '1.0.0',
        write_to_logs_streams: null,
      });
    });

    it('Should delete Logstash specific fields if the output type changes to kafka', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue({
        items: [{}],
      } as unknown as ReturnType<typeof mockedAgentPolicyService.list>);
      mockedAgentPolicyService.hasAPMIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedAgentPolicyService.list.mockResolvedValue({
        items: [],
      } as any);

      await outputService.update(soClient, esClientMock, 'existing-logstash-output', {
        type: 'kafka',
        hosts: ['test:4343'],
      });

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        hosts: ['test:4343'],
        broker_timeout: 10,
        required_acks: 1,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
        password: null,
        username: null,
        ssl: null,
        sasl: null,
        client_id: 'Elastic',
        compression: 'gzip',
        compression_level: 4,
        partition: 'hash',
        timeout: 30,
        type: 'kafka',
        version: '1.0.0',
      });
    });

    it('Should update fleet server policies with data_output_id=default_output_id if a default ES output is changed to kafka', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      mockedAgentPolicyService.list.mockResolvedValue(
        mockedAgentPolicyWithFleetServerResolvedValue
      );
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(true);
      mockedPackagePolicyService.list.mockResolvedValue(
        mockedPackagePolicyWithFleetServerResolvedValue
      );

      await outputService.update(soClient, esClientMock, 'output-test', {
        type: 'kafka',
        hosts: ['test:4343'],
        is_default: true,
      });

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'kafka',
        hosts: ['test:4343'],
        is_default: true,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
        password: null,
        username: null,
        ssl: null,
        sasl: null,
        client_id: 'Elastic',
        compression: 'gzip',
        compression_level: 4,
        partition: 'hash',
        timeout: 30,
        version: '1.0.0',
        broker_timeout: 10,
        required_acks: 1,
      });
      expect(mockedAgentPolicyService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'fleet_server_policy',
        { data_output_id: 'output-test' },
        { force: false }
      );
    });

    it('Should update fleet server policies with data_output_id=default_output_id and force=true if a default ES output is changed to kafka, from preconfiguration', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      mockedAgentPolicyService.list.mockResolvedValue(
        mockedAgentPolicyWithFleetServerResolvedValue
      );
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(true);
      mockedPackagePolicyService.list.mockResolvedValue(
        mockedPackagePolicyWithFleetServerResolvedValue
      );

      await outputService.update(
        soClient,
        esClientMock,
        'output-test',
        {
          type: 'kafka',
          hosts: ['test:4343'],
          is_default: true,
        },
        {
          fromPreconfiguration: true,
        }
      );

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'kafka',
        hosts: ['test:4343'],
        is_default: true,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
        password: null,
        username: null,
        ssl: null,
        sasl: null,
        client_id: 'Elastic',
        compression: 'gzip',
        compression_level: 4,
        partition: 'hash',
        timeout: 30,
        version: '1.0.0',
        broker_timeout: 10,
        required_acks: 1,
      });
      expect(mockedAgentPolicyService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'fleet_server_policy',
        { data_output_id: 'output-test' },
        { force: true }
      );
    });

    it('should update synthetics policies with data_output_id=default_output_id if a default ES output is changed to kafka', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      mockedAgentPolicyService.list.mockResolvedValue(mockedAgentPolicyWithSyntheticsResolvedValue);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(true);
      mockedPackagePolicyService.list.mockResolvedValue(
        mockedPackagePolicyWithSyntheticsResolvedValue
      );

      await outputService.update(soClient, esClientMock, 'output-test', {
        type: 'kafka',
        hosts: ['test:4343'],
        is_default: true,
      });

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'kafka',
        hosts: ['test:4343'],
        is_default: true,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
        password: null,
        username: null,
        ssl: null,
        sasl: null,
        client_id: 'Elastic',
        compression: 'gzip',
        compression_level: 4,
        partition: 'hash',
        timeout: 30,
        version: '1.0.0',
        broker_timeout: 10,
        required_acks: 1,
      });
      expect(mockedAgentPolicyService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'synthetics_policy',
        { data_output_id: 'output-test' },
        { force: false }
      );
    });

    it('should update synthetics policies with data_output_id=default_output_id and force=true if a default ES output is changed to kafka, from preconfiguration', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      mockedAgentPolicyService.list.mockResolvedValue(mockedAgentPolicyWithSyntheticsResolvedValue);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(true);
      mockedPackagePolicyService.list.mockResolvedValue(
        mockedPackagePolicyWithSyntheticsResolvedValue
      );

      await outputService.update(
        soClient,
        esClientMock,
        'output-test',
        {
          type: 'kafka',
          hosts: ['test:4343'],
          is_default: true,
        },
        {
          fromPreconfiguration: true,
        }
      );

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'kafka',
        hosts: ['test:4343'],
        is_default: true,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
        password: null,
        username: null,
        ssl: null,
        sasl: null,
        client_id: 'Elastic',
        compression: 'gzip',
        compression_level: 4,
        partition: 'hash',
        timeout: 30,
        version: '1.0.0',
        broker_timeout: 10,
        required_acks: 1,
      });
      expect(mockedAgentPolicyService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'synthetics_policy',
        { data_output_id: 'output-test' },
        { force: true }
      );
    });

    it('should update agentless policies with data_output_id=default_output_id if a default ES output is changed to kafka', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      mockedAgentPolicyService.list.mockResolvedValue(mockedAgentlessPolicyResolvedValue);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(false);
      mockedFindAgentlessPolicies.mockResolvedValueOnce(
        (await mockedAgentlessPolicyResolvedValue).items
      );

      await outputService.update(soClient, esClientMock, 'output-test', {
        type: 'kafka',
        hosts: ['test:4343'],
        is_default: true,
      });

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'kafka',
        hosts: ['test:4343'],
        is_default: true,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
        password: null,
        username: null,
        ssl: null,
        sasl: null,
        client_id: 'Elastic',
        compression: 'gzip',
        compression_level: 4,
        partition: 'hash',
        timeout: 30,
        version: '1.0.0',
        broker_timeout: 10,
        required_acks: 1,
      });
      expect(mockedAgentPolicyService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'agentless_policy',
        { data_output_id: 'output-test' },
        { force: false }
      );
    });

    it('should update agentless policies with data_output_id=default_output_id and force=true if a default ES output is changed to kafka, from preconfiguration', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      mockedAgentPolicyService.list.mockResolvedValue(mockedAgentlessPolicyResolvedValue);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(false);
      mockedFindAgentlessPolicies.mockResolvedValueOnce(
        (await mockedAgentlessPolicyResolvedValue).items
      );

      await outputService.update(
        soClient,
        esClientMock,
        'output-test',
        {
          type: 'kafka',
          hosts: ['test:4343'],
          is_default: true,
        },
        {
          fromPreconfiguration: true,
        }
      );

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'kafka',
        hosts: ['test:4343'],
        is_default: true,
        ca_sha256: null,
        ca_trusted_fingerprint: null,
        password: null,
        username: null,
        ssl: null,
        sasl: null,
        client_id: 'Elastic',
        compression: 'gzip',
        compression_level: 4,
        partition: 'hash',
        timeout: 30,
        version: '1.0.0',
        broker_timeout: 10,
        required_acks: 1,
      });
      expect(mockedAgentPolicyService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'agentless_policy',
        { data_output_id: 'output-test' },
        { force: true }
      );
    });

    it('Should return an error if trying to change the output to kafka for agentless policy', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue(mockedAgentlessPolicyResolvedValue);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(false);
      mockedFindAgentlessPolicies.mockResolvedValueOnce(
        (await mockedAgentlessPolicyResolvedValue).items
      );
      await expect(
        outputService.update(soClient, esClientMock, 'existing-es-output', {
          type: 'kafka',
          hosts: ['test:4343'],
        })
      ).rejects.toThrowError(
        'Kafka output cannot be used with agentless integration in agentless policy. Please create a new Elasticsearch output.'
      );
    });

    // remote ES
    it('should not throw when a remote es output is attempted to be updated as default data output', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });

      await expect(
        outputService.update(soClient, esClientMock, 'output-test', {
          is_default: true,
          is_default_monitoring: false,
          name: 'Test',
          type: 'remote_elasticsearch',
        })
      ).resolves.not.toThrow();
    });

    it('Should delete service_token if updated remote es output does not have a value', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue({
        items: [{}],
      } as unknown as ReturnType<typeof mockedAgentPolicyService.list>);
      mockedAgentPolicyService.hasAPMIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);

      await outputService.update(soClient, esClientMock, 'existing-remote-es-output', {
        type: 'remote_elasticsearch',
      });

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'remote_elasticsearch',
        kibana_api_key: null,
        service_token: null,
        preset: 'balanced',
      });
    });

    it('should update agentless policies with data_output_id=default_output_id if a default ES output is changed to remote ES', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      mockedAgentPolicyService.list.mockResolvedValue(mockedAgentlessPolicyResolvedValue);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(false);
      mockedFindAgentlessPolicies.mockResolvedValueOnce(
        (await mockedAgentlessPolicyResolvedValue).items
      );

      await outputService.update(soClient, esClientMock, 'output-test', {
        type: 'remote_elasticsearch',
        is_default: true,
      });

      expect(mockedAgentPolicyService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'agentless_policy',
        { data_output_id: 'output-test' },
        { force: false }
      );
    });

    it('should update agentless policies with data_output_id=default_output_id and force=true if a default ES output is changed to remote ES, from preconfiguration', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      mockedAgentPolicyService.list.mockResolvedValue(mockedAgentlessPolicyResolvedValue);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(false);
      mockedFindAgentlessPolicies.mockResolvedValueOnce(
        (await mockedAgentlessPolicyResolvedValue).items
      );

      await outputService.update(
        soClient,
        esClientMock,
        'output-test',
        {
          type: 'remote_elasticsearch',
          is_default: true,
        },
        {
          fromPreconfiguration: true,
        }
      );

      expect(mockedAgentPolicyService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'agentless_policy',
        { data_output_id: 'output-test' },
        { force: true }
      );
    });

    it('Should return an error if trying to change the output to remote es for agentless policy', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue(mockedAgentlessPolicyResolvedValue);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasSyntheticsIntegration.mockReturnValue(false);
      mockedFindAgentlessPolicies.mockResolvedValueOnce(
        (await mockedAgentlessPolicyResolvedValue).items
      );
      await expect(
        outputService.update(soClient, esClientMock, 'existing-es-output', {
          type: 'remote_elasticsearch',
        })
      ).rejects.toThrowError(
        'Remote_elasticsearch output cannot be used with agentless integration in agentless policy. Please create a new Elasticsearch output.'
      );
    });

    it('Should delete SSL fields if SSL field is null', async () => {
      const soClient = getMockedSoClient({});
      mockedAgentPolicyService.list.mockResolvedValue({
        items: [{}],
      } as unknown as ReturnType<typeof mockedAgentPolicyService.list>);
      mockedAgentPolicyService.hasAPMIntegration.mockReturnValue(false);
      mockedAgentPolicyService.hasFleetServerIntegration.mockReturnValue(false);
      mockedAgentPolicyService.list.mockResolvedValue({
        items: [],
      } as any);

      await outputService.update(soClient, esClientMock, 'existing-logstash-output-with-ssl', {
        type: 'logstash',
        hosts: ['0.0.0.0'],
        ssl: null,
      });

      expect(soClient.update).toBeCalledWith(expect.anything(), expect.anything(), {
        type: 'logstash',
        hosts: ['0.0.0.0'],
        ssl: null,
      });
    });
  });

  describe('delete', () => {
    // Preconfigured output
    it('Do not allow to delete a preconfigured output outisde from preconfiguration', async () => {
      await expect(outputService.delete('existing-preconfigured-default-output')).rejects.toThrow(
        'Preconfigured output existing-preconfigured-default-output cannot be deleted outside of kibana config file.'
      );
    });

    it('Allow to delete a preconfigured output from preconfiguration', async () => {
      const soClient = getMockedSoClient();
      await outputService.delete('existing-preconfigured-default-output', {
        fromPreconfiguration: true,
      });

      expect(soClient.delete).toBeCalled();
    });

    it('Call removeOutputFromAll before deleting the output', async () => {
      const soClient = getMockedSoClient();
      await outputService.delete('output-test');
      expect(mockedAgentPolicyService.removeOutputFromAll).toBeCalledWith(
        undefined,
        'output-test',
        {
          force: false,
        }
      );
      expect(mockedPackagePolicyService.removeOutputFromAll).toBeCalledWith(
        undefined,
        'output-test',
        {
          force: false,
        }
      );
      expect(soClient.delete).toBeCalled();
    });

    it('Call removeOutputFromAll with with force before deleting the output, if deleted from preconfiguration', async () => {
      const soClient = getMockedSoClient();
      await outputService.delete('existing-preconfigured-default-output', {
        fromPreconfiguration: true,
      });
      expect(mockedAgentPolicyService.removeOutputFromAll).toBeCalledWith(
        undefined,
        'existing-preconfigured-default-output',
        {
          force: true,
        }
      );
      expect(mockedPackagePolicyService.removeOutputFromAll).toBeCalledWith(
        undefined,
        'existing-preconfigured-default-output',
        {
          force: true,
        }
      );
      expect(soClient.delete).toBeCalled();
    });

    it('should call audit logger', async () => {
      const soClient = getMockedSoClient();
      await outputService.delete('existing-es-output');

      expect(mockedAuditLoggingService.writeCustomSoAuditLog).toHaveBeenCalledWith({
        action: 'delete',
        name: 'Test',
        id: outputIdToUuid('existing-es-output'),
        savedObjectType: OUTPUT_SAVED_OBJECT_TYPE,
      });
      expect(soClient.delete).toBeCalled();
    });
  });

  describe('get', () => {
    it('work with a predefined id', async () => {
      const output = await outputService.get('output-test');

      expect(esoClientMock.getDecryptedAsInternalUser).toHaveBeenCalledWith(
        'ingest-outputs',
        outputIdToUuid('output-test')
      );

      expect(output.id).toEqual('output-test');
    });

    it('should call audit logger', async () => {
      await outputService.get('existing-es-output');

      expect(mockedAuditLoggingService.writeCustomSoAuditLog).toHaveBeenCalledWith({
        action: 'get',
        name: 'Test',
        id: outputIdToUuid('existing-es-output'),
        savedObjectType: OUTPUT_SAVED_OBJECT_TYPE,
      });
    });
  });

  describe('bulkGet', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should decrypt and return multiple outputs', async () => {
      const esoClient = getMockedEncryptedSoClient();

      esoClient.getDecryptedAsInternalUser
        .mockResolvedValueOnce({
          id: outputIdToUuid('output-1'),
          type: OUTPUT_SAVED_OBJECT_TYPE,
          attributes: { name: 'Output 1', output_id: 'output-1' },
          references: [],
        } as any)
        .mockResolvedValueOnce({
          id: outputIdToUuid('output-2'),
          type: OUTPUT_SAVED_OBJECT_TYPE,
          attributes: { name: 'Output 2', output_id: 'output-2' },
          references: [],
        } as any);

      const outputs = await outputService.bulkGet(['output-1', 'output-2']);

      expect(esoClient.getDecryptedAsInternalUser).toHaveBeenCalledTimes(2);
      expect(esoClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
        OUTPUT_SAVED_OBJECT_TYPE,
        outputIdToUuid('output-1')
      );
      expect(esoClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
        OUTPUT_SAVED_OBJECT_TYPE,
        outputIdToUuid('output-2')
      );
      expect(outputs).toHaveLength(2);
      expect(outputs[0].id).toEqual('output-1');
      expect(outputs[1].id).toEqual('output-2');
    });

    it('should filter out not found errors when ignoreNotFound is true', async () => {
      const esoClient = getMockedEncryptedSoClient();

      const notFoundError = SavedObjectsErrorHelpers.createGenericNotFoundError(
        OUTPUT_SAVED_OBJECT_TYPE,
        outputIdToUuid('output-2')
      );

      esoClient.getDecryptedAsInternalUser
        .mockResolvedValueOnce({
          id: outputIdToUuid('output-1'),
          type: OUTPUT_SAVED_OBJECT_TYPE,
          attributes: { name: 'Output 1', output_id: 'output-1' },
          references: [],
        } as any)
        .mockRejectedValueOnce(notFoundError);

      const outputs = await outputService.bulkGet(['output-1', 'output-2'], {
        ignoreNotFound: true,
      });

      expect(outputs).toHaveLength(1);
      expect(outputs[0].id).toEqual('output-1');
    });

    it('should throw error for not found when ignoreNotFound is false', async () => {
      const esoClient = getMockedEncryptedSoClient();

      const notFoundError = SavedObjectsErrorHelpers.createGenericNotFoundError(
        OUTPUT_SAVED_OBJECT_TYPE,
        outputIdToUuid('output-1')
      );

      esoClient.getDecryptedAsInternalUser.mockRejectedValue(notFoundError);

      await expect(
        outputService.bulkGet(['output-1'], { ignoreNotFound: false } as any)
      ).rejects.toThrow();
    });

    it('should handle decryption errors when ignoreNotFound is true', async () => {
      const esoClient = getMockedEncryptedSoClient();

      const notFoundError = SavedObjectsErrorHelpers.createGenericNotFoundError(
        OUTPUT_SAVED_OBJECT_TYPE,
        outputIdToUuid('output-1')
      );
      esoClient.getDecryptedAsInternalUser.mockRejectedValue(notFoundError);

      const outputs = await outputService.bulkGet(['output-1'], {
        ignoreNotFound: true,
      });

      expect(outputs).toHaveLength(0);
    });

    it('should throw decryption errors when ignoreNotFound is false', async () => {
      const esoClient = getMockedEncryptedSoClient();

      const decryptionError = new Error('Decryption failed');
      esoClient.getDecryptedAsInternalUser.mockRejectedValue(decryptionError);

      await expect(
        outputService.bulkGet(['output-1'], { ignoreNotFound: false } as any)
      ).rejects.toThrow('Decryption failed');
    });

    it('should return empty array when ids is empty', async () => {
      const esoClient = getMockedEncryptedSoClient();

      const outputs = await outputService.bulkGet([]);

      expect(esoClient.getDecryptedAsInternalUser).not.toHaveBeenCalled();
      expect(outputs).toEqual([]);
    });
  });

  describe('ensureDefaultOutput', () => {
    beforeEach(() => {
      mockedAppContextService.getEncryptedSavedObjects.mockReturnValue(esoClientMock);
    });

    it('returns the existing default output via targeted queries without decrypting all outputs', async () => {
      const soClient = getMockedSoClient({ defaultOutputId: 'existing-default-output' });

      const output = await outputService.ensureDefaultOutput(soClient, esClientMock);

      expect(output.id).toEqual('existing-default-output');
      expect(esoClientMock.createPointInTimeFinderDecryptedAsInternalUser).not.toHaveBeenCalled();
      expect(soClient.create).not.toHaveBeenCalled();
    });
  });

  describe('getDefaultDataOutputId', () => {
    it('work with a predefined id', async () => {
      const soClient = getMockedSoClient({
        defaultOutputId: 'output-test',
      });
      const defaultId = await outputService.getDefaultDataOutputId();

      expect(soClient.find).toHaveBeenCalled();

      expect(defaultId).toEqual('output-test');
    });
  });

  describe('getDefaultMonitoringOutputOd', () => {
    it('work with a predefined id', async () => {
      const soClient = getMockedSoClient({
        defaultOutputMonitoringId: 'output-test',
      });
      const defaultId = await outputService.getDefaultMonitoringOutputId();

      expect(soClient.find).toHaveBeenCalled();

      expect(defaultId).toEqual('output-test');
    });
  });

  describe('getDefaultESHosts', () => {
    afterEach(() => {
      mockedAppContextService.getConfig.mockReset();
      mockedAppContextService.getConfig.mockReset();
    });
    it('Should use cloud plugin as the source of truth for ES hosts', () => {
      // @ts-expect-error
      mockedAppContextService.getCloud.mockReturnValue({
        isCloudEnabled: true,
        cloudId: CLOUD_ID,
        elasticsearchUrl: 'https://cec6f261a74bf24ce33bb8811b84294f.us-east-1.aws.found.io:443',
      });

      mockedAppContextService.getConfig.mockReturnValue(CONFIG_WITH_ES_HOSTS);

      const hosts = outputService.getDefaultESHosts();

      expect(hosts).toEqual([
        'https://cec6f261a74bf24ce33bb8811b84294f.us-east-1.aws.found.io:443',
      ]);
    });

    it('Should use the value from the config if not in cloud', () => {
      // @ts-expect-error
      mockedAppContextService.getCloud.mockReturnValue({
        isCloudEnabled: false,
      });

      mockedAppContextService.getConfig.mockReturnValue(CONFIG_WITH_ES_HOSTS);

      const hosts = outputService.getDefaultESHosts();

      expect(hosts).toEqual(['http://host1.com']);
    });

    it('Should use the default value if there is no config', () => {
      // @ts-expect-error
      mockedAppContextService.getCloud.mockReturnValue({
        isCloudEnabled: false,
      });

      mockedAppContextService.getConfig.mockReturnValue(CONFIG_WITHOUT_ES_HOSTS);

      const hosts = outputService.getDefaultESHosts();

      expect(hosts).toEqual(['http://localhost:9200']);
    });
  });

  describe('getLatestOutputHealth', () => {
    let soClient: any;
    beforeEach(() => {
      soClient = getMockedSoClient();
    });

    it('should return unknown state if no hits', async () => {
      esClientMock.search.mockResolvedValue({
        hits: {
          hits: [],
        },
      } as any);

      const response = await outputService.getLatestOutputHealth(esClientMock, 'id');

      expect(response).toEqual({
        state: 'UNKNOWN',
        message: '',
        timestamp: '',
      });
    });

    it('should return state from hits', async () => {
      esClientMock.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _source: {
                state: 'DEGRADED',
                message: 'connection error',
                '@timestamp': '2023-11-30T14:25:31Z',
              },
            },
          ],
        },
      } as any);

      const response = await outputService.getLatestOutputHealth(esClientMock, 'id');

      expect(response).toEqual({
        state: 'DEGRADED',
        message: 'connection error',
        timestamp: '2023-11-30T14:25:31Z',
      });
    });

    it('should apply range filter if updated_at available', async () => {
      const updatedAt = '2023-11-30T14:25:31Z';
      soClient.get.mockResolvedValue(
        mockOutputSO(
          'id',
          {
            type: 'remote_elasticsearch',
          },
          updatedAt
        )
      );

      await outputService.getLatestOutputHealth(esClientMock, 'id');

      expect((esClientMock.search.mock.lastCall?.[0] as any)?.query.bool.must).toEqual([
        {
          range: {
            '@timestamp': {
              gte: updatedAt,
            },
          },
        },
      ]);
    });

    it('should not apply range filter if updated_at is not available', async () => {
      soClient.get.mockResolvedValue(
        mockOutputSO('id', {
          type: 'remote_elasticsearch',
        })
      );

      await outputService.getLatestOutputHealth(esClientMock, 'id');

      expect((esClientMock.search.mock.lastCall?.[0] as any)?.query.bool.must).toEqual([]);
    });

    it('should not apply range filter if output query returns error', async () => {
      soClient.get.mockResolvedValue({ error: { message: 'error' } });

      await outputService.getLatestOutputHealth(esClientMock, 'id');

      expect((esClientMock.search.mock.lastCall?.[0] as any)?.query.bool.must).toEqual([]);
    });
  });

  describe('backfillAllOutputPresets', () => {
    beforeEach(() => {
      // Ensure the encrypted saved objects client mock is set up
      mockedAppContextService.getEncryptedSavedObjects.mockReturnValue(esoClientMock);
      mockedAgentPolicyService.bumpAllAgentPoliciesForOutput.mockClear();
    });

    it('backfills the preset for ES outputs that are missing one without decrypting all outputs', async () => {
      mockedPackagePolicyService.list.mockResolvedValue({ items: [] } as any);
      const soClient = getMockedSoClient({});
      soClient.find.mockResolvedValue({
        page: 1,
        per_page: SO_SEARCH_LIMIT,
        total: 1,
        saved_objects: [
          {
            ...mockOutputSO('output-without-preset', {
              is_preconfigured: false,
              type: 'elasticsearch',
            }),
            score: 0,
          },
        ],
      });

      await expect(
        outputService.backfillAllOutputPresets(soClient, esClientMock)
      ).resolves.not.toThrow();

      expect(soClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          type: OUTPUT_SAVED_OBJECT_TYPE,
          filter: expect.stringContaining('not ingest-outputs.attributes.preset:*'),
        })
      );
      expect(esoClientMock.createPointInTimeFinderDecryptedAsInternalUser).not.toHaveBeenCalled();
      expect(soClient.update).toHaveBeenCalledWith(
        OUTPUT_SAVED_OBJECT_TYPE,
        outputIdToUuid('output-without-preset'),
        expect.objectContaining({ preset: 'balanced' })
      );
      expect(mockedAgentPolicyService.bumpAllAgentPoliciesForOutput).toHaveBeenCalled();
    });

    it('exits early without updating anything when no outputs are missing a preset', async () => {
      mockedPackagePolicyService.list.mockResolvedValue({ items: [] } as any);
      const soClient = getMockedSoClient({});
      soClient.find.mockResolvedValue({
        page: 1,
        per_page: SO_SEARCH_LIMIT,
        total: 0,
        saved_objects: [],
      });

      await expect(
        outputService.backfillAllOutputPresets(soClient, esClientMock)
      ).resolves.not.toThrow();

      expect(soClient.update).not.toHaveBeenCalled();
      expect(mockedAgentPolicyService.bumpAllAgentPoliciesForOutput).not.toHaveBeenCalled();
    });
  });

  describe('outputSavedObjectToOutput', () => {
    it('should return output object with parsed SSL when SSL is a valid JSON string', () => {
      const so = mockOutputSO('output-test', {
        ssl: '{ "certificate": "cert", "key": "key" }',
      });

      const output = outputSavedObjectToOutput(so);

      expect(output.ssl).toEqual({ certificate: 'cert', key: 'key' });
    });

    it('should return output object with no SSL field when SSL is an invalid JSON string', () => {
      const so = mockOutputSO('output-test', {
        ssl: 'invalid-json',
      });

      const output = outputSavedObjectToOutput(so);

      expect(output.ssl).toEqual(undefined);
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Unable to parse ssl for output ${so.id}`)
      );
    });

    it('should return output object with no SSL field when SSL is not a string', () => {
      const so = mockOutputSO('output-test', {
        ssl: { certificate: 'cert', key: 'key' },
      });

      const output = outputSavedObjectToOutput(so);

      expect(output.ssl).toEqual(undefined);
    });
  });
});
