/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FeatureFlagsStart } from '@kbn/core/server';
import { STREAMS_SIGNIFICANT_EVENTS_SEMANTIC_CODE_SEARCH_GROUNDING_ENABLED_FLAG } from '../../../common/feature_flags';
import { isSignificantEventsSemanticCodeSearchGroundingEnabled } from './is_significant_events_semantic_code_search_grounding_enabled';

describe('isSignificantEventsSemanticCodeSearchGroundingEnabled', () => {
  it('reads the semantic code search grounding flag and defaults to false', () => {
    const getBooleanValue = jest.fn().mockReturnValue(false);
    const featureFlags = { getBooleanValue } as unknown as FeatureFlagsStart;

    expect(isSignificantEventsSemanticCodeSearchGroundingEnabled(featureFlags)).toBe(false);
    expect(getBooleanValue).toHaveBeenCalledWith(
      STREAMS_SIGNIFICANT_EVENTS_SEMANTIC_CODE_SEARCH_GROUNDING_ENABLED_FLAG,
      false
    );
  });

  it('returns true when the flag is enabled', () => {
    const featureFlags = {
      getBooleanValue: jest.fn().mockReturnValue(true),
    } as unknown as FeatureFlagsStart;

    expect(isSignificantEventsSemanticCodeSearchGroundingEnabled(featureFlags)).toBe(true);
  });
});
