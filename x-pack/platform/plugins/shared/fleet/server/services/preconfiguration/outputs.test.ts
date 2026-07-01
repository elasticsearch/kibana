/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, savedObjectsClientMock } from '@kbn/core/server/mocks';

import { appContextService } from '../app_context';
import type { PreconfiguredOutput } from '../../../common/types';
import type { Output } from '../../types';
import * as agentPolicy from '../agent_policy';
import { outputService } from '../output';

import { SERVERLESS_DEFAULT_OUTPUT_ID, SERVERLESS_PRIVATE_OUTPUT_ID } from '../../constants';

import {
  createOrUpdatePreconfiguredOutputs,
  cleanPreconfiguredOutputs,
  getPreconfiguredOutputFromConfig,
  hashSecret,
} from './outputs';

jest.mock('../agent_policy_update');
jest.mock('../output');
jest.mock('../epm/packages/bundled_packages');
jest.mock('../epm/archive');
jest.mock('../settings');

const mockedOutputService = outputService as jest.Mocked<typeof outputService>;

jest.mock('../app_context', () => ({
  appContextService: {
    getExperimentalFeatures: jest.fn().mockReturnValue({
      useSpaceAwareness: false,
    }),
    getInternalUserSOClient: jest.fn(),
    getInternalUserSOClientWithoutSpaceExtension: jest.fn(),
    getLogger: () =>
      new Proxy(
        {},
        {
          get() {
            return jest.fn();
          },
        }
      ),
    getTaskManagerStart: jest.fn(),
    getCloud: jest.fn().mockReturnValue(null),
    getConfig: jest.fn().mockReturnValue({}),
  },
}));

const spyAgentPolicyServicBumpAllAgentPoliciesForOutput = jest.spyOn(
  agentPolicy.agentPolicyService,
  'bumpAllAgentPoliciesForOutput'
);

