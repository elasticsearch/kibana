/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type { Logger } from '@kbn/logging';
import type { ToolAvailabilityResult } from '@kbn/agent-builder-server';
import type { ExperimentalFeatures } from '../../../../../common';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../../../plugin_contract';
import { getAgentBuilderResourceAvailability } from '../../../utils/get_agent_builder_resource_availability';

/**
 * Shared availability check for all watchlist tools.
 * Gates on: security/classic space, entityAnalyticsWatchlistEnabled FF, and Platinum license
 * (matching the minimum license required by the watchlist API routes). Pass
 * `requireEntityStoreV2` for tools that also depend on the entity store v2 FF
 * (e.g. anything that syncs watchlist membership onto entity records).
 *
 * Note: per-user RBAC stays in each tool's handler — agent-builder availability
 * is not meant to replace it (see ToolAvailabilityConfig in @kbn/agent-builder-server).
 */
export const getWatchlistToolAvailability = async ({
  core,
  request,
  logger,
  experimentalFeatures,
  requireEntityStoreV2 = false,
}: {
  core: SecuritySolutionPluginCoreSetupDependencies;
  request: KibanaRequest;
  logger: Logger;
  experimentalFeatures: ExperimentalFeatures;
  requireEntityStoreV2?: boolean;
}): Promise<ToolAvailabilityResult> => {
  const spaceAvailability = await getAgentBuilderResourceAvailability({ core, request, logger });
  if (spaceAvailability.status !== 'available') {
    return spaceAvailability;
  }

  if (!experimentalFeatures.entityAnalyticsWatchlistEnabled) {
    return { status: 'unavailable', reason: 'Entity Analytics watchlists are not enabled.' };
  }

  if (requireEntityStoreV2 && !experimentalFeatures.entityAnalyticsEntityStoreV2) {
    return {
      status: 'unavailable',
      reason:
        'Entity Store V2 is not enabled (required to sync watchlist membership onto entity records).',
    };
  }

  const [, startPlugins] = await core.getStartServices();
  const license = await startPlugins.licensing.getLicense();
  if (!license.hasAtLeast('platinum')) {
    return {
      status: 'unavailable',
      reason: 'Entity Analytics watchlists require a Platinum license or above.',
    };
  }

  return { status: 'available' };
};
