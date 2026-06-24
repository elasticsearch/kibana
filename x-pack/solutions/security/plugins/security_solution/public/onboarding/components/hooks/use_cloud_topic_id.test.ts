/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CloudDataAttributes } from '@kbn/cloud-plugin/common/types';
import { isSiemMigrationsCloudOnboarding } from './use_cloud_topic_id';

const createCloudData = (
  security: CloudDataAttributes['onboardingData']['security']
): CloudDataAttributes => ({
  onboardingData: {
    token: 'security',
    security,
  },
});

describe('isSiemMigrationsCloudOnboarding', () => {
  it('returns true for SIEM Splunk migration onboarding', () => {
    expect(
      isSiemMigrationsCloudOnboarding(
        createCloudData({
          useCase: 'siem',
          migration: { value: true, type: 'splunk' },
        })
      )
    ).toBe(true);
  });

  it('returns true for SIEM non-Splunk migration onboarding', () => {
    expect(
      isSiemMigrationsCloudOnboarding(
        createCloudData({
          useCase: 'siem',
          migration: { value: true, type: 'other' },
        })
      )
    ).toBe(true);
  });

  it('returns false when migration is disabled', () => {
    expect(
      isSiemMigrationsCloudOnboarding(
        createCloudData({
          useCase: 'siem',
          migration: { value: false },
        })
      )
    ).toBe(false);
  });

  it('returns false when cloud data is absent', () => {
    expect(isSiemMigrationsCloudOnboarding(null)).toBe(false);
  });
});
