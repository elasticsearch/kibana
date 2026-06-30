/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IUiSettingsClient } from '@kbn/core/server';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import { OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS } from '@kbn/management-settings-ids';
import type { SignificantEventsAvailabilityResponse } from '../../../common';
import {
  SIGNIFICANT_EVENTS_REQUIRED_PLUGINS,
  STREAMS_TIERED_SIGNIFICANT_EVENT_FEATURE,
  type SignificantEventsRequiredPlugin,
  type SignificantEventsUnavailableReason,
} from '../../../common';
import { isSignificantEventsAvailable } from '../../lib/feature_flags/is_significant_events_available';
import { FeatureNotEnabledError } from '../../lib/streams/errors/feature_not_enabled_error';
import { MissingDependencyError } from '../../lib/streams/errors/missing_dependency_error';
import type { StreamsServer } from '../../types';

interface SignificantEventsAccessContext {
  server: StreamsServer;
  licensing: LicensingPluginStart;
  uiSettingsClient: IUiSettingsClient;
}

/**
 * Resolves to the error to throw when the requirement is unmet, or `undefined`
 * when it is satisfied. The error is built lazily, so the happy path allocates
 * nothing.
 */
type RequirementCheck = (context: SignificantEventsAccessContext) => Promise<Error | undefined>;

// One "plugin must be present" requirement per entry in the shared list, so
// adding a required plugin there is the only change needed on the server.
const pluginRequirements = Object.fromEntries(
  SIGNIFICANT_EVENTS_REQUIRED_PLUGINS.map(
    (plugin): [SignificantEventsRequiredPlugin, RequirementCheck] => [
      plugin,
      async ({ server }) =>
        server[plugin]
          ? undefined
          : new MissingDependencyError(
              `Significant events requires the "${plugin}" plugin to be enabled first.`
            ),
    ]
  )
) as Record<SignificantEventsRequiredPlugin, RequirementCheck>;

/**
 * The single source of truth for everything that must be true for significant
 * events to work. Keying by reason makes this exhaustive: TypeScript errors if
 * any `SignificantEventsUnavailableReason` lacks a check here. The declaration
 * order is the evaluation order: it only decides which reason surfaces first
 * when several are unmet, so the Technical Preview feature flag is checked first
 * as the outermost gate, then cheaper / more-likely-to-fail gates (pricing tier,
 * license) before plugin presence.
 */
const significantEventsRequirements: Record<SignificantEventsUnavailableReason, RequirementCheck> =
  {
    feature_flag: async ({ server }) =>
      (await isSignificantEventsAvailable(server.core.featureFlags))
        ? undefined
        : new FeatureNotEnabledError('Significant events is not available in this environment.'),
    pricing_tier: async ({ server }) =>
      server.core.pricing.isFeatureAvailable(STREAMS_TIERED_SIGNIFICANT_EVENT_FEATURE.id)
        ? undefined
        : new FeatureNotEnabledError(
            'Significant events is not available on the current pricing tier.'
          ),
    license: async ({ licensing }) =>
      (await licensing.getLicense()).hasAtLeast('enterprise')
        ? undefined
        : new FeatureNotEnabledError(
            'An Enterprise license or higher is required to use significant events.'
          ),
    ui_setting: async ({ uiSettingsClient }) =>
      (await uiSettingsClient.get<boolean>(OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS))
        ? undefined
        : new FeatureNotEnabledError(
            `Significant events is disabled. Enable "${OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS}" in Advanced Settings to start using it.`
          ),
    ...pluginRequirements,
  };

/**
 * Evaluates every requirement in parallel and returns the first unmet one (in
 * declaration order), or `undefined` when significant events is fully available.
 *
 * Parallel (rather than sequential short-circuit) is deliberate: only the
 * license and UI-setting checks are async, and the common "available" path has
 * to run all checks anyway, so parallel keeps that hot path at the latency of
 * the single slowest check instead of summing them.
 */
const findFirstUnmetRequirement = async (context: SignificantEventsAccessContext) => {
  // `Object.entries` widens keys to `string`; the keys are exactly the reasons.
  const entries = Object.entries(significantEventsRequirements) as Array<
    [SignificantEventsUnavailableReason, RequirementCheck]
  >;

  const results = await Promise.all(
    entries.map(async ([reason, check]) => ({ reason, error: await check(context) }))
  );

  for (const { reason, error } of results) {
    if (error) {
      return { reason, error };
    }
  }

  return undefined;
};

/**
 * Asserts that every significant events requirement is met. Throws the
 * requirement-specific error for the first unmet requirement (preserving its
 * error type/status code).
 */
export async function assertSignificantEventsAccess(
  context: SignificantEventsAccessContext
): Promise<void> {
  const unmet = await findFirstUnmetRequirement(context);
  if (unmet) {
    throw unmet.error;
  }
}

/**
 * Resolves significant events availability without throwing, returning the id
 * of the first unmet requirement. Used by the availability endpoint the UI calls.
 */
export async function getSignificantEventsAvailability(
  context: SignificantEventsAccessContext
): Promise<SignificantEventsAvailabilityResponse> {
  const unmet = await findFirstUnmetRequirement(context);
  return unmet ? { available: false, reason: unmet.reason } : { available: true };
}
