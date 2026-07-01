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
 * Shared availability check for all lead tools.
 * Gates on: security/classic space, leadGenerationEnabled FF, and Enterprise license
 * (matching the minimum license required by the lead generation API routes).
 */
export const getLeadToolAvailability = async ({
  core,
  request,
  logger,
  experimentalFeatures,
}: {
  core: SecuritySolutionPluginCoreSetupDependencies;
  request: KibanaRequest;
  logger: Logger;
  experimentalFeatures: ExperimentalFeatures;
}): Promise<ToolAvailabilityResult> => {
  const spaceAvailability = await getAgentBuilderResourceAvailability({ core, request, logger });
  if (spaceAvailability.status !== 'available') {
    return spaceAvailability;
  }

  if (!experimentalFeatures.leadGenerationEnabled) {
    return { status: 'unavailable', reason: 'Lead generation is not enabled.' };
  }

  const [, startPlugins] = await core.getStartServices();
  const license = await startPlugins.licensing.getLicense();
  if (!license.hasAtLeast('enterprise')) {
    return {
      status: 'unavailable',
      reason: 'Entity Analytics lead generation requires an Enterprise license.',
    };
  }

  return { status: 'available' };
};
