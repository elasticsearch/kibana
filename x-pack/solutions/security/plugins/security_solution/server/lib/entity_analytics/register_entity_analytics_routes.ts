/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { registerAssetCriticalityRoutes } from './asset_criticality/routes';
import { registerRiskScoreRoutes } from './risk_score/routes';
import { registerRiskEngineRoutes } from './risk_engine/routes';
import type { EntityAnalyticsRoutesDeps } from './types';
import { registerEntityStoreRoutes } from './entity_store/routes';
import { registerPrivilegeMonitoringRoutes } from './privilege_monitoring/routes/register_privilege_monitoring_routes';
import { registerMigrationsRoutes } from './migrations/routes';
import { registerEntityDetailsRoutes } from './entity_details/routes';
import { registerLeadGenerationRoutes } from './lead_generation/routes/register_lead_generation_routes';
import { registerWatchlistRoutes } from './watchlists/register_watchlist_routes';
import { registerEntityResolutionRoutes } from './entity_resolution/routes/register_entity_resolution_routes';
import { registerAnomalySummaryRoutes } from './anomaly_summary';
import { registerRiskScoreHistoryRoute } from './risk_score/routes/register_risk_score_history_route';

export const registerEntityAnalyticsRoutes = (routeDeps: EntityAnalyticsRoutesDeps) => {
  registerAssetCriticalityRoutes(routeDeps);
  registerRiskScoreRoutes(routeDeps);
  registerRiskEngineRoutes(routeDeps);
  registerMigrationsRoutes(routeDeps);
  if (!routeDeps.config.experimentalFeatures.entityStoreDisabled) {
    registerEntityStoreRoutes(routeDeps);
  }
  registerPrivilegeMonitoringRoutes(routeDeps);

  registerEntityDetailsRoutes(routeDeps);

  if (routeDeps.config.experimentalFeatures.leadGenerationEnabled) {
    registerLeadGenerationRoutes(routeDeps);
  }
  if (routeDeps.config.experimentalFeatures.entityAnalyticsWatchlistEnabled) {
    registerWatchlistRoutes(routeDeps);
  }

  if (!routeDeps.config.experimentalFeatures.entityStoreDisabled) {
    registerEntityResolutionRoutes(routeDeps);
  }

  if (routeDeps.config.experimentalFeatures.entityAnalyticsAnomalyDetails) {
    registerAnomalySummaryRoutes(routeDeps);
  }

  if (routeDeps.config.experimentalFeatures.riskScoreHistoryEnabled) {
    registerRiskScoreHistoryRoute(routeDeps);
  }
};
