/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock, elasticsearchServiceMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import { get } from 'lodash';
import {
  onPackagePolicyCreate,
  onPackagePolicyUpdate,
  onPackagePolicyPostCreate,
} from './register_fleet_policy_callbacks';
import {
  AGENT_CONFIG_API_KEY_PATH,
  SOURCE_MAP_API_KEY_PATH,
} from './get_package_policy_decorators';

jest.mock('./merge_package_policy_with_apm', () => ({
  decoratePackagePolicyWithAgentConfigAndSourceMap: jest.fn(({ packagePolicy }) =>
    Promise.resolve(packagePolicy)
  ),
}));

jest.mock('../../lib/helpers/get_internal_saved_objects_client', () => ({
  getInternalSavedObjectsClient: jest.fn(),
}));

jest.mock('../../lib/helpers/create_es_client/create_internal_es_client', () => ({
  createInternalESClient: jest.fn().mockResolvedValue({}),
}));

jest.mock('./api_keys/add_api_keys_to_policies_if_missing', () => ({
  ...jest.requireActual('./api_keys/add_api_keys_to_policies_if_missing'),
  addApiKeysToPackagePolicyIfMissing: jest.fn().mockResolvedValue(undefined),
}));

import { getInternalSavedObjectsClient } from '../../lib/helpers/get_internal_saved_objects_client';
import { addApiKeysToPackagePolicyIfMissing } from './api_keys/add_api_keys_to_policies_if_missing';

beforeEach(() => {
  jest.clearAllMocks();
});

const newApmPackagePolicy = {
  name: 'apm-1',
  description: '',
  namespace: 'default',
  policy_ids: ['agent-policy-id'],
  enabled: true,
  inputs: [
    {
      policy_template: 'apmserver',
      streams: [],
      vars: {},
      type: 'apm',
      enabled: true,
      config: {
        'apm-server': {
          value: {},
        },
      },
    },
  ],
  package: { name: 'apm', title: 'Elastic APM', version: '9.4.1' },
};

const apmPackagePolicy = {
  id: 'test-policy-id',
  version: 'WzMxNDI2LDFd',
  name: 'apm-1',
  description: '',
  namespace: 'default',
  policy_ids: ['agent-policy-id'],
  enabled: true,
  inputs: [
    {
      policy_template: 'apmserver',
      streams: [],
      vars: {},
      type: 'apm',
      enabled: true,
      config: {
        'apm-server': {
          value: {},
        },
      },
    },
  ],
  package: { name: 'apm', title: 'Elastic APM', version: '9.4.1' },
  created_at: '2021-06-16T14:54:32.195Z',
  created_by: 'elastic',
};

const apmPackagePolicyWithKeys = {
  ...apmPackagePolicy,
  inputs: [
    {
      ...apmPackagePolicy.inputs[0],
      config: {
        'apm-server': {
          value: {
            agent: {
              config: { elasticsearch: { api_key: 'stored-agent-key-id:stored-agent-key-secret' } },
            },
            rum: {
              source_mapping: {
                elasticsearch: {
                  api_key: 'stored-sourcemap-key-id:stored-sourcemap-key-secret',
                },
              },
            },
          },
        },
      },
    },
  ],
};

