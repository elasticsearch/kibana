/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { COMPUTED_FEATURE_TYPES, INFERRED_FEATURE_TYPES } from '@kbn/significant-events-schema';
import {
  createGetFeatureQueryFromToolArgs,
  createGetFeatureTypesFromToolArgs,
  resolveFeatureTypeFilters,
  toFeatureForLlmContext,
  type GetStreamFeaturesInput,
  type GetStreamFeaturesQuery,
  type LlmFeature,
} from '../../features/tool';

export const SIGNIFICANT_EVENTS_FEATURE_TOOL_TYPES = [
  ...INFERRED_FEATURE_TYPES,
  ...COMPUTED_FEATURE_TYPES,
] as const;

export type SignificantEventsFeatureToolType =
  (typeof SIGNIFICANT_EVENTS_FEATURE_TOOL_TYPES)[number];

export const getFeatureTypesFromToolArgs = createGetFeatureTypesFromToolArgs(
  SIGNIFICANT_EVENTS_FEATURE_TOOL_TYPES
);

export const getFeatureQueryFromToolArgs = createGetFeatureQueryFromToolArgs(
  SIGNIFICANT_EVENTS_FEATURE_TOOL_TYPES
);

export { resolveFeatureTypeFilters, toFeatureForLlmContext };
export type { GetStreamFeaturesInput, GetStreamFeaturesQuery, LlmFeature };
