/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRuleDataClient } from '@kbn/rule-registry-plugin/server';

import type { SecuritySolutionRequestHandlerContext } from '../../../../../types';
import { getAttackAlertsIndex } from './get_attack_alerts_index';

/**
 * Builds the index pattern targeted by the unified alerts routes: detection
 * alerts (when available) plus scheduled and adhoc attack discovery alerts for
 * the active space.
 */
export const getUnifiedAlertsIndex = async ({
  context,
  ruleDataClient,
}: {
  context: SecuritySolutionRequestHandlerContext;
  ruleDataClient: IRuleDataClient | null;
}): Promise<string[]> => {
  const spaceId = (await context.securitySolution).getSpaceId();
  const detectionAlertsIndex = ruleDataClient?.indexNameWithNamespace(spaceId);

  return [
    ...(detectionAlertsIndex ? [detectionAlertsIndex] : []), // Detection alerts
    ...(await getAttackAlertsIndex({ context })), // Scheduled + adhoc attack alerts
  ];
};
