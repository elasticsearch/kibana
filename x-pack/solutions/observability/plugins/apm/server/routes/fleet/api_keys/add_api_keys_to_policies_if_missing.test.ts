/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import { get } from 'lodash';
import {
  addApiKeysToPackagePolicyIfMissing,
  createAndInjectApiKeys,
} from './add_api_keys_to_policies_if_missing';
import {
  AGENT_CONFIG_API_KEY_PATH,
  SOURCE_MAP_API_KEY_PATH,
} from '../get_package_policy_decorators';

jest.mock('./create_apm_api_keys', () => ({
  createApmAgentConfigApiKey: jest.fn().mockResolvedValue('agent-key-id:agent-key-secret'),
  createApmSourceMapApiKey: jest.fn().mockResolvedValue('sourcemap-key-id:sourcemap-key-secret'),
}));

import { createApmAgentConfigApiKey, createApmSourceMapApiKey } from './create_apm_api_keys';

beforeEach(() => {
  jest.clearAllMocks();
});

const basePolicy = {
  id: 'test-policy-id',
  revision: 3,
  updated_at: '2024-01-01T00:00:00.000Z',
  updated_by: 'elastic',
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

const basePolicyWithKeys = {
  ...basePolicy,
  inputs: [
    {
      ...basePolicy.inputs[0],
      config: {
        'apm-server': {
          value: {
            agent: {
              config: {
                elasticsearch: { api_key: 'existing-agent-key-id:existing-agent-key-secret' },
              },
            },
            rum: {
              source_mapping: {
                elasticsearch: {
                  api_key: 'existing-sourcemap-key-id:existing-sourcemap-key-secret',
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
  const soClient = savedObjectsClientMock.create();
  const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn() } as any;
  const fleet = {
    packagePolicyService: {
      update: jest.fn().mockResolvedValue(basePolicy),
    },
  } as any;

  return { coreStart, soClient, logger, fleet };
}

describe('createAndInjectApiKeys', () => {
  it('sets both api key paths on the returned policy', async () => {
    const { coreStart, logger } = buildMocks();

    const result = await createAndInjectApiKeys({
      policy: basePolicy as any,
      packagePolicyId: 'test-policy-id',
      coreStart,
      logger,
    });

    expect(get(result, AGENT_CONFIG_API_KEY_PATH)).toBe('agent-key-id:agent-key-secret');
    expect(get(result, SOURCE_MAP_API_KEY_PATH)).toBe('sourcemap-key-id:sourcemap-key-secret');
  });

  it('creates both agent config and source map keys', async () => {
    const { coreStart, logger } = buildMocks();

    await createAndInjectApiKeys({
      policy: basePolicy as any,
      packagePolicyId: 'test-policy-id',
      coreStart,
      logger,
    });

    expect(createApmAgentConfigApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ packagePolicyId: 'test-policy-id' })
    );
    expect(createApmSourceMapApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ packagePolicyId: 'test-policy-id' })
    );
  });
});

describe('addApiKeysToPackagePolicyIfMissing', () => {
  it('skips key creation and update when the policy already has api keys', async () => {
    const { coreStart, soClient, logger, fleet } = buildMocks();

    await addApiKeysToPackagePolicyIfMissing({
      policy: basePolicyWithKeys as any,
      savedObjectsClient: soClient,
      coreStart,
      fleet,
      logger,
    });

    expect(createApmAgentConfigApiKey).not.toHaveBeenCalled();
    expect(createApmSourceMapApiKey).not.toHaveBeenCalled();
    expect(fleet.packagePolicyService.update).not.toHaveBeenCalled();
  });

  it('creates keys and saves the policy when keys are missing', async () => {
    const { coreStart, soClient, logger, fleet } = buildMocks();

    await addApiKeysToPackagePolicyIfMissing({
      policy: basePolicy as any,
      savedObjectsClient: soClient,
      coreStart,
      fleet,
      logger,
    });

    expect(createApmAgentConfigApiKey).toHaveBeenCalledTimes(1);
    expect(createApmSourceMapApiKey).toHaveBeenCalledTimes(1);
    expect(fleet.packagePolicyService.update).toHaveBeenCalledTimes(1);
  });

  it('strips id, revision, updated_at, updated_by before calling update', async () => {
    const { coreStart, soClient, logger, fleet } = buildMocks();

    await addApiKeysToPackagePolicyIfMissing({
      policy: basePolicy as any,
      savedObjectsClient: soClient,
      coreStart,
      fleet,
      logger,
    });

    const [, , policyId, policyForUpdate] = fleet.packagePolicyService.update.mock.calls[0];
    expect(policyId).toBe('test-policy-id');
    expect(policyForUpdate).not.toHaveProperty('id');
    expect(policyForUpdate).not.toHaveProperty('revision');
    expect(policyForUpdate).not.toHaveProperty('updated_at');
    expect(policyForUpdate).not.toHaveProperty('updated_by');
  });
});
