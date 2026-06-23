/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { hasApiKeyPrivileges } from './has_api_key_privileges';
import { APM_EVENT_WRITE_APPLICATION, INDEX_OTLP_LOGS_METRICS_AND_TRACES } from './privileges';

const createMockEsClient = (hasAllRequested: boolean) => {
  const hasPrivileges = jest.fn().mockResolvedValue({ has_all_requested: hasAllRequested });
  return {
    client: { security: { hasPrivileges } } as unknown as ElasticsearchClient,
    hasPrivileges,
  };
};

describe('hasApiKeyPrivileges', () => {
  it('always requires manage_own_api_key so the user can create the key', async () => {
    const { client, hasPrivileges } = createMockEsClient(true);

    await hasApiKeyPrivileges(client, {});

    expect(hasPrivileges).toHaveBeenCalledWith({
      cluster: ['manage_own_api_key'],
      index: undefined,
      application: undefined,
    });
  });

  it('checks the Elasticsearch OTLP index privileges', async () => {
    const { client, hasPrivileges } = createMockEsClient(true);

    await hasApiKeyPrivileges(client, { index: [INDEX_OTLP_LOGS_METRICS_AND_TRACES] });

    expect(hasPrivileges).toHaveBeenCalledWith({
      cluster: ['manage_own_api_key'],
      index: [INDEX_OTLP_LOGS_METRICS_AND_TRACES],
      application: undefined,
    });
  });

  it('checks the managed OTLP application privilege', async () => {
    const { client, hasPrivileges } = createMockEsClient(true);

    await hasApiKeyPrivileges(client, { application: [APM_EVENT_WRITE_APPLICATION] });

    expect(hasPrivileges).toHaveBeenCalledWith({
      cluster: ['manage_own_api_key'],
      index: undefined,
      application: [APM_EVENT_WRITE_APPLICATION],
    });
  });

  it('returns true when all privileges are granted', async () => {
    const { client } = createMockEsClient(true);

    await expect(hasApiKeyPrivileges(client, {})).resolves.toBe(true);
  });

  it('returns false when privileges are missing', async () => {
    const { client } = createMockEsClient(false);

    await expect(hasApiKeyPrivileges(client, {})).resolves.toBe(false);
  });
});
