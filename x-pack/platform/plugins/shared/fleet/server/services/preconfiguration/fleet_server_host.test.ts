/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { savedObjectsClientMock, elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { securityMock } from '@kbn/security-plugin/server/mocks';

import { appContextService } from '../app_context';
import { fleetServerHostService } from '../fleet_server_host';

import type { FleetServerHost } from '../../../common/types';

import {
  SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
  SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID,
} from '../../constants';

import {
  createCloudFleetServerHostIfNeeded,
  getCloudFleetServersHosts,
  getPreconfiguredFleetServerHostFromConfig,
  createOrUpdatePreconfiguredFleetServerHosts,
  cleanPreconfiguredFleetServerHosts,
} from './fleet_server_host';

import { hashSecret } from './outputs';

jest.mock('../fleet_server_host');
jest.mock('../app_context');
jest.mock('../agent_policy');

const mockedAppContextService = appContextService as jest.Mocked<typeof appContextService>;
mockedAppContextService.getSecuritySetup.mockImplementation(() => ({
  ...securityMock.createSetup(),
}));

const mockedFleetServerHostService = fleetServerHostService as jest.Mocked<
  typeof fleetServerHostService
>;

describe('getPreconfiguredFleetServerHostFromConfig', () => {
  afterEach(() => {
    mockedAppContextService.getCloud.mockReset();
    mockedAppContextService.getConfig.mockReset();
  });

  it('should work with preconfigured fleetServerHosts', () => {
    const config = {
      fleetServerHosts: [
        {
          id: 'fleet-123',
          name: 'TEST',
          is_default: true,
          host_urls: ['http://test.fr'],
        },
      ],
    };

    const res = getPreconfiguredFleetServerHostFromConfig(config);

    expect(res).toEqual(config.fleetServerHosts);
  });

  it('should include ECH agentless Fleet Server host when agentless is enabled in cloud', () => {
    mockedAppContextService.getCloud.mockReturnValue({
      isCloudEnabled: true,
      isServerlessEnabled: false,
      deploymentId: 'test-deployment',
      cloudHost: 'test.co',
    } as any);
    mockedAppContextService.getConfig.mockReturnValue({
      agentless: { enabled: true },
    } as any);

    const config = {
      fleetServerHosts: [
        {
          id: 'fleet-123',
          name: 'TEST',
          is_default: true,
          host_urls: ['http://test.fr'],
        },
      ],
    };

    const res = getPreconfiguredFleetServerHostFromConfig(config);

    expect(res).toHaveLength(2);
    expect(res).toEqual([
      {
        id: 'fleet-123',
        name: 'TEST',
        is_default: true,
        host_urls: ['http://test.fr'],
      },
      {
        id: 'internal-agentless-fleet-server',
        name: 'Internal Fleet Server for agentless',
        host_urls: ['https://test-deployment.fleet.test.co'],
        is_default: false,
        is_preconfigured: true,
      },
    ]);
  });

  it('should not include ECH agentless Fleet Server host when agentless is disabled', () => {
    mockedAppContextService.getCloud.mockReturnValue({
      isCloudEnabled: true,
      isServerlessEnabled: false,
    } as any);
    mockedAppContextService.getConfig.mockReturnValue({
      agentless: { enabled: false },
    } as any);

    const config = {
      fleetServerHosts: [
        {
          id: 'fleet-123',
          name: 'TEST',
          is_default: true,
          host_urls: ['http://test.fr'],
        },
      ],
    };

    const res = getPreconfiguredFleetServerHostFromConfig(config);

    expect(res).toHaveLength(1);
    expect(res).toEqual(config.fleetServerHosts);
  });

  it('should not include ECH agentless Fleet Server host in serverless environment', () => {
    mockedAppContextService.getCloud.mockReturnValue({
      isCloudEnabled: true,
      isServerlessEnabled: true,
    } as any);
    mockedAppContextService.getConfig.mockReturnValue({
      agentless: { enabled: true },
    } as any);

    const config = {
      fleetServerHosts: [
        {
          id: 'fleet-123',
          name: 'TEST',
          is_default: true,
          host_urls: ['http://test.fr'],
        },
      ],
    };

    const res = getPreconfiguredFleetServerHostFromConfig(config);

    expect(res).toHaveLength(1);
    expect(res).toEqual(config.fleetServerHosts);
  });

  it('should work with preconfigured fleetServerHosts that have SSL options', () => {
    const config = {
      fleetServerHosts: [
        {
          id: 'id1',
          name: 'fleet server 1',
          host_urls: [],
          is_default: false,
          is_preconfigured: false,
          ssl: {
            certificate_authorities: ['cert authorities'],
            es_certificate_authorities: ['es cert authorities'],
            certificate: 'path/to/cert',
            es_certificate: 'path/to/EScert',
          },
        },
      ],
    };

    const res = getPreconfiguredFleetServerHostFromConfig(config);

    expect(res).toEqual(config.fleetServerHosts);
  });

  it('should work with agents.fleet_server.hosts', () => {
    const config = {
      agents: { fleet_server: { hosts: ['http://test.fr'] } },
    };

    const res = getPreconfiguredFleetServerHostFromConfig(config);

    expect(res).toEqual([
      {
        id: 'fleet-default-fleet-server-host',
        name: 'Default',
        host_urls: ['http://test.fr'],
        is_default: true,
      },
    ]);
  });

  it('should work with agents.fleet_server.hosts and preconfigured outputs', () => {
    const config = {
      agents: { fleet_server: { hosts: ['http://test.fr'] } },
      fleetServerHosts: [
        {
          id: 'fleet-123',
          name: 'TEST',
          is_default: false,
          host_urls: ['http://test.fr'],
        },
      ],
    };

    const res = getPreconfiguredFleetServerHostFromConfig(config);

    expect(res).toHaveLength(2);
    expect(res.map(({ id }) => id)).toEqual(['fleet-123', 'fleet-default-fleet-server-host']);
  });

  it('should work with preconfigured internal fleetServerHosts', () => {
    const config = {
      fleetServerHosts: [
        {
          id: 'fleet-123',
          name: 'TEST',
          is_default: true,
          host_urls: ['http://test.fr'],
        },
        {
          id: 'fleet-internal',
          name: 'TEST_INTERNAL',
          is_default: false,
          is_internal: true,
          host_urls: ['http://test-internal.fr'],
        },
      ],
    };

    const res = getPreconfiguredFleetServerHostFromConfig(config);

    expect(res).toEqual(config.fleetServerHosts);
  });

  it('should throw if there is multiple default outputs', () => {
    const config = {
      agents: { fleet_server: { hosts: ['http://test.fr'] } },
      fleetServerHosts: [
        {
          id: 'fleet-123',
          name: 'TEST',
          is_default: true,
          host_urls: ['http://test.fr'],
        },
      ],
    };

    expect(() => getPreconfiguredFleetServerHostFromConfig(config)).toThrowError(
      /Only one default Fleet Server host is allowed/
    );
  });
});

describe('getCloudFleetServersHosts', () => {
  afterEach(() => {
    mockedAppContextService.getCloud.mockReset();
  });
  it('should return undefined if cloud is not setup', () => {
    expect(getCloudFleetServersHosts()).toBeUndefined();
  });

  it('should return fleet server hosts if cloud is correctly setup in serverless', () => {
    mockedAppContextService.getCloud.mockReturnValue({
      cloudId:
        'dXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRjZWM2ZjI2MWE3NGJmMjRjZTMzYmI4ODExYjg0Mjk0ZiRjNmMyY2E2ZDA0MjI0OWFmMGNjN2Q3YTllOTYyNTc0Mw==',
      isCloudEnabled: true,
      deploymentId: 'deployment-id-1',
      cloudHost: 'us-east-1.aws.found.io',
      apm: {},
      onboarding: {},
      isServerlessEnabled: true,
      serverless: {
        projectId: undefined,
      },
      isInTrial: () => false,
      trialDaysLeft: () => 0,
    });

    expect(getCloudFleetServersHosts()).toBeUndefined();
  });

  it('should return fleet server hosts if cloud is correctly setup with default port == 443', () => {
    mockedAppContextService.getCloud.mockReturnValue({
      cloudId:
        'dXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRjZWM2ZjI2MWE3NGJmMjRjZTMzYmI4ODExYjg0Mjk0ZiRjNmMyY2E2ZDA0MjI0OWFmMGNjN2Q3YTllOTYyNTc0Mw==',
      isCloudEnabled: true,
      deploymentId: 'deployment-id-1',
      cloudHost: 'us-east-1.aws.found.io',
      apm: {},
      onboarding: {},
      isServerlessEnabled: false,
      serverless: {
        projectId: undefined,
      },
      isInTrial: () => false,
      trialDaysLeft: () => 0,
    });

    expect(getCloudFleetServersHosts()).toMatchInlineSnapshot(`
      Array [
        "https://deployment-id-1.fleet.us-east-1.aws.found.io",
      ]
    `);
  });

  it('should return fleet server hosts if cloud is correctly setup with a default port', () => {
    mockedAppContextService.getCloud.mockReturnValue({
      cloudId:
        'test:dGVzdC5mcjo5MjQzJGRhM2I2YjNkYWY5ZDRjODE4ZjI4ZmEzNDdjMzgzODViJDgxMmY4NWMxZjNjZTQ2YTliYjgxZjFjMWIxMzRjNmRl',
      isCloudEnabled: true,
      deploymentId: 'deployment-id-1',
      cloudHost: 'test.fr',
      cloudDefaultPort: '9243',
      apm: {},
      onboarding: {},
      isServerlessEnabled: false,
      serverless: {
        projectId: undefined,
      },
      isInTrial: () => false,
      trialDaysLeft: () => 0,
    });

    expect(getCloudFleetServersHosts()).toMatchInlineSnapshot(`
      Array [
        "https://deployment-id-1.fleet.test.fr:9243",
      ]
    `);
  });
});

describe('createCloudFleetServerHostsIfNeeded', () => {
  afterEach(() => {
    mockedFleetServerHostService.create.mockReset();
    mockedAppContextService.getCloud.mockReset();
    mockedAppContextService.getConfig.mockReset();
  });
  it('should do nothing if there is no cloud fleet server hosts', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    await createCloudFleetServerHostIfNeeded(soClient, esClient);

    expect(mockedFleetServerHostService.create).not.toBeCalled();
  });

  it('should create only default fleet server host if agentless already exists', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    mockedAppContextService.getCloud.mockReturnValue({
      cloudId:
        'dXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRjZWM2ZjI2MWE3NGJmMjRjZTMzYmI4ODExYjg0Mjk0ZiRjNmMyY2E2ZDA0MjI0OWFmMGNjN2Q3YTllOTYyNTc0Mw==',
      isCloudEnabled: true,
      deploymentId: 'deployment-id-1',
      cloudHost: 'us-east-1.aws.found.io',
      apm: {},
      onboarding: {},
      isServerlessEnabled: false,
      serverless: {
        projectId: undefined,
      },
      isInTrial: () => false,
      trialDaysLeft: () => 0,
    });
    mockedAppContextService.getConfig.mockReturnValue({
      agentless: { enabled: true },
    } as any);
    // Default doesn't exist but agentless does
    mockedFleetServerHostService.getDefaultFleetServerHost = jest
      .fn()
      .mockResolvedValue(null as any);
    mockedFleetServerHostService.get.mockResolvedValue({
      id: 'existing-agentless',
    } as any);

    await createCloudFleetServerHostIfNeeded(soClient, esClient);

    expect(mockedFleetServerHostService.create).toBeCalledTimes(1);

    // Verify only default Fleet Server host creation
    expect(mockedFleetServerHostService.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        name: 'Default',
        host_urls: ['https://deployment-id-1.fleet.us-east-1.aws.found.io'],
        is_default: true,
        is_preconfigured: false,
      }),
      { id: 'fleet-default-fleet-server-host', overwrite: true, fromPreconfiguration: true }
    );
  });

  it('should create only default fleet server host if agentless is disabled', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    mockedAppContextService.getCloud.mockReturnValue({
      cloudId:
        'dXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRjZWM2ZjI2MWE3NGJmMjRjZTMzYmI4ODExYjg0Mjk0ZiRjNmMyY2E2ZDA0MjI0OWFmMGNjN2Q3YTllOTYyNTc0Mw==',
      isCloudEnabled: true,
      deploymentId: 'deployment-id-1',
      cloudHost: 'us-east-1.aws.found.io',
      apm: {},
      onboarding: {},
      isServerlessEnabled: false,
      serverless: {
        projectId: undefined,
      },
      isInTrial: () => false,
      trialDaysLeft: () => 0,
    });
    mockedAppContextService.getConfig.mockReturnValue({
      agentless: { enabled: false },
    } as any);
    // Mock both getDefaultFleetServerHost and get calls to return null
    mockedFleetServerHostService.getDefaultFleetServerHost = jest
      .fn()
      .mockResolvedValue(null as any);
    mockedFleetServerHostService.get.mockResolvedValue(null as any);
    soClient.create.mockResolvedValue({
      id: 'test-id',
      attributes: {},
    } as any);

    await createCloudFleetServerHostIfNeeded(soClient, esClient);

    expect(mockedFleetServerHostService.create).toBeCalledTimes(1);

    // Verify only default Fleet Server host creation
    expect(mockedFleetServerHostService.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        name: 'Default',
        host_urls: ['https://deployment-id-1.fleet.us-east-1.aws.found.io'],
        is_default: true,
        is_preconfigured: false,
      }),
      { id: 'fleet-default-fleet-server-host', overwrite: true, fromPreconfiguration: true }
    );
  });

  it('should not create agentless fleet server host if default already exists (ECH agentless is now handled via preconfiguration)', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    mockedAppContextService.getCloud.mockReturnValue({
      cloudId:
        'dXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRjZWM2ZjI2MWE3NGJmMjRjZTMzYmI4ODExYjg0Mjk0ZiRjNmMyY2E2ZDA0MjI0OWFmMGNjN2Q3YTllOTYyNTc0Mw==',
      isCloudEnabled: true,
      deploymentId: 'deployment-id-1',
      cloudHost: 'us-east-1.aws.found.io',
      apm: {},
      onboarding: {},
      isServerlessEnabled: false,
      serverless: {
        projectId: undefined,
      },
      isInTrial: () => false,
      trialDaysLeft: () => 0,
    });
    mockedAppContextService.getConfig.mockReturnValue({
      agentless: { enabled: true },
    } as any);
    // Default exists but agentless doesn't
    mockedFleetServerHostService.getDefaultFleetServerHost = jest
      .fn()
      .mockResolvedValue({ id: 'existing-default' } as any);
    mockedFleetServerHostService.get.mockResolvedValue(null as any);

    await createCloudFleetServerHostIfNeeded(soClient, esClient);

    // Should not create any Fleet Server hosts since default exists and ECH agentless is now handled via preconfiguration
    expect(mockedFleetServerHostService.create).toBeCalledTimes(0);
  });

  it('should not create any fleet server hosts if both already exist', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    mockedAppContextService.getCloud.mockReturnValue({
      cloudId:
        'dXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRjZWM2ZjI2MWE3NGJmMjRjZTMzYmI4ODExYjg0Mjk0ZiRjNmMyY2E2ZDA0MjI0OWFmMGNjN2Q3YTllOTYyNTc0Mw==',
      isCloudEnabled: true,
      deploymentId: 'deployment-id-1',
      cloudHost: 'us-east-1.aws.found.io',
      apm: {},
      onboarding: {},
      isServerlessEnabled: false,
      serverless: {
        projectId: undefined,
      },
      isInTrial: () => false,
      trialDaysLeft: () => 0,
    });
    mockedAppContextService.getConfig.mockReturnValue({
      agentless: { enabled: true },
    } as any);
    // Both exist
    mockedFleetServerHostService.getDefaultFleetServerHost = jest
      .fn()
      .mockResolvedValue({ id: 'existing-default' } as any);
    mockedFleetServerHostService.get.mockResolvedValue({ id: 'existing-agentless' } as any);

    await createCloudFleetServerHostIfNeeded(soClient, esClient);

    expect(mockedFleetServerHostService.create).not.toBeCalled();
  });

  it('should not create agentless fleet server host if default already exists but agentless is disabled', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    mockedAppContextService.getCloud.mockReturnValue({
      cloudId:
        'dXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRjZWM2ZjI2MWE3NGJmMjRjZTMzYmI4ODExYjg0Mjk0ZiRjNmMyY2E2ZDA0MjI0OWFmMGNjN2Q3YTllOTYyNTc0Mw==',
      isCloudEnabled: true,
      deploymentId: 'deployment-id-1',
      cloudHost: 'us-east-1.aws.found.io',
      apm: {},
      onboarding: {},
      isServerlessEnabled: false,
      serverless: {
        projectId: undefined,
      },
      isInTrial: () => false,
      trialDaysLeft: () => 0,
    });
    mockedAppContextService.getConfig.mockReturnValue({
      agentless: { enabled: false },
    } as any);
    // Default exists but agentless doesn't and agentless is disabled
    mockedFleetServerHostService.getDefaultFleetServerHost = jest
      .fn()
      .mockResolvedValue({ id: 'existing-default' } as any);
    mockedFleetServerHostService.get.mockResolvedValue(null as any);

    await createCloudFleetServerHostIfNeeded(soClient, esClient);

    expect(mockedFleetServerHostService.create).not.toBeCalled();
  });

  it('should not create agentless fleet server host in serverless environment', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    mockedAppContextService.getCloud.mockReturnValue({
      cloudId:
        'dXMtZWFzdC0xLmF3cy5mb3VuZC5pbyRjZWM2ZjI2MWE3NGJmMjRjZTMzYmI4ODExYjg0Mjk0ZiRjNmMyY2E2ZDA0MjI0OWFmMGNjN2Q3YTllOTYyNTc0Mw==',
      isCloudEnabled: true,
      deploymentId: 'deployment-id-1',
      cloudHost: 'us-east-1.aws.found.io',
      apm: {},
      onboarding: {},
      isServerlessEnabled: true,
      serverless: {
        projectId: 'project-123',
      },
      isInTrial: () => false,
      trialDaysLeft: () => 0,
    });
    mockedAppContextService.getConfig.mockReturnValue({
      agentless: { enabled: true },
    } as any);
    // Default exists but we're in serverless
    mockedFleetServerHostService.getDefaultFleetServerHost = jest
      .fn()
      .mockResolvedValue({ id: 'existing-default' } as any);
    mockedFleetServerHostService.get.mockResolvedValue(null as any);

    await createCloudFleetServerHostIfNeeded(soClient, esClient);

    expect(mockedFleetServerHostService.create).not.toBeCalled();
  });
});

