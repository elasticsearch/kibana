/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { createManagedOtlpServiceApiKey } from './create_managed_otlp_service_api_key';
import { APM_EVENT_WRITE_APPLICATION } from './privileges';

const createMockEsClient = () => {
  const createApiKey = jest.fn().mockResolvedValue({ encoded: 'encoded-key' });
  return {
    client: { security: { createApiKey } } as unknown as ElasticsearchClient,
    createApiKey,
  };
};

describe('createManagedOtlpServiceApiKey', () => {
  it('creates a managed API key scoped to the APM event:write application privilege', async () => {
    const { client, createApiKey } = createMockEsClient();

    await createManagedOtlpServiceApiKey(client, 'onboarding-opentelemetry-api');

    expect(createApiKey).toHaveBeenCalledTimes(1);
    expect(createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          managed: true,
        },
        role_descriptors: {
          apm_writer: {
            cluster: [],
            index: [],
            applications: [APM_EVENT_WRITE_APPLICATION],
          },
        },
      })
    );
    await expect(
      createManagedOtlpServiceApiKey(client, 'onboarding-opentelemetry-api')
    ).resolves.toEqual({
      encoded: 'encoded-key',
    });
  });
});