describe('Outputs preconfiguration', () => {
  let logstashSecretHash: string;

  beforeEach(async () => {
    logstashSecretHash = await hashSecret('secretKey');
    const internalSoClientWithoutSpaceExtension = savedObjectsClientMock.create();
    jest
      .mocked(appContextService.getInternalUserSOClientWithoutSpaceExtension)
      .mockReturnValue(internalSoClientWithoutSpaceExtension);
    internalSoClientWithoutSpaceExtension.find.mockResolvedValue({
      saved_objects: [],
      page: 0,
      per_page: 0,
      total: 0,
    });
    internalSoClientWithoutSpaceExtension.bulkGet.mockResolvedValue({
      saved_objects: [],
    });
    mockedOutputService.create.mockReset();
    mockedOutputService.update.mockReset();
    mockedOutputService.delete.mockReset();
    mockedOutputService.getDefaultDataOutputId.mockReset();
    mockedOutputService.getDefaultESHosts.mockReturnValue(['http://default-es:9200']);
    const keyHash = (await hashSecret('secretKey')) as string;
    const passwordHash = (await hashSecret('secretPassword')) as string;
    const serviceTokenHash = (await hashSecret('secretServiceToken')) as string;

    mockedOutputService.bulkGet.mockImplementation(async (soClient, id): Promise<Output[]> => {
      return [
        {
          id: 'existing-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'ES Output 1',
          // @ts-ignore
          type: 'elasticsearch',
          hosts: ['http://es.co:80'],
          is_preconfigured: true,
        },
        {
          id: 'existing-es-output-1-with-secrets-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'ES Output 1',
          // @ts-ignore
          type: 'elasticsearch',
          hosts: ['http://es.co:80'],
          is_preconfigured: true,
          secrets: {
            ssl: {
              key: {
                id: '123',
                hash: keyHash,
              },
            },
          },
        },
        {
          id: 'existing-logstash-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Logstash Output 1',
          type: 'logstash',
          hosts: ['test:4343'],
          is_preconfigured: true,
          ssl: {
            key: 'unsecureKey',
          },
        },
        {
          id: 'existing-logstash-output-with-secrets-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Logstash Output With Secrets 1',
          type: 'logstash',
          hosts: ['test:4343'],
          is_preconfigured: true,
          secrets: {
            ssl: {
              key: {
                id: '123',
                hash: keyHash,
              },
            },
          },
        },
        {
          id: 'existing-logstash-output-with-secrets-2',
          is_default: false,
          is_default_monitoring: false,
          name: 'Logstash Output With Secrets ',
          type: 'logstash',
          hosts: ['test:4343'],
          is_preconfigured: true,
          secrets: {
            ssl: {
              key: 'secretKey',
            },
          },
        },
        {
          id: 'existing-logstash-output-with-secrets-3-outdatded-hash',
          is_default: false,
          is_default_monitoring: false,
          name: 'Logstash Output With Secrets 3',
          type: 'logstash',
          hosts: ['test:4343'],
          is_preconfigured: true,
          secrets: {
            ssl: {
              key: { id: 'test456', hash: 'test456:outdatedhash' },
            },
          },
        },
        {
          id: 'existing-logstash-output-with-secrets-4-hash',
          is_default: false,
          is_default_monitoring: false,
          name: 'Logstash Output With Secrets 4',
          type: 'logstash',
          hosts: ['test:4343'],
          is_preconfigured: true,
          secrets: {
            ssl: {
              key: { id: 'test123', hash: logstashSecretHash },
            },
          },
        },
        {
          id: 'existing-kafka-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Kafka Output 1',
          // @ts-ignore
          type: 'kafka',
          hosts: ['kafka.co:80'],
          is_preconfigured: true,
          password: 'unsecurePassword',
          ssl: {
            key: 'unsecureKey',
          },
        },
        {
          id: 'existing-kafka-output-with-secrets-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Kafka Output With Secrets 1',
          type: 'kafka',
          hosts: ['kafka.co:80'],
          is_preconfigured: true,
          secrets: {
            password: {
              id: '456',
              hash: passwordHash,
            },
            ssl: {
              key: {
                id: '789',
                hash: keyHash,
              },
            },
          },
        },
        {
          id: 'existing-kafka-output-with-secrets-2',
          is_default: false,
          is_default_monitoring: false,
          name: 'Kafka Output With Secrets 2',
          type: 'kafka',
          hosts: ['kafka.co:80'],
          is_preconfigured: true,
          secrets: {
            password: 'secretPassword',
            ssl: {
              key: 'secretKey',
            },
          },
        },
        {
          id: 'existing-remote-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Remote ES Output 1',
          type: 'remote_elasticsearch',
          hosts: ['https:es.co:80'],
          is_preconfigured: true,
          service_token: 'unsecureServiceToken',
          kibana_api_key: 'unsecureKibanaApiKey',
        },
        {
          id: 'existing-remote-es-output-with-secrets-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Remote ES Output With Secrets 1',
          type: 'remote_elasticsearch',
          hosts: ['https:es.co:80'],
          is_preconfigured: true,
          secrets: {
            service_token: {
              id: '101112',
              hash: serviceTokenHash,
            },
            ssl: {
              key: {
                id: '789',
                hash: keyHash,
              },
            },
          },
        },
        {
          id: 'existing-remote-es-output-with-secrets-2',
          is_default: false,
          is_default_monitoring: false,
          name: 'Remote ES Output With Secrets 2',
          type: 'remote_elasticsearch',
          hosts: ['https:es.co:80'],
          is_preconfigured: true,
          secrets: {
            service_token: 'secretServiceToken',
          },
        },
      ];
    });
    spyAgentPolicyServicBumpAllAgentPoliciesForOutput.mockClear();
  });

  describe('create', () => {
    it('should generate a preconfigured output if elasticsearch.hosts is set in the config', async () => {
      expect(
        getPreconfiguredOutputFromConfig({
          agents: {
            elasticsearch: { hosts: ['http://elasticsearc:9201'] },
          },
        })
      ).toMatchInlineSnapshot(`
      Array [
        Object {
          "ca_sha256": undefined,
          "ca_trusted_fingerprint": undefined,
          "hosts": Array [
            "http://elasticsearc:9201",
          ],
          "id": "fleet-default-output",
          "is_default": true,
          "is_default_monitoring": true,
          "is_preconfigured": true,
          "name": "default",
          "type": "elasticsearch",
        },
      ]
    `);
    });

    it('should include ECH agentless output when agentless is enabled in cloud environment', async () => {
      // Mock the app context service for this test
      const originalGetCloud = appContextService.getCloud;
      const originalGetConfig = appContextService.getConfig;

      jest.mocked(appContextService.getCloud).mockReturnValue({
        isCloudEnabled: true,
        isServerlessEnabled: false,
        elasticsearchUrl: 'https://test-es.co:9200',
      } as any);

      // Mock the isAgentlessEnabled function by mocking getConfig
      jest.mocked(appContextService.getConfig).mockReturnValue({
        agentless: { enabled: true },
        agents: {
          elasticsearch: {
            hosts: ['http://localhost:9200'],
            ca_sha256: 'test-ca-sha256',
          },
        },
      } as any);

      const result = getPreconfiguredOutputFromConfig({
        agents: {
          elasticsearch: {
            hosts: ['http://localhost:9200'],
            ca_sha256: 'test-ca-sha256',
          },
        },
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'fleet-default-output',
        name: 'default',
        type: 'elasticsearch',
        is_default: true,
        is_default_monitoring: true,
        is_preconfigured: true,
      });
      expect(result[1]).toMatchObject({
        id: 'es-agentless-output',
        name: 'Internal output for agentless',
        type: 'elasticsearch',
        hosts: ['https://test-es.co:9200'],
        ca_sha256: 'test-ca-sha256',
        is_default: false,
        is_default_monitoring: false,
        is_preconfigured: true,
      });

      // Restore original mocks
      jest.mocked(appContextService.getCloud).mockImplementation(originalGetCloud);
      jest.mocked(appContextService.getConfig).mockImplementation(originalGetConfig);
    });

    it('should not include ECH agentless output when agentless is disabled', async () => {
      const originalGetCloud = appContextService.getCloud;
      const originalGetConfig = appContextService.getConfig;

      jest.mocked(appContextService.getCloud).mockReturnValue({
        isCloudEnabled: true,
        isServerlessEnabled: false,
      } as any);

      jest.mocked(appContextService.getConfig).mockReturnValue({
        agentless: { enabled: false },
        agents: {
          elasticsearch: { hosts: ['http://localhost:9200'] },
        },
      } as any);

      const result = getPreconfiguredOutputFromConfig({
        agents: {
          elasticsearch: { hosts: ['http://localhost:9200'] },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('fleet-default-output');

      // Restore original mocks
      jest.mocked(appContextService.getCloud).mockImplementation(originalGetCloud);
      jest.mocked(appContextService.getConfig).mockImplementation(originalGetConfig);
    });

    it('should not include ECH agentless output in serverless environment', async () => {
      const originalGetCloud = appContextService.getCloud;
      const originalGetConfig = appContextService.getConfig;

      jest.mocked(appContextService.getCloud).mockReturnValue({
        isCloudEnabled: true,
        isServerlessEnabled: true,
      } as any);

      jest.mocked(appContextService.getConfig).mockReturnValue({
        agentless: { enabled: true },
        agents: {
          elasticsearch: { hosts: ['http://localhost:9200'] },
        },
      } as any);

      const result = getPreconfiguredOutputFromConfig({
        agents: {
          elasticsearch: { hosts: ['http://localhost:9200'] },
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('fleet-default-output');

      // Restore original mocks
      jest.mocked(appContextService.getCloud).mockImplementation(originalGetCloud);
      jest.mocked(appContextService.getConfig).mockImplementation(originalGetConfig);
    });

    it('should create a preconfigured ES output that does not exist', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'non-existing-es-output-1',
          name: 'ES Output 1',
          type: 'elasticsearch',
          is_default: false,
          is_default_monitoring: false,
          hosts: ['http://test.fr'],
          ssl: {
            certificate_authorities: ['cert'],
            certificate: 'cert',
            key: 'plain_key',
          },
        },
      ]);

      expect(mockedOutputService.create).toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should create a preconfigured ES output with secrets that does not exist', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'non-existing-es-output-1',
          name: 'ES Output 1',
          type: 'elasticsearch',
          is_default: false,
          is_default_monitoring: false,
          hosts: ['http://test.fr'],
          secrets: {
            ssl: {
              key: 'KEY_1',
            },
          },
        },
      ]);

      expect(mockedOutputService.create).toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should create a preconfigured ES output with ca_trusted_fingerprint that does not exist', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'non-existing-es-output-1',
          name: 'ES Output 1',
          type: 'elasticsearch',
          is_default: false,
          is_default_monitoring: false,
          hosts: ['http://test.fr'],
          ca_trusted_fingerprint: 'testfingerprint',
        },
      ]);

      expect(mockedOutputService.create).toBeCalled();
      expect(mockedOutputService.create).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          ca_trusted_fingerprint: 'testfingerprint',
        }),
        expect.anything()
      );
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should create a preconfigured ES output with default hosts if the output does not exist and hosts is not set', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'non-existing-es-output-1',
          name: 'Output 1',
          type: 'elasticsearch',
          is_default: false,
          is_default_monitoring: false,
        },
      ]);

      expect(mockedOutputService.create).toBeCalled();
      expect(mockedOutputService.create.mock.calls[0][2].hosts).toEqual(['http://default-es:9200']);
    });

    it('should create a preconfigured logstash output that does not exist', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'non-existing-logstash-output-1',
          name: 'Logstash Output 1',
          type: 'logstash',
          is_default: false,
          is_default_monitoring: false,
          hosts: ['test:4343'],
          ssl: { certificate: 'test', key: 'test' },
        },
      ]);

      expect(mockedOutputService.create).toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should create a preconfigured logstash output with secrets that does not exist', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'non-existing-logstash-output-with-secrets-1',
          name: 'Logstash Output With Secrets 1',
          type: 'logstash',
          is_default: false,
          is_default_monitoring: false,
          secrets: {
            ssl: {
              key: 'secretKey',
            },
          },
        },
      ]);

      expect(mockedOutputService.create).toBeCalled();
      expect(mockedOutputService.create).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          secrets: {
            ssl: {
              key: 'secretKey',
            },
          },
        }),
        expect.anything()
      );
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should create preconfigured kafka output that does not exist', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'non-existing-kafka-output-1',
          name: 'Kafka Output 1',
          type: 'kafka',
          is_default: false,
          is_default_monitoring: false,
          hosts: ['test.fr:2000'],
        },
      ]);

      expect(mockedOutputService.create).toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should create a preconfigured kafka output with secrets that does not exist', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'non-existing-kafka-output-with-secrets-1',
          name: 'Kafka Output With Secrets 2',
          type: 'kafka',
          is_default: false,
          is_default_monitoring: false,
          secrets: {
            password: 'secretPassword',
            ssl: {
              key: 'secretKey',
            },
          },
        },
      ]);

      expect(mockedOutputService.create).toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should create a preconfigured remote ES output that does not exist', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'non-existing-remote-es-output-1',
          name: 'Remote ES Output 1',
          type: 'remote_elasticsearch',
          is_default: false,
          is_default_monitoring: false,
          hosts: ['test.fr'],
          service_token: 'serviceToken',
          kibana_api_key: 'kibanaAPIKey',
          kibana_url: 'http://kibana.co',
          sync_integrations: true,
          ssl: {
            certificate_authorities: ['cert'],
            certificate: 'cert',
            key: 'plain_key',
          },
        } as PreconfiguredOutput,
      ]);

      expect(mockedOutputService.create).toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should create a preconfigured remote ES output with secrets that does not exist', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'non-existing-remote-es-output-with-secrets-1',
          name: 'Remote ES Output With Secrets 2',
          type: 'remote_elasticsearch',
          is_default: false,
          is_default_monitoring: false,
          secrets: {
            service_token: 'secretServiceToken',
            ssl: {
              key: 'test_key',
            },
          },
        },
      ]);

      expect(mockedOutputService.create).toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });
  });

  describe('update', () => {
    it('should update output if non preconfigured ES output with the same id exists', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      mockedOutputService.bulkGet.mockResolvedValue([
        {
          id: 'existing-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'ES Output 1',
          // @ts-ignore
          type: 'elasticsearch',
          hosts: ['http://es.co:80'],
          is_preconfigured: false,
        },
      ]);
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'ES Output 1',
          type: 'elasticsearch',
          hosts: ['http://es.co:80'],
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(mockedOutputService.update).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        'existing-es-output-1',
        expect.objectContaining({
          is_preconfigured: true,
        }),
        { fromPreconfiguration: true, secretHashes: expect.anything() }
      );
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should update output if preconfigured ES output exists and changed', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'ES Output 1',
          type: 'elasticsearch',
          hosts: ['http://newhostichanged.co:9201'], // field that changed
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should update output if preconfigured output exists and changed to is_internal: true', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'ES Output 1',
          type: 'elasticsearch',
          hosts: ['http://es.co:80'],
          is_internal: true,
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should update output if preconfigured ES output with secrets exists and changed to is_internal: true', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-es-output-1-with-secrets-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'ES Output 1',
          type: 'elasticsearch',
          hosts: ['http://es.co:80'],
          is_internal: true,
          secrets: { ssl: { key: 'new' } },
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should update output if a preconfigured logstash ouput exists and has changed', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-logstash-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Logstash Output 1',
          type: 'logstash',
          hosts: ['test:4343'],
          is_preconfigured: true,
          ssl: {
            key: 'unsecureKey2', // field that changed
          },
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should update output if a preconfigured logstash output with secrets exists and has changed', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-logstash-output-with-secrets-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Logstash Output With Secrets 1',
          type: 'logstash',
          secrets: {
            ssl: {
              key: 'secretKey2', // field that changed
            },
          },
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should update output if preconfigured kafka output exists and changed', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-kafka-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Kafka Output 1',
          type: 'kafka',
          hosts: ['kafka.co:8080'], // field that changed
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should update ouput if a preconfigured kafka with secrets exists and has changed', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-kafka-output-with-secrets-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Kafka Output With Secrets 1',
          type: 'kafka',
          secrets: {
            password: 'secretPassword2', // field that changed
            ssl: {
              key: 'secretKey2',
            },
          },
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should update output if preconfigured remote ES output exists and changed', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-remote-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Remote ES Output 1',
          type: 'remote_elasticsearch',
          is_preconfigured: true,
          service_token: 'stillUnsecureServiceToken', // field that changed
        } as PreconfiguredOutput,
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should update ouput if a preconfigured remote ES with secrets exists and has changed', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-remote-es-output-with-secrets-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Remote ES Output With Secrets 1',
          type: 'remote_elasticsearch',
          is_preconfigured: true,
          secrets: {
            service_token: 'secretServiceToken2', // field that changed
          },
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should update output if a preconfigured logstash output with plain value secrets exists and did not change', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-logstash-output-with-secrets-2',
          is_default: false,
          is_default_monitoring: false,
          name: 'Logstash Output With Secrets 2',
          type: 'logstash',
          hosts: ['test:4343'],
          secrets: {
            ssl: {
              key: 'secretKey', // no change
            },
          },
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should update output if a preconfigured logstash output with secrets exists and hash algorithm changed', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-logstash-output-with-secrets-3-outdatded-hash',
          is_default: false,
          is_default_monitoring: false,
          name: 'Logstash Output With Secrets 3',
          type: 'logstash',
          hosts: ['test:4343'],
          is_preconfigured: true,
          secrets: {
            ssl: {
              key: 'secretKey', // no change
            },
          },
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should not update output if a preconfigured logstash output with secrets exists and hash algorithm did not changed', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-logstash-output-with-secrets-4-hash',
          is_default: false,
          is_default_monitoring: false,
          name: 'Logstash Output With Secrets 4',
          type: 'logstash',
          hosts: ['test:4343'],
          is_preconfigured: true,
          secrets: {
            ssl: {
              key: 'secretKey', // no change
            },
          },
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should update output if a preconfigured kafka output with plain value secrets exists and did not change', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-kafka-output-with-secrets-2',
          is_default: false,
          is_default_monitoring: false,
          name: 'Kafka Output With Secrets 2',
          type: 'kafka',
          hosts: ['kafka.co:80'],
          secrets: {
            password: 'secretPassword', // no change
            ssl: {
              key: 'secretKey', // no change
            },
          },
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should update output if a preconfigured remote ES output with plain value secrets exists and did not change', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-remote-es-output-with-secrets-2',
          is_default: false,
          is_default_monitoring: false,
          name: 'Remote ES Output With Secrets 2',
          type: 'remote_elasticsearch',
          is_preconfigured: true,
          secrets: {
            service_token: 'secretServiceToken', // no change
          },
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    // Output should not update

    it('should not update output if preconfigured ES output exists and did not change', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'ES Output 1',
          type: 'elasticsearch',
          hosts: ['http://es.co:80'],
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should update output if preconfigured ES output exists and otel_exporter_config_yaml changed', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'ES Output 1',
          type: 'elasticsearch',
          hosts: ['http://es.co:80'],
          otel_exporter_config_yaml: 'flush_interval: 10s',
        } as any,
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should update output if preconfigured ES output exists and otel_disable_beatsauth changed', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'ES Output 1',
          type: 'elasticsearch',
          hosts: ['http://es.co:80'],
          otel_disable_beatsauth: true,
        } as any,
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should not update output if preconfigured ES output exists and otel fields did not change', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'ES Output 1',
          type: 'elasticsearch',
          hosts: ['http://es.co:80'],
          // neither otel field set — matches the existing mock which also has neither set
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should update output if preconfigured remote ES output exists and otel_exporter_config_yaml changed', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-remote-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Remote ES Output 1',
          type: 'remote_elasticsearch',
          hosts: ['https:es.co:80'],
          service_token: 'unsecureServiceToken',
          kibana_api_key: 'unsecureKibanaApiKey',
          otel_exporter_config_yaml: 'flush_interval: 10s',
        } as any,
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should update output if preconfigured remote ES output exists and otel_disable_beatsauth changed', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-remote-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Remote ES Output 1',
          type: 'remote_elasticsearch',
          hosts: ['https:es.co:80'],
          service_token: 'unsecureServiceToken',
          kibana_api_key: 'unsecureKibanaApiKey',
          otel_disable_beatsauth: true,
        } as any,
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).toBeCalled();
    });

    it('should not update output if preconfigured logstash output exists and did not change', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-logstash-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Logstash Output 1',
          type: 'logstash',
          hosts: ['test:4343'],
          is_preconfigured: true,
          ssl: {
            key: 'unsecureKey',
          },
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should not update output if preconfigured kafka output exists and did not change', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-kafka-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Kafka Output 1',
          type: 'kafka',
          hosts: ['kafka.co:80'],
          password: 'unsecurePassword',
          ssl: {
            key: 'unsecureKey',
          },
        } as PreconfiguredOutput,
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should not update output if preconfigured remote ES output exists and did not change', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-remote-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Remote ES Output 1',
          type: 'remote_elasticsearch',
          hosts: ['https:es.co:80'],
          is_preconfigured: true,
          service_token: 'unsecureServiceToken',
          kibana_api_key: 'unsecureKibanaAPIKey',
        } as PreconfiguredOutput,
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should not update output if a preconfigured logstash output with secrets exists and did not change', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-logstash-output-with-secrets-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Logstash Output With Secrets 1',
          type: 'logstash',
          hosts: ['test:4343'],
          secrets: {
            ssl: {
              key: 'secretKey',
            },
          },
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should not update output if a preconfigured kafka output with secrets exists and did not change', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-kafka-output-with-secrets-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Kafka Output With Secrets 1',
          type: 'kafka',
          hosts: ['kafka.co:80'],
          secrets: {
            password: 'secretPassword',
            ssl: { key: 'secretKey' },
          },
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    it('should not update output if a preconfigured remote ES output with secrets exists and did not change', async () => {
      const soClient = savedObjectsClientMock.create();
      const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      await createOrUpdatePreconfiguredOutputs(soClient, esClient, [
        {
          id: 'existing-remote-es-output-with-secrets-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'Remote ES Output With Secrets 1',
          type: 'remote_elasticsearch',
          hosts: ['https:es.co:80'],
          is_preconfigured: true,
          secrets: {
            service_token: 'secretServiceToken',
            ssl: { key: 'secretKey' },
          },
        },
      ]);

      expect(mockedOutputService.create).not.toBeCalled();
      expect(mockedOutputService.update).not.toBeCalled();
      expect(spyAgentPolicyServicBumpAllAgentPoliciesForOutput).not.toBeCalled();
    });

    const SCENARIOS: Array<{ name: string; data: PreconfiguredOutput }> = [
      {
        name: 'no changes',
        data: {
          id: 'existing-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'ES Output 1',
          type: 'elasticsearch',
          hosts: ['http://es.co:80'],
        },
      },
      {
        name: 'hosts without port',
        data: {
          id: 'existing-es-output-1',
          is_default: false,
          is_default_monitoring: false,
          name: 'ES Output 1',
          type: 'elasticsearch',
          hosts: ['http://es.co'],
        },
      },
    ];
    SCENARIOS.forEach((scenario) => {
      const { data, name } = scenario;
      it(`should do nothing if preconfigured output exists and did not changed (${name})`, async () => {
        const soClient = savedObjectsClientMock.create();
        const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
        await createOrUpdatePreconfiguredOutputs(soClient, esClient, [data]);

        expect(mockedOutputService.create).not.toBeCalled();
        expect(mockedOutputService.update).not.toBeCalled();
      });
    });

    describe('cleanPreconfiguredOutputs', () => {
      it('should not delete non deleted preconfigured output', async () => {
        const soClient = savedObjectsClientMock.create();
        const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

        mockedOutputService.list.mockResolvedValue({
          items: [
            { id: 'output1', is_preconfigured: true } as Output,
            { id: 'output2', is_preconfigured: true } as Output,
          ],
          page: 1,
          perPage: 10000,
          total: 1,
        });
        await cleanPreconfiguredOutputs(soClient, esClient, [
          {
            id: 'output1',
            is_default: false,
            is_default_monitoring: false,
            name: 'Output 1',
            type: 'elasticsearch',
            hosts: ['http://es.co:9201'],
          },
          {
            id: 'output2',
            is_default: false,
            is_default_monitoring: false,
            name: 'Output 2',
            type: 'elasticsearch',
            hosts: ['http://es.co:9201'],
          },
        ]);

        expect(mockedOutputService.delete).not.toBeCalled();
      });

      it('should delete deleted preconfigured output', async () => {
        const soClient = savedObjectsClientMock.create();
        const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
        mockedOutputService.list.mockResolvedValue({
          items: [
            { id: 'output1', is_preconfigured: true } as Output,
            { id: 'output2', is_preconfigured: true } as Output,
          ],
          page: 1,
          perPage: 10000,
          total: 1,
        });
        await cleanPreconfiguredOutputs(soClient, esClient, [
          {
            id: 'output1',
            is_default: false,
            is_default_monitoring: false,
            name: 'Output 1',
            type: 'elasticsearch',
            hosts: ['http://es.co:9201'],
          },
        ]);

        expect(mockedOutputService.delete).toBeCalled();
        expect(mockedOutputService.delete).toBeCalledTimes(1);
        expect(mockedOutputService.delete.mock.calls[0][0]).toEqual('output2');
      });

      it('should update default deleted preconfigured output', async () => {
        const soClient = savedObjectsClientMock.create();
        const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
        mockedOutputService.list.mockResolvedValue({
          items: [
            { id: 'output1', is_preconfigured: true, is_default: true } as Output,
            { id: 'output2', is_preconfigured: true, is_default_monitoring: true } as Output,
          ],
          page: 1,
          perPage: 10000,
          total: 1,
        });
        await cleanPreconfiguredOutputs(soClient, esClient, []);

        expect(mockedOutputService.delete).not.toBeCalled();
        expect(mockedOutputService.update).toBeCalledTimes(2);
        expect(mockedOutputService.update).toBeCalledWith(
          expect.anything(),
          expect.anything(),
          'output1',
          expect.objectContaining({
            is_preconfigured: false,
          }),
          { fromPreconfiguration: true }
        );
        expect(mockedOutputService.update).toBeCalledWith(
          expect.anything(),
          expect.anything(),
          'output2',
          expect.objectContaining({
            is_preconfigured: false,
          }),
          { fromPreconfiguration: true }
        );
      });

      it('should restore public default output when PrivateLink output was default and is removed from config', async () => {
        const soClient = savedObjectsClientMock.create();
        const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

        mockedOutputService.list.mockResolvedValue({
          items: [
            {
              id: SERVERLESS_PRIVATE_OUTPUT_ID,
              is_preconfigured: true,
              is_default: true,
              is_default_monitoring: true,
            } as Output,
          ],
          page: 1,
          perPage: 10000,
          total: 1,
        });

        await cleanPreconfiguredOutputs(soClient, esClient, []);

        // Should un-preconfigure the PrivateLink output
        expect(mockedOutputService.update).toBeCalledWith(
          expect.anything(),
          expect.anything(),
          SERVERLESS_PRIVATE_OUTPUT_ID,
          expect.objectContaining({ is_preconfigured: false }),
          { fromPreconfiguration: true }
        );

        // Should restore the public default
        expect(mockedOutputService.update).toBeCalledWith(
          expect.anything(),
          expect.anything(),
          SERVERLESS_DEFAULT_OUTPUT_ID,
          { is_default: true, is_default_monitoring: true },
          { fromPreconfiguration: true }
        );
      });
    });
  });
});