describe('createOrUpdatePreconfiguredFleetServerHosts', () => {
  let secretHash: string;
  beforeEach(async () => {
    secretHash = await hashSecret('secretKey');
    mockedFleetServerHostService.bulkGet.mockResolvedValue([
      {
        id: 'fleet-123',
        name: 'TEST',
        is_default: true,
        host_urls: ['http://test.fr'],
      },
      {
        id: 'fleet-internal',
        name: 'TEST_INTERNAL',
        is_default: false,
        is_internal: false,
        host_urls: ['http://test-internal.fr'],
        is_preconfigured: true,
      },
      {
        id: 'fleet-with-secrets',
        name: 'TEST_SECRETS',
        is_default: false,
        is_internal: false,
        host_urls: ['http://test-internal.fr'],
        is_preconfigured: true,
        secrets: {
          ssl: {
            key: { id: 'test123', hash: secretHash },
          },
        },
      },
    ] as FleetServerHost[]);
  });
  afterEach(() => {
    mockedFleetServerHostService.bulkGet.mockReset();
    jest.resetAllMocks();
  });

  it('should create a preconfigured fleet server host that does not exist', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    await createOrUpdatePreconfiguredFleetServerHosts(soClient, esClient, [
      {
        id: 'new-fleet-server-host',
        name: 'TEST_1',
        is_default: false,
        is_internal: false,
        host_urls: ['http://test-internal.fr'],
        is_preconfigured: true,
      },
    ]);
    expect(mockedFleetServerHostService.bulkCreateForPreconfiguration).toBeCalledWith(
      expect.anything(),
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          name: 'TEST_1',
          id: 'new-fleet-server-host',
        }),
      ]),
      { fromPreconfiguration: true }
    );
    expect(mockedFleetServerHostService.create).not.toBeCalled();
    expect(mockedFleetServerHostService.update).not.toBeCalled();
  });

  it('should create a preconfigured fleet server host with secrets that does not exist', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    await createOrUpdatePreconfiguredFleetServerHosts(soClient, esClient, [
      {
        id: 'new-fleet-server-host',
        name: 'TEST_1',
        is_default: false,
        is_internal: false,
        host_urls: ['http://test-internal.fr'],
        is_preconfigured: true,
        secrets: {
          ssl: {
            key: 'unsecureKey1',
            es_key: 'unsecureKey2',
            agent_key: 'unsecureKey3',
          },
        },
      },
    ]);
    expect(mockedFleetServerHostService.bulkCreateForPreconfiguration).toBeCalledWith(
      expect.anything(),
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          name: 'TEST_1',
          secrets: {
            ssl: {
              key: 'unsecureKey1',
              es_key: 'unsecureKey2',
              agent_key: 'unsecureKey3',
            },
          },
        }),
      ]),
      { fromPreconfiguration: true }
    );
    expect(mockedFleetServerHostService.create).not.toBeCalled();
    expect(mockedFleetServerHostService.update).not.toBeCalled();
  });

  it('should update preconfigured fleet server hosts if is_internal flag changes', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    await createOrUpdatePreconfiguredFleetServerHosts(soClient, esClient, [
      {
        id: 'fleet-internal',
        name: 'TEST_INTERNAL',
        is_default: false,
        is_internal: true,
        host_urls: ['http://test-internal.fr'],
        is_preconfigured: true,
      },
    ]);

    expect(mockedFleetServerHostService.bulkCreateForPreconfiguration).not.toBeCalled();
    expect(mockedFleetServerHostService.update).toBeCalledWith(
      expect.anything(),
      expect.anything(),
      'fleet-internal',
      expect.objectContaining({
        is_internal: true,
      }),
      { fromPreconfiguration: true, secretHashes: {} }
    );
  });

  it('should update preconfigured fleet server hosts if host_urls change', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    await createOrUpdatePreconfiguredFleetServerHosts(soClient, esClient, [
      {
        id: 'fleet-internal',
        name: 'TEST_INTERNAL',
        is_default: false,
        is_internal: false,
        host_urls: ['http://test-internal.fr', 'http://test.fr'],
        is_preconfigured: true,
      },
    ]);

    expect(mockedFleetServerHostService.bulkCreateForPreconfiguration).not.toBeCalled();
    expect(mockedFleetServerHostService.update).toBeCalledWith(
      expect.anything(),
      expect.anything(),
      'fleet-internal',
      expect.objectContaining({
        host_urls: ['http://test-internal.fr', 'http://test.fr'],
      }),
      { fromPreconfiguration: true, secretHashes: {} }
    );
  });

  it('should update preconfigured fleet server hosts if proxy_id change', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    await createOrUpdatePreconfiguredFleetServerHosts(soClient, esClient, [
      {
        id: 'fleet-internal',
        name: 'TEST_INTERNAL',
        is_default: false,
        is_internal: false,
        host_urls: ['http://test-internal.fr'],
        is_preconfigured: true,
        proxy_id: 'proxy-test',
      },
    ]);

    expect(mockedFleetServerHostService.bulkCreateForPreconfiguration).not.toBeCalled();
    expect(mockedFleetServerHostService.update).toBeCalledWith(
      expect.anything(),
      expect.anything(),
      'fleet-internal',
      expect.objectContaining({
        proxy_id: 'proxy-test',
      }),
      { fromPreconfiguration: true, secretHashes: {} }
    );
  });

  it('should update preconfigured fleet server hosts if preconfigured host exists and changed to have ssl', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    await createOrUpdatePreconfiguredFleetServerHosts(soClient, esClient, [
      {
        id: 'fleet-internal',
        name: 'TEST_INTERNAL',
        is_default: false,
        is_internal: false,
        host_urls: ['http://test-internal.fr'],
        is_preconfigured: true,
        ssl: {
          key: 'unsecureKey1',
          es_key: 'unsecureKey2',
          agent_key: 'unsecureKey3',
        },
      },
    ]);

    expect(mockedFleetServerHostService.bulkCreateForPreconfiguration).not.toBeCalled();
    expect(mockedFleetServerHostService.update).toBeCalledWith(
      expect.anything(),
      expect.anything(),
      'fleet-internal',
      expect.objectContaining({
        ssl: {
          key: 'unsecureKey1',
          es_key: 'unsecureKey2',
          agent_key: 'unsecureKey3',
        },
      }),
      expect.anything()
    );
  });

  it('should update preconfigured fleet server hosts if preconfigured host exists and changed to have secrets', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    await createOrUpdatePreconfiguredFleetServerHosts(soClient, esClient, [
      {
        id: 'fleet-internal',
        name: 'TEST_INTERNAL',
        is_default: false,
        is_internal: false,
        host_urls: ['http://test-internal.fr'],
        is_preconfigured: true,
        secrets: {
          ssl: {
            key: 'unsecureKey1',
            es_key: 'unsecureKey2',
            agent_key: 'unsecureKey3',
          },
        },
      },
    ]);

    expect(mockedFleetServerHostService.bulkCreateForPreconfiguration).not.toBeCalled();
    expect(mockedFleetServerHostService.update).toBeCalledWith(
      expect.anything(),
      expect.anything(),
      'fleet-internal',
      expect.objectContaining({
        secrets: {
          ssl: {
            key: 'unsecureKey1',
            es_key: 'unsecureKey2',
            agent_key: 'unsecureKey3',
          },
        },
      }),
      expect.anything()
    );
  });
  it('should update preconfigured fleet server hosts if preconfigured host with secrets exists and changes', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    await createOrUpdatePreconfiguredFleetServerHosts(soClient, esClient, [
      {
        id: 'fleet-with-secrets',
        name: 'TEST_SECRETS',
        is_default: false,
        is_internal: false,
        host_urls: ['http://test-internal.fr'],
        is_preconfigured: true,
        secrets: {
          ssl: {
            key: 'secretKey',
            es_key: 'secretKey2',
            agent_key: 'secretKey3',
          },
        },
      },
    ]);

    expect(mockedFleetServerHostService.bulkCreateForPreconfiguration).not.toBeCalled();
    expect(mockedFleetServerHostService.update).toBeCalledWith(
      expect.anything(),
      expect.anything(),
      'fleet-with-secrets',
      expect.objectContaining({
        secrets: {
          ssl: {
            key: 'secretKey',
            es_key: 'secretKey2',
            agent_key: 'secretKey3',
          },
        },
      }),
      expect.anything()
    );
  });

  it('should not update preconfigured fleet server hosts if no fields changed', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    await createOrUpdatePreconfiguredFleetServerHosts(soClient, esClient, [
      {
        id: 'fleet-internal',
        name: 'TEST_INTERNAL',
        is_default: false,
        is_internal: false,
        host_urls: ['http://test-internal.fr'],
        is_preconfigured: true,
      },
    ]);
    expect(mockedFleetServerHostService.bulkCreateForPreconfiguration).not.toBeCalled();
    expect(mockedFleetServerHostService.update).not.toBeCalled();
  });

  it('should not update preconfigured fleet server hosts with secrets if no fields changed', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    await createOrUpdatePreconfiguredFleetServerHosts(soClient, esClient, [
      {
        id: 'fleet-with-secrets',
        name: 'TEST_SECRETS',
        is_default: false,
        is_internal: false,
        host_urls: ['http://test-internal.fr'],
        is_preconfigured: true,
        secrets: {
          ssl: {
            key: 'secretKey',
          },
        },
      },
    ]);
    expect(mockedFleetServerHostService.bulkCreateForPreconfiguration).not.toBeCalled();
    expect(mockedFleetServerHostService.update).not.toBeCalled();
  });

  it('should update when allow_edit changes (triggers diff)', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    // Existing host has no allow_edit; config now injects allow_edit: ['is_default']
    mockedFleetServerHostService.bulkGet.mockResolvedValue([
      {
        id: SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
        name: 'Default',
        is_default: true,
        host_urls: ['https://fleet.example.com'],
        is_preconfigured: true,
        // no allow_edit
      },
    ] as FleetServerHost[]);

    await createOrUpdatePreconfiguredFleetServerHosts(soClient, esClient, [
      {
        id: SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
        name: 'Default',
        is_default: true,
        host_urls: ['https://fleet.example.com'],
        is_preconfigured: true,
        allow_edit: ['is_default'],
      },
    ]);

    expect(mockedFleetServerHostService.update).toBeCalledWith(
      expect.anything(),
      expect.anything(),
      SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
      expect.objectContaining({ allow_edit: ['is_default'] }),
      expect.anything()
    );
  });

  it('should preserve allow_edit runtime value (is_default) from existing SO on sync', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    // Simulate: PrivateLink host was set as default at runtime (is_default: true in SO)
    mockedFleetServerHostService.bulkGet.mockResolvedValue([
      {
        id: SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID,
        name: 'Private Fleet Server',
        is_default: true, // set at runtime
        host_urls: ['https://private.fleet.example.com'],
        is_preconfigured: true,
        allow_edit: ['is_default'],
      },
    ] as FleetServerHost[]);

    // Config still says is_default: false (the preconfigured definition never changes)
    await createOrUpdatePreconfiguredFleetServerHosts(soClient, esClient, [
      {
        id: SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID,
        name: 'Private Fleet Server',
        is_default: false,
        host_urls: ['https://private.fleet.example.com'],
        is_preconfigured: true,
        allow_edit: ['is_default'],
      },
    ]);

    // No update should be triggered because nothing actually changed (is_default was preserved from SO)
    expect(mockedFleetServerHostService.update).not.toBeCalled();
  });
});

