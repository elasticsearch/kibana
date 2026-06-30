/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, Logger } from '@kbn/core/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { SpacesServiceStart } from '@kbn/spaces-plugin/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import { registerAnalyseEnvironmentRoute } from './analyse_environment';
import { registerBackfillDiamondRoute } from './backfill_diamond';
import { registerCoverageGapRoute } from './coverage_gap';
import { registerDashboardOverviewRoute } from './dashboard_overview';
import { registerExtractIocsRoute } from './extract_iocs';
import { registerExtractDiamondRoute } from './extract_diamond';
import { registerEnrichTaxonomyRoute } from './enrich_taxonomy';
import { registerFlyoutInsightsRoute } from './flyout_insights';
import { registerGeneralizeFromTelemetryRoute } from './generalize_from_telemetry';
import { registerHuntBehaviorRoute } from './hunt_behavior';
import { registerHuntForThreatRoute } from './hunt_for_threat';
import { registerHuntOrchestratedRoute } from './hunt_orchestrator';
import { registerIngestReportRoute } from './ingest_report';
import { registerSavedViewsRoutes } from './saved_views';
import { registerSearchReportsRoute } from './search_reports';
import { registerSubscriptionRoutes } from './subscriptions';
import { registerSearchByAnchorsRoute } from './search_by_anchors';
import { registerSearchByDiamondRoute } from './search_by_diamond';
import { registerCorrelateThreatRoute } from './correlate_threat';
import { registerSynthesizeAdvisoryRoute } from './synthesize_advisory';
import { registerCorrelationRunsRoutes } from '../correlation_runs/routes';

export interface RouteRegistrationDeps {
  router: IRouter;
  logger: Logger;
  /**
   * Resolved during plugin start. Optional because the `spaces` plugin is
   * itself optional; route handlers fall back to `'default'` when it is
   * missing so the plugin still works on stripped-down test bootstraps.
   */
  getSpacesService: () => SpacesServiceStart | undefined;
  /**
   * Resolved during plugin start. Optional because the `inference` plugin
   * is also optional. Required by the LLM-backed routes (`hunt_behavior`,
   * `generalize_from_telemetry`); when missing, those routes return 503
   * with a structured message and the agent falls back to the IOC path.
   */
  getInference: () => InferenceServerStart | undefined;
  /**
   * Resolved during plugin start. Optional because the `taskManager` plugin
   * is optional. Required by `backfill_diamond` to schedule the one-shot
   * backfill task; route returns 503 when missing.
   */
  getTaskManager?: () => TaskManagerStartContract | undefined;
}

/**
 * Per the Agent Builder architecture guidance, every domain action exposes
 * a public HTTP route. The skill markdown documents these routes; the
 * orchestrating agent invokes them via `execute_workflow_step` with
 * `kibana-request`. The Agent Builder tool wrappers in
 * `server/agent_builder/tools/` are thin portability shims that call into
 * the same shared services these routes use.
 */
export const registerRoutes = (deps: RouteRegistrationDeps): void => {
  // Domain-action routes — canonical execution surface.
  registerSearchReportsRoute(deps);
  registerBackfillDiamondRoute(deps);
  registerIngestReportRoute(deps);
  registerHuntBehaviorRoute(deps);
  registerHuntForThreatRoute(deps);
  registerHuntOrchestratedRoute(deps);
  registerCoverageGapRoute(deps);
  registerGeneralizeFromTelemetryRoute(deps);
  registerExtractIocsRoute(deps);
  registerExtractDiamondRoute(deps);
  registerEnrichTaxonomyRoute(deps);
  registerAnalyseEnvironmentRoute(deps);
  registerSynthesizeAdvisoryRoute(deps);
  registerSearchByAnchorsRoute(deps);
  registerSearchByDiamondRoute(deps);
  registerCorrelateThreatRoute(deps);
  registerCorrelationRunsRoutes(deps);
  registerSubscriptionRoutes(deps);

  // UI-facing routes (dashboard + saved views + flyout).
  registerDashboardOverviewRoute(deps);
  registerSavedViewsRoutes(deps);
  registerFlyoutInsightsRoute(deps);
};
