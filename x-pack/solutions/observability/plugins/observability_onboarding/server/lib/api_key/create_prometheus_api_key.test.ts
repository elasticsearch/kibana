/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { createPrometheusApiKey } from './create_prometheus_api_key';
import { INDEX_PROMETHEUS_REMOTE_WRITE } from './privileges';

const createMockEsClient = () => {
  const createApiKey = jest.fn().mockResolvedValue({ encoded: 'encoded-key' });
  return {
    client: { security: { createApiKey } } as unknown as ElasticsearchClient,
    createApiKey,
  };
};

describe('createPrometheusApiKey', () => {
  it('creates a managed metrics API key scoped to prometheus remote write indices', async () => {
    const { client, createApiKey } = createMockEsClient();

    await createPrometheusApiKey(client, 'onboarding-prometheus-api');

    expect(createApiKey).toHaveBeenCalledTimes(1);
    expect(createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          managed: true,
        },
        role_descriptors: {
          indices: {
            cluster: [],
            indices: [INDEX_PROMETHEUS_REMOTE_WRITE],
          },
        },
      })
    );
    await expect(createPrometheusApiKey(client, 'onboarding-prometheus-api')).resolves.toEqual({
      encoded: 'encoded-key',
    });
  });
});