describe('cleanPreconfiguredFleetServerHosts', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should delete a preconfigured host removed from config (non-default)', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    mockedFleetServerHostService.list.mockResolvedValue({
      items: [
        {
          id: 'fleet-123',
          name: 'TEST',
          is_default: false,
          is_preconfigured: true,
          host_urls: ['http://test.fr'],
        },
      ],
      total: 1,
      page: 1,
      perPage: 10000,
    });

    // Pass empty array — fleet-123 has been removed from config
    await cleanPreconfiguredFleetServerHosts(soClient, esClient, []);

    expect(mockedFleetServerHostService.delete).toBeCalled();
    expect(mockedFleetServerHostService.delete).toBeCalledWith(
      expect.anything(),
      'fleet-123',
      expect.anything()
    );
  });

  it('should restore public default when PrivateLink host was default and is removed from config', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    mockedFleetServerHostService.list.mockResolvedValue({
      items: [
        {
          id: SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID,
          name: 'Private Fleet Server',
          is_default: true,
          is_preconfigured: true,
          host_urls: ['https://private.fleet.example.com'],
        },
      ],
      total: 1,
      page: 1,
      perPage: 10000,
    });

    // PrivateLink config entry removed — pass empty array
    await cleanPreconfiguredFleetServerHosts(soClient, esClient, []);

    // Should un-preconfigure the private host
    expect(mockedFleetServerHostService.update).toBeCalledWith(
      expect.anything(),
      expect.anything(),
      SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID,
      expect.objectContaining({ is_preconfigured: false }),
      { fromPreconfiguration: true }
    );

    // Should restore the public default
    expect(mockedFleetServerHostService.update).toBeCalledWith(
      expect.anything(),
      expect.anything(),
      SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
      { is_default: true },
      { fromPreconfiguration: true }
    );
  });

  it('should not restore public default when removed host was not the default', async () => {
    const soClient = savedObjectsClientMock.create();
    const esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

    mockedFleetServerHostService.list.mockResolvedValue({
      items: [
        {
          id: SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID,
          name: 'Private Fleet Server',
          is_default: false, // not the current default
          is_preconfigured: true,
          host_urls: ['https://private.fleet.example.com'],
        },
      ],
      total: 1,
      page: 1,
      perPage: 10000,
    });

    await cleanPreconfiguredFleetServerHosts(soClient, esClient, []);

    // Should delete (not un-preconfigure + restore), since it wasn't the default
    expect(mockedFleetServerHostService.delete).toBeCalled();
    expect(mockedFleetServerHostService.update).not.toBeCalled();
  });
});

