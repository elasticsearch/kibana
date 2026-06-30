/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FeatureFlagsStart } from '@kbn/core/server';
import { STREAMS_SIGNIFICANT_EVENTS_AVAILABLE_FLAG } from '../../../common/feature_flags';
import { isSignificantEventsAvailable } from './is_significant_events_available';

describe('isSignificantEventsAvailable', () => {
  it('reads the significant events availability flag and defaults to false', async () => {
    const getBooleanValue = jest.fn().mockResolvedValue(false);
    const featureFlags = { getBooleanValue } as unknown as FeatureFlagsStart;

    await expect(isSignificantEventsAvailable(featureFlags)).resolves.toBe(false);
    expect(getBooleanValue).toHaveBeenCalledWith(STREAMS_SIGNIFICANT_EVENTS_AVAILABLE_FLAG, false);
  });

  it('returns true when the flag is enabled', async () => {
    const featureFlags = {
      getBooleanValue: jest.fn().mockResolvedValue(true),
    } as unknown as FeatureFlagsStart;

    await expect(isSignificantEventsAvailable(featureFlags)).resolves.toBe(true);
  });
});
