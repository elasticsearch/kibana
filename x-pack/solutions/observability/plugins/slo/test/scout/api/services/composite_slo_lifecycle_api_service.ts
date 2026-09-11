/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiClientFixture, ApiClientResponse } from '@kbn/scout-oblt';
import type { CreateCompositeSLOInput } from '@kbn/slo-schema';

export interface CompositeSloLifecycleApi {
  create(compositeSlo: CreateCompositeSLOInput): Promise<ApiClientResponse>;
  deleteAll(): Promise<void>;
}

export function createCompositeSloLifecycleApi(
  apiClient: ApiClientFixture,
  authHeaders: Record<string, string>
): CompositeSloLifecycleApi {
  const jsonHeaders = { ...authHeaders, Accept: 'application/json' };

  return {
    create(compositeSlo: CreateCompositeSLOInput) {
      return apiClient.post('api/observability/slo_composites', {
        headers: jsonHeaders,
        body: compositeSlo,
        responseType: 'json',
      });
    },

    async deleteAll() {
      const response = await apiClient.get('api/observability/slo_composites?page=1&perPage=1000', {
        headers: jsonHeaders,
        responseType: 'json',
      });
      if (response.statusCode !== 200) {
        throw new Error(`deleteAll composite SLOs: find failed with ${response.statusCode}`);
      }
      const results = (response.body as { results?: Array<{ id: string }> }).results ?? [];
      for (const { id } of results) {
        const del = await apiClient.delete(`api/observability/slo_composites/${id}`, {
          headers: jsonHeaders,
          responseType: 'json',
        });
        if (del.statusCode !== 204) {
          throw new Error(`deleteAll composite SLOs: delete ${id} failed with ${del.statusCode}`);
        }
      }
    },
  };
}
