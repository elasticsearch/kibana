/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApplicationStart } from '@kbn/core/public';
import type { CloudStart } from '@kbn/cloud-plugin/public';
import type { ConfigProperties } from './dynamic_config/types';

interface ConfigEntry extends ConfigProperties {
  key: string;
}

export * from './dynamic_config/types';

export type Map = Record<string, string>;

export interface ConfigEntryView extends ConfigEntry {
  isValid: boolean;
  validationErrors: string[];
  value: string | number | boolean | null | Map;
}

export type { FieldsConfiguration, InferenceProvider } from '@kbn/inference-common';
export { INFERENCE_ENDPOINT_INTERNAL_API_VERSION } from '@kbn/inference-common';

interface AdaptiveAllocations {
  max_number_of_allocations?: number;
  [key: string]: unknown;
}

interface ProviderConfig {
  adaptive_allocations?: AdaptiveAllocations;
  max_number_of_allocations?: number;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export interface Config {
  taskType: string;
  taskTypeConfig?: Record<string, unknown>;
  inferenceId: string;
  provider: string;
  providerConfig?: ProviderConfig;
  contextWindowLength?: number;
  temperature?: number;
  headers?: Map;
}

export interface Secrets {
  providerSecrets?: Record<string, unknown>;
}

export interface InferenceEndpoint {
  config: Config;
  secrets: Secrets;
}

// Helper function to check if an object is a Record<string, string> - supports custom headers
export function isMapWithStringValues(value: unknown): value is Map {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((v) => typeof v === 'string')
  );
}

export interface InferenceEndpointUiCommonPluginStartDependencies {
  application: ApplicationStart;
  cloud?: CloudStart;
}
