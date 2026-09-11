/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiClientFixture, ApiClientResponse } from '@kbn/scout-oblt';
import type { CreateSLOInput } from '@kbn/slo-schema';

/**
 * Worker-scoped SLO helpers bound to admin API key headers.
 * Use `apiServices.slo` in `beforeAll` / `afterAll` / `beforeEach` / `afterEach` for environment prep and cleanup.
 * For the HTTP call under test (especially RBAC), prefer `apiClient` + scoped credentials from `requestAuth`.
 */
export interface SloLifecycleApi {
  create(slo: CreateSLOInput): Promise<ApiClientResponse>;
  deleteAllSLOs(): Promise<void>;
}

export function createSloLifecycleApi(
  apiClient: ApiClientFixture,
  authHeaders: Record<string, string>
): SloLifecycleApi {
  const jsonHeaders = { ...authHeaders, Accept: 'application/json' };

  return {
    create(slo: CreateSLOInput) {
      return apiClient.post('api/observability/slos', {
        headers: jsonHeaders,
        body: slo,
        responseType: 'json',
      });
    },

    async deleteAllSLOs() {
      const response = await apiClient.get('api/observability/slos/_definitions', {
        headers: jsonHeaders,
        responseType: 'json',
      });
      if (response.statusCode !== 200) {
        throw new Error(`deleteAllSLOs: findDefinitions failed with ${response.statusCode}`);
      }
      const results = (response.body as { results?: Array<{ id: string }> }).results ?? [];
      for (const { id } of results) {
        const del = await apiClient.delete(`api/observability/slos/${id}`, {
          headers: jsonHeaders,
          responseType: 'json',
        });
        if (del.statusCode !== 204) {
          throw new Error(`deleteAllSLOs: delete ${id} failed with ${del.statusCode}`);
        }
      }
    },
  };
}
