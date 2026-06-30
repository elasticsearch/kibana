/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InferenceAPIConfigResponse } from '@kbn/ml-trained-models-utils';
import type { InferenceConnector, EisInferenceEndpointMetadata } from '@kbn/inference-common';
import { INFERENCE_CONNECTORS_INTERNAL_API_PATH } from '@kbn/inference-common';

/** Route path constants (const object so imported paths stay type-narrowed as `string`). */
export const APIRoutes = {
  GET_INFERENCE_ENDPOINTS: '/internal/inference_endpoints/endpoints',
  INFERENCE_ENDPOINT: '/internal/inference_endpoint/endpoints/{type}/{id}',
  GET_INFERENCE_SERVICES: 'internal/inference_endpoints/_inference/_services',
  GET_INFERENCE_SETTINGS: '/internal/search_inference_endpoints/settings',
  PUT_INFERENCE_SETTINGS: '/internal/search_inference_endpoints/settings',
  GET_INFERENCE_FEATURES: '/internal/search_inference_endpoints/features',
  GET_INFERENCE_CONNECTORS: INFERENCE_CONNECTORS_INTERNAL_API_PATH,
  // Single path shared by GET, PUT, and DELETE region policy operations
  REGION_POLICY: '/internal/search_inference_endpoints/region_policy',
} as const;

export interface InferenceConnectorsResponse {
  connectors: InferenceConnector[];
}

export interface SearchInferenceEndpointsConfigType {
  ui: {
    enabled: boolean;
  };
}

export interface InferenceEndpointSetting {
  id: string;
}

export interface InferenceFeatureSetting {
  feature_id: string;
  endpoints: InferenceEndpointSetting[];
}

export interface InferenceSettingsAttributes {
  features: InferenceFeatureSetting[];
}

export interface InferenceSettingsResponse {
  _meta: {
    id: string;
    createdAt?: string;
    updatedAt?: string;
  };
  data: InferenceSettingsAttributes;
  invalidEndpoints?: string[];
}

export interface InferenceFeaturesResponse {
  features: InferenceFeatureResponse[];
}

export interface InferenceFeatureResponse {
  featureId: string;
  parentFeatureId?: string;
  featureName: string;
  featureDescription: string;
  taskType: string;
  maxNumberOfEndpoints?: number;
  recommendedEndpoints: string[];
  isBeta?: boolean;
  isTechPreview?: boolean;
  ignoreGlobalDefault?: boolean;
  visibilityCondition?: {
    key: string;
    value: string | number | boolean | null;
  };
}

export type EisInferenceEndpoint = InferenceAPIConfigResponse & {
  service: 'elastic';
  service_settings: { model_id: string };
  metadata?: EisInferenceEndpointMetadata;
};

export type InferenceEndpointWithMetadata = EisInferenceEndpoint & {
  metadata: EisInferenceEndpointMetadata;
};

export type InferenceEndpointWithDisplayNameMetadata = InferenceEndpointWithMetadata & {
  metadata: {
    display: {
      name: string;
    };
  };
};

export type InferenceEndpointWithDisplayCreatorMetadata = InferenceEndpointWithMetadata & {
  metadata: {
    display: {
      model_creator: string;
    };
  };
};

export interface CspRegion {
  csp: string;
  region: string;
}

export interface RegionPolicyBody {
  allowed_regions?: CspRegion[];
  allowed_geos?: string[];
  fallback_region?: CspRegion;
}

export interface RegionPolicyResponse {
  region_policy: RegionPolicyBody;
  created_at: string;
  created_by?: string;
  updated_at?: string;
  updated_by?: string;
}

export enum EisModelStatus {
  Preview = 'preview',
  GA = 'ga',
  // metadata status is 'deprecated' OR the end_of_life_date is within the next 30 days
  Deprecated = 'deprecated',
  // The following status are purely for the UI and not directly received from EIS metadata
  // DeprecatedEOL is status: end_of_life_date in the past regardless of status value
  DeprecatedEOL = 'deprecated_eol',
  // Unknown is used when we either don't have a status value in the metadata
  // or we haven't updated our parsing for a new value
  Unknown = 'unknown',
}