function buildMocks() {
  const coreStart = coreMock.createStart();
  (coreStart.elasticsearch.client.asInternalUser.security.createApiKey as jest.Mock) = jest
    .fn()
    .mockResolvedValue({ id: 'new-key-id', api_key: 'new-key-secret' });

  const soClient = savedObjectsClientMock.create();
  const esClient = elasticsearchServiceMock.createElasticsearchClient();

  const fleetPluginStart = {
    packagePolicyService: {
      get: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  const getApmIndices = jest.fn().mockResolvedValue({});
  const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn() } as any;

  (getInternalSavedObjectsClient as jest.Mock).mockResolvedValue(soClient);

  return { coreStart, soClient, esClient, fleetPluginStart, getApmIndices, logger };
}

describe('onPackagePolicyCreate', () => {
  it('returns a non-apm policy unchanged', async () => {
    const { coreStart, soClient, esClient, fleetPluginStart, getApmIndices } = buildMocks();
    const nonApmPolicy = {
      ...apmPackagePolicy,
      package: { name: 'system', title: 'System', version: '1.0.0' },
    };

    const cb = onPackagePolicyCreate({ fleetPluginStart, getApmIndices, coreStart });
    const result = await cb(nonApmPolicy as any, soClient, esClient);

    expect(result).toBe(nonApmPolicy);
    expect(getApmIndices).not.toHaveBeenCalled();
  });

  it('decorates an apm policy with agent configurations and source maps', async () => {
    const { coreStart, soClient, esClient, fleetPluginStart, getApmIndices } = buildMocks();
    const { decoratePackagePolicyWithAgentConfigAndSourceMap } = jest.requireMock(
      './merge_package_policy_with_apm'
    );
    const decorated = { ...newApmPackagePolicy, _decorated: true };
    decoratePackagePolicyWithAgentConfigAndSourceMap.mockResolvedValueOnce(decorated);

    const cb = onPackagePolicyCreate({ fleetPluginStart, getApmIndices, coreStart });
    const result = await cb(newApmPackagePolicy as any, soClient, esClient);

    expect(decoratePackagePolicyWithAgentConfigAndSourceMap).toHaveBeenCalled();
    expect(result).toEqual(decorated);
    expect(get(result, AGENT_CONFIG_API_KEY_PATH)).toBeUndefined();
    expect(get(result, SOURCE_MAP_API_KEY_PATH)).toBeUndefined();
    expect(fleetPluginStart.packagePolicyService.get).not.toHaveBeenCalled();
  });
});

describe('onPackagePolicyUpdate', () => {
  it('returns a non-apm policy unchanged', async () => {
    const { coreStart, soClient, esClient, fleetPluginStart, getApmIndices, logger } = buildMocks();
    const nonApmPolicy = {
      ...apmPackagePolicy,
      package: { name: 'system', title: 'System', version: '1.0.0' },
    };

    const cb = onPackagePolicyUpdate({ fleetPluginStart, getApmIndices, coreStart, logger });
    const result = await cb(nonApmPolicy as any, soClient, esClient);

    expect(result).toBe(nonApmPolicy);
    expect(getApmIndices).not.toHaveBeenCalled();
  });

  it('preserves api keys from the stored policy when an update omits them', async () => {
    const { coreStart, soClient, esClient, fleetPluginStart, getApmIndices, logger } = buildMocks();
    fleetPluginStart.packagePolicyService.get.mockResolvedValue(apmPackagePolicyWithKeys);

    const cb = onPackagePolicyUpdate({ fleetPluginStart, getApmIndices, coreStart, logger });
    const result = await cb(apmPackagePolicy as any, soClient, esClient);

    expect(get(result, AGENT_CONFIG_API_KEY_PATH)).toBe(
      'stored-agent-key-id:stored-agent-key-secret'
    );
    expect(get(result, SOURCE_MAP_API_KEY_PATH)).toBe(
      'stored-sourcemap-key-id:stored-sourcemap-key-secret'
    );
    expect(
      coreStart.elasticsearch.client.asInternalUser.security.createApiKey
    ).not.toHaveBeenCalled();
  });

  it('creates new api keys when neither the incoming nor stored policy has them', async () => {
    const { coreStart, soClient, esClient, fleetPluginStart, getApmIndices, logger } = buildMocks();
    fleetPluginStart.packagePolicyService.get.mockResolvedValue(apmPackagePolicy);

    const cb = onPackagePolicyUpdate({ fleetPluginStart, getApmIndices, coreStart, logger });
    const result = await cb(apmPackagePolicy as any, soClient, esClient);

    expect(get(result, AGENT_CONFIG_API_KEY_PATH)).toBe('new-key-id:new-key-secret');
    expect(get(result, SOURCE_MAP_API_KEY_PATH)).toBe('new-key-id:new-key-secret');
    expect(
      coreStart.elasticsearch.client.asInternalUser.security.createApiKey
    ).toHaveBeenCalledTimes(2);
  });

  it('creates new api keys when the stored policy lookup throws', async () => {
    const { coreStart, soClient, esClient, fleetPluginStart, getApmIndices, logger } = buildMocks();
    fleetPluginStart.packagePolicyService.get.mockRejectedValue(new Error('SO not found'));

    const cb = onPackagePolicyUpdate({ fleetPluginStart, getApmIndices, coreStart, logger });
    const result = await cb(apmPackagePolicy as any, soClient, esClient);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('falling back to creating new keys')
    );
    expect(get(result, AGENT_CONFIG_API_KEY_PATH)).toBe('new-key-id:new-key-secret');
    expect(get(result, SOURCE_MAP_API_KEY_PATH)).toBe('new-key-id:new-key-secret');
    expect(
      coreStart.elasticsearch.client.asInternalUser.security.createApiKey
    ).toHaveBeenCalledTimes(2);
  });

  it('creates new api keys when the stored policy has only one key (partial pair)', async () => {
    const { coreStart, soClient, esClient, fleetPluginStart, getApmIndices, logger } = buildMocks();
    const partialKeyPolicy = {
      ...apmPackagePolicy,
      inputs: [
        {
          ...apmPackagePolicy.inputs[0],
          config: {
            'apm-server': {
              value: {
                agent: {
                  config: {
                    elasticsearch: { api_key: 'partial-agent-key-id:partial-agent-key-secret' },
                  },
                },
                // source map key intentionally absent
              },
            },
          },
        },
      ],
    };
    fleetPluginStart.packagePolicyService.get.mockResolvedValue(partialKeyPolicy);

    const cb = onPackagePolicyUpdate({ fleetPluginStart, getApmIndices, coreStart, logger });
    const result = await cb(apmPackagePolicy as any, soClient, esClient);

    expect(
      coreStart.elasticsearch.client.asInternalUser.security.createApiKey
    ).toHaveBeenCalledTimes(2);
    expect(get(result, AGENT_CONFIG_API_KEY_PATH)).toBe('new-key-id:new-key-secret');
    expect(get(result, SOURCE_MAP_API_KEY_PATH)).toBe('new-key-id:new-key-secret');
  });

  it('does not fetch the stored policy when the incoming policy already has api keys', async () => {
    const { coreStart, soClient, esClient, fleetPluginStart, getApmIndices, logger } = buildMocks();

    const cb = onPackagePolicyUpdate({ fleetPluginStart, getApmIndices, coreStart, logger });
    const result = await cb(apmPackagePolicyWithKeys as any, soClient, esClient);

    expect(get(result, AGENT_CONFIG_API_KEY_PATH)).toBe(
      'stored-agent-key-id:stored-agent-key-secret'
    );
    expect(fleetPluginStart.packagePolicyService.get).not.toHaveBeenCalled();
    expect(
      coreStart.elasticsearch.client.asInternalUser.security.createApiKey
    ).not.toHaveBeenCalled();
  });
});

describe('onPackagePolicyPostCreate', () => {
  it('injects api keys for apm policies', async () => {
    const { coreStart, soClient, esClient, fleetPluginStart } = buildMocks();
    const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn() } as any;

    const cb = onPackagePolicyPostCreate({ fleet: fleetPluginStart, coreStart, logger });
    await cb(apmPackagePolicy as any, soClient, esClient);

    expect(addApiKeysToPackagePolicyIfMissing).toHaveBeenCalledWith(
      expect.objectContaining({ policy: apmPackagePolicy })
    );
  });

  it('skips non-apm policies', async () => {
    const { coreStart, soClient, esClient, fleetPluginStart } = buildMocks();
    const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn() } as any;
    const nonApmPolicy = {
      ...apmPackagePolicy,
      package: { name: 'system', title: 'System', version: '1.0.0' },
    };

    const cb = onPackagePolicyPostCreate({ fleet: fleetPluginStart, coreStart, logger });
    await cb(nonApmPolicy as any, soClient, esClient);

    expect(addApiKeysToPackagePolicyIfMissing).not.toHaveBeenCalled();
  });
});