describe('getPreconfiguredOutputFromConfig — PrivateLink allow_edit injection', () => {
  const baseConfig = {
    agents: { elasticsearch: { hosts: undefined } },
  } as any;

  it('should inject allow_edit on the serverless default output', () => {
    const config = {
      ...baseConfig,
      outputs: [
        {
          id: SERVERLESS_DEFAULT_OUTPUT_ID,
          name: 'Default',
          type: 'elasticsearch' as const,
          is_default: true,
          is_default_monitoring: true,
          hosts: ['https://es.example.com'],
        },
      ],
    };

    const res = getPreconfiguredOutputFromConfig(config);
    const defaultOutput = res.find((o) => o.id === SERVERLESS_DEFAULT_OUTPUT_ID);

    expect(defaultOutput?.allow_edit).toContain('is_default');
    expect(defaultOutput?.allow_edit).toContain('is_default_monitoring');
  });

  it('should inject allow_edit on the PrivateLink output', () => {
    const config = {
      ...baseConfig,
      outputs: [
        {
          id: SERVERLESS_DEFAULT_OUTPUT_ID,
          name: 'Default',
          type: 'elasticsearch' as const,
          is_default: true,
          is_default_monitoring: true,
          hosts: ['https://es.example.com'],
        },
        {
          id: SERVERLESS_PRIVATE_OUTPUT_ID,
          name: 'Private ES Output',
          type: 'elasticsearch' as const,
          is_default: false,
          is_default_monitoring: false,
          is_internal: true,
          hosts: ['https://private-es.example.com'],
        },
      ],
    };

    const res = getPreconfiguredOutputFromConfig(config);
    const privateOutput = res.find((o) => o.id === SERVERLESS_PRIVATE_OUTPUT_ID);

    expect(privateOutput?.allow_edit).toContain('is_default');
    expect(privateOutput?.allow_edit).toContain('is_default_monitoring');
  });

  it('should not inject allow_edit on non-PrivateLink outputs', () => {
    const config = {
      ...baseConfig,
      outputs: [
        {
          id: 'custom-output',
          name: 'Custom',
          type: 'elasticsearch' as const,
          is_default: true,
          is_default_monitoring: true,
          hosts: ['https://es.example.com'],
        },
      ],
    };

    const res = getPreconfiguredOutputFromConfig(config);
    const output = res.find((o) => o.id === 'custom-output');

    expect(output?.allow_edit).toBeUndefined();
  });
});
