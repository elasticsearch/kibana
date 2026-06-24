/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FeatureFlagsStart } from '@kbn/core/server';
import { STREAMS_SIGNIFICANT_EVENTS_SEMANTIC_CODE_SEARCH_GROUNDING_ENABLED_FLAG } from '../../../common/feature_flags';

export const isSignificantEventsSemanticCodeSearchGroundingEnabled = (
  featureFlags: FeatureFlagsStart
) =>
  featureFlags.getBooleanValue(
    STREAMS_SIGNIFICANT_EVENTS_SEMANTIC_CODE_SEARCH_GROUNDING_ENABLED_FLAG,
    false
  );