describe('getPreconfiguredFleetServerHostFromConfig — PrivateLink allow_edit injection', () => {
  afterEach(() => {
    mockedAppContextService.getCloud.mockReset();
    mockedAppContextService.getConfig.mockReset();
  });

  it('should inject allow_edit: [is_default] on the serverless default Fleet Server host', () => {
    const config = {
      fleetServerHosts: [
        {
          id: SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
          name: 'Default',
          is_default: true,
          host_urls: ['https://fleet.example.com'],
        },
      ],
    };

    const res = getPreconfiguredFleetServerHostFromConfig(config);
    const defaultHost = res.find((h) => h.id === SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID);

    expect(defaultHost?.allow_edit).toContain('is_default');
  });

  it('should inject allow_edit: [is_default] on the PrivateLink Fleet Server host', () => {
    const config = {
      fleetServerHosts: [
        {
          id: SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID,
          name: 'Default',
          is_default: true,
          host_urls: ['https://fleet.example.com'],
        },
        {
          id: SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID,
          name: 'Private Fleet Server',
          is_default: false,
          is_internal: true,
          host_urls: ['https://private.fleet.example.com'],
        },
      ],
    };

    const res = getPreconfiguredFleetServerHostFromConfig(config);
    const privateHost = res.find((h) => h.id === SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID);

    expect(privateHost?.allow_edit).toContain('is_default');
  });

  it('should not inject allow_edit on non-PrivateLink hosts', () => {
    const config = {
      fleetServerHosts: [
        {
          id: 'fleet-123',
          name: 'TEST',
          is_default: true,
          host_urls: ['http://test.fr'],
        },
      ],
    };

    const res = getPreconfiguredFleetServerHostFromConfig(config);
    const host = res.find((h) => h.id === 'fleet-123');

    expect(host?.allow_edit).toBeUndefined();
  });
});
