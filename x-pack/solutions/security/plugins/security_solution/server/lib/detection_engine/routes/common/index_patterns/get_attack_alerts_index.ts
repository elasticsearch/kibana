/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ATTACK_DISCOVERY_ALERTS_COMMON_INDEX_PREFIX,
  ATTACK_DISCOVERY_ADHOC_ALERTS_COMMON_INDEX_PREFIX,
} from '@kbn/elastic-assistant-common';

import type { SecuritySolutionRequestHandlerContext } from '../../../../../types';

/**
 * Builds the index pattern targeted by the attacks routes: scheduled and adhoc
 * attack discovery alerts for the active space.
 */
export const getAttackAlertsIndex = async ({
  context,
}: {
  context: SecuritySolutionRequestHandlerContext;
}): Promise<string[]> => {
  const spaceId = (await context.securitySolution).getSpaceId();

  return [
    `${ATTACK_DISCOVERY_ALERTS_COMMON_INDEX_PREFIX}-${spaceId}`, // Scheduled attack alerts
    `${ATTACK_DISCOVERY_ADHOC_ALERTS_COMMON_INDEX_PREFIX}-${spaceId}`, // Adhoc attack alerts
  ];
};
