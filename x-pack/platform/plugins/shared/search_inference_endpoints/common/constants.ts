/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const PLUGIN_ID = 'searchInferenceEndpoints';
export const PLUGIN_NAME = 'Inference Endpoints';
export const INFERENCE_ENDPOINTS_APP_ID = 'inference_endpoints';
export const MODEL_SETTINGS_APP_ID = 'model_settings';
export const MANAGEMENT_APP_PATH = `/modelManagement/${MODEL_SETTINGS_APP_ID}`;

export const ELASTIC_INFERENCE_SERVICE_APP_ID = 'elastic_inference_service';

export const INFERENCE_PREFERENCES_FEATURE_FLAG_ID =
  'searchInferenceEndpoints:inferencePreferencesEnabled';

export const INFERENCE_CONNECTORS_QUERY_KEY = 'inferenceConnectorsQueryKey';
export const INFERENCE_ENDPOINTS_QUERY_KEY = 'inferenceEndpointsQueryKey';
export const INFERENCE_FEATURES_QUERY_KEY = 'inferenceFeaturesQueryKey';
export const TRAINED_MODEL_STATS_QUERY_KEY = 'trainedModelStats';
export const INFERENCE_SETTINGS_QUERY_KEY = 'inferenceSettingsQueryKey';

export const INFERENCE_SETTINGS_SO_TYPE = 'inference-settings';
export const INFERENCE_SETTINGS_NAMESPACE_TYPE = 'single';
export const INFERENCE_SETTINGS_ID = 'default';

export enum ROUTE_VERSIONS {
  v1 = '1',
}

export const DYNAMIC_CONNECTORS_POLLING_START_DELAY = 5000; // 5 seconds

export const NO_DEFAULT_MODEL = 'NO_DEFAULT_MODEL';

export const INFERENCE_UI_CAPABILITIES = {
  show: 'show',
  manage: 'manage',
} as const;
