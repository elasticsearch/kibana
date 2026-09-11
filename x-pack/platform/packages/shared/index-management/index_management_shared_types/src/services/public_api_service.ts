/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  EnrichPolicyType,
  IndicesDataStreamLifecycle,
  IndicesSimulateTemplateResponse,
} from '@elastic/elasticsearch/lib/api/types';
import type { SendRequestResponse } from '../types';
import type { GetIndexTemplatesResponse } from '../index_templates';

export interface SerializedEnrichPolicy {
  type: EnrichPolicyType;
  name: string;
  sourceIndices: string[];
  matchField: string;
  enrichFields: string[];
  query?: Record<string, any>;
}

export type SimulateIndexTemplateResponse = Omit<IndicesSimulateTemplateResponse, 'template'> & {
  template: IndicesSimulateTemplateResponse['template'] & {
    lifecycle?: IndicesDataStreamLifecycle;
  };
};

export interface PublicApiServiceSetup {
  getAllEnrichPolicies(): Promise<SendRequestResponse<SerializedEnrichPolicy[]>>;
  /**
   * Fetches composable and legacy index templates as returned by Index Management's
   * `GET /api/index_management/index_templates` endpoint.
   */
  getIndexTemplates(options?: { signal?: AbortSignal }): Promise<GetIndexTemplatesResponse>;
  /**
   * Simulates an index template by name using the
   * `POST /api/index_management/index_templates/simulate/{templateName}` endpoint.
   * Returns the resolved template configuration that would be applied to matching indices.
   */
  simulateIndexTemplate(options: {
    templateName: string;
    signal?: AbortSignal;
  }): Promise<SimulateIndexTemplateResponse>;
}
