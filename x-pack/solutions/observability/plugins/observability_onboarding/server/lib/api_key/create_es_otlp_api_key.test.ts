/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { createEsOtlpApiKey } from './create_es_otlp_api_key';
import { INDEX_OTLP_LOGS_METRICS_AND_TRACES } from './privileges';

const createMockEsClient = () => {
  const createApiKey = jest.fn().mockResolvedValue({ encoded: 'encoded-key' });
  return {
    client: { security: { createApiKey } } as unknown as ElasticsearchClient,
    createApiKey,
  };
};

describe('createEsOtlpApiKey', () => {
  it('creates an API key scoped to the Elasticsearch OTLP data stream patterns', async () => {
    const { client, createApiKey } = createMockEsClient();

    await createEsOtlpApiKey(client, 'onboarding-opentelemetry-api');

    expect(createApiKey).toHaveBeenCalledTimes(1);
    expect(createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          managed: true,
        },
        role_descriptors: {
          es_otlp: {
            cluster: [],
            indices: [INDEX_OTLP_LOGS_METRICS_AND_TRACES],
          },
        },
      })
    );
    await expect(createEsOtlpApiKey(client, 'onboarding-opentelemetry-api')).resolves.toEqual({
      encoded: 'encoded-key',
    });
  });
});
