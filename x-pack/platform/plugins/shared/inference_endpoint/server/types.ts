/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { InferenceProvider } from '@kbn/inference-common';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface InferenceEndpointPluginSetup {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface InferenceEndpointPluginStart {}

export interface InferenceServicesGetResponse {
  endpoints: InferenceProvider[];
}
