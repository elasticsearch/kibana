/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { riskScorePreviewRoute } from './preview';
import type { EntityAnalyticsRoutesDeps } from '../../types';
import {
  deprecatedRiskScoreEntityCalculationRoute,
  riskScoreEntityCalculationRoute,
} from './entity_calculation';
import { riskScoreEntityCalculationRouteV2 } from './entity_calculation_v2';

export const registerRiskScoreRoutes = ({
  router,
  getStartServices,
  logger,
}: EntityAnalyticsRoutesDeps) => {
  riskScorePreviewRoute(router, logger);
  riskScoreEntityCalculationRoute(router, getStartServices, logger);
  deprecatedRiskScoreEntityCalculationRoute(router, getStartServices, logger);
  riskScoreEntityCalculationRouteV2(router, getStartServices, logger);
};
