/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FeatureNotEnabledError } from '../../lib/streams/errors/feature_not_enabled_error';
import { MissingDependencyError } from '../../lib/streams/errors/missing_dependency_error';
import {
  assertSignificantEventsAccess,
  getSignificantEventsAvailability,
} from './assert_significant_events_access';

interface ContextOverrides {
  featureFlagAvailable?: boolean;
  tierAvailable?: boolean;
  hasEnterpriseLicense?: boolean;
  uiSettingEnabled?: boolean;
  workflowsExtensionsPlugin?: boolean;
  workflowsManagementPlugin?: boolean;
  inferencePlugin?: boolean;
  agentBuilderPlugin?: boolean;
}

const buildArgs = (overrides: ContextOverrides = {}) => {
  const {
    featureFlagAvailable = true,
    tierAvailable = true,
    hasEnterpriseLicense = true,
    uiSettingEnabled = true,
    workflowsExtensionsPlugin = true,
    workflowsManagementPlugin = true,
    inferencePlugin = true,
    agentBuilderPlugin = true,
  } = overrides;

  const server = {
    core: {
      featureFlags: { getBooleanValue: jest.fn().mockResolvedValue(featureFlagAvailable) },
      pricing: { isFeatureAvailable: jest.fn().mockReturnValue(tierAvailable) },
    },
    workflowsExtensions: workflowsExtensionsPlugin ? {} : undefined,
    workflowsManagement: workflowsManagementPlugin ? {} : undefined,
    searchInferenceEndpoints: inferencePlugin ? {} : undefined,
    agentBuilder: agentBuilderPlugin ? {} : undefined,
  };

  const licensing = {
    getLicense: jest
      .fn()
      .mockResolvedValue({ hasAtLeast: jest.fn().mockReturnValue(hasEnterpriseLicense) }),
  };

  const uiSettingsClient = { get: jest.fn().mockResolvedValue(uiSettingEnabled) };

  return {
    server,
    licensing,
    uiSettingsClient,
  } as unknown as Parameters<typeof assertSignificantEventsAccess>[0];
};

describe('assertSignificantEventsAccess', () => {
  it('resolves when all requirements are met', async () => {
    await expect(assertSignificantEventsAccess(buildArgs())).resolves.toBeUndefined();
  });

  it('throws a FeatureNotEnabledError (403) when the feature flag is disabled', async () => {
    await expect(
      assertSignificantEventsAccess(buildArgs({ featureFlagAvailable: false }))
    ).rejects.toBeInstanceOf(FeatureNotEnabledError);
  });

  it('fails closed (denies access) when the feature flag read rejects', async () => {
    const args = buildArgs();
    const { getBooleanValue } = (
      args as unknown as {
        server: { core: { featureFlags: { getBooleanValue: jest.Mock } } };
      }
    ).server.core.featureFlags;
    getBooleanValue.mockRejectedValue(new Error('feature flag provider unavailable'));

    await expect(assertSignificantEventsAccess(args)).rejects.toThrow(
      'feature flag provider unavailable'
    );
  });

  it('throws a FeatureNotEnabledError (403) when the pricing tier is unavailable', async () => {
    await expect(
      assertSignificantEventsAccess(buildArgs({ tierAvailable: false }))
    ).rejects.toBeInstanceOf(FeatureNotEnabledError);
  });

  it('throws a FeatureNotEnabledError (403) when the license is insufficient', async () => {
    await expect(
      assertSignificantEventsAccess(buildArgs({ hasEnterpriseLicense: false }))
    ).rejects.toBeInstanceOf(FeatureNotEnabledError);
  });

  it('throws a FeatureNotEnabledError (403) when the UI setting is disabled', async () => {
    await expect(
      assertSignificantEventsAccess(buildArgs({ uiSettingEnabled: false }))
    ).rejects.toBeInstanceOf(FeatureNotEnabledError);
  });

  it('throws a MissingDependencyError (409) when workflows extensions is unavailable', async () => {
    await expect(
      assertSignificantEventsAccess(buildArgs({ workflowsExtensionsPlugin: false }))
    ).rejects.toBeInstanceOf(MissingDependencyError);
  });

  it('throws a MissingDependencyError (409) when workflows management is unavailable', async () => {
    await expect(
      assertSignificantEventsAccess(buildArgs({ workflowsManagementPlugin: false }))
    ).rejects.toBeInstanceOf(MissingDependencyError);
  });

  it('throws a MissingDependencyError (409) when inference endpoints are unavailable', async () => {
    await expect(
      assertSignificantEventsAccess(buildArgs({ inferencePlugin: false }))
    ).rejects.toBeInstanceOf(MissingDependencyError);
  });

  it('throws a MissingDependencyError (409) when agent builder is unavailable', async () => {
    await expect(
      assertSignificantEventsAccess(buildArgs({ agentBuilderPlugin: false }))
    ).rejects.toBeInstanceOf(MissingDependencyError);
  });
});

describe('getSignificantEventsAvailability', () => {
  it('reports available when all requirements are met', async () => {
    await expect(getSignificantEventsAvailability(buildArgs())).resolves.toEqual({
      available: true,
    });
  });

  it('returns the unmet reason id', async () => {
    await expect(
      getSignificantEventsAvailability(buildArgs({ inferencePlugin: false }))
    ).resolves.toEqual({ available: false, reason: 'searchInferenceEndpoints' });
  });

  it('returns the feature_flag reason when the flag is off', async () => {
    await expect(
      getSignificantEventsAvailability(buildArgs({ featureFlagAvailable: false }))
    ).resolves.toEqual({ available: false, reason: 'feature_flag' });
  });

  it('returns feature_flag first as the outermost gate (before pricing_tier)', async () => {
    await expect(
      getSignificantEventsAvailability(
        buildArgs({ featureFlagAvailable: false, tierAvailable: false })
      )
    ).resolves.toEqual({ available: false, reason: 'feature_flag' });
  });

  it('returns the first unmet reason in registry order (tier before license)', async () => {
    await expect(
      getSignificantEventsAvailability(
        buildArgs({ tierAvailable: false, hasEnterpriseLicense: false })
      )
    ).resolves.toEqual({ available: false, reason: 'pricing_tier' });
  });
});
