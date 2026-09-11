/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, Logger } from '@kbn/core/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { SearchInferenceEndpointsPluginStart } from '@kbn/search-inference-endpoints/server';
import type { SpacesServiceStart } from '@kbn/spaces-plugin/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import { registerCreateThreatReportRoute } from './create_threat_report';
import { registerExtractIocsRoute } from './extract_iocs';
import { registerExtractDiamondRoute } from './extract_diamond';
import { registerEnrichTaxonomyRoute } from './enrich_taxonomy';
import { registerClassifySeverityRoute } from './classify_severity';
import { registerAssessRelevanceRoute } from './assess_relevance';
import { registerListSourcesRoute, registerUpdateSourceRoute } from './list_sources';
import { registerFindThreatReportsRoute } from './find_threat_reports';
import { registerGetThreatReportRoute } from './get_threat_report';
import { registerReadinessRoute } from './readiness';

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
   * is also optional. Required by LLM-backed enrichment routes; when missing,
   * those routes return 503.
   */
  getInference: () => InferenceServerStart | undefined;
  /**
   * Resolved during plugin start. Optional because the
   * `searchInferenceEndpoints` plugin is optional; LLM-backed routes fall back
   * to `genAi:defaultAIConnector` when it is missing.
   */
  getSearchInferenceEndpoints: () => SearchInferenceEndpointsPluginStart | undefined;
  /**
   * Resolved during plugin start. Optional because the `taskManager` plugin
   * is optional.
   */
  getTaskManager?: () => TaskManagerStartContract | undefined;
  /**
   * Settles when the one-time bootstrap (index templates, mapping migrations,
   * catalog seeding) has finished, and rejects if it failed. Handlers that
   * touch the plugin-owned indices await it via `rejectUntilBootstrapped` so a
   * request during startup cannot auto-create an index before its template
   * applies.
   */
  getBootstrapReady: () => Promise<void>;
}

export const registerRoutes = (deps: RouteRegistrationDeps): void => {
  registerCreateThreatReportRoute(deps);
  registerExtractIocsRoute(deps);
  registerExtractDiamondRoute(deps);
  registerEnrichTaxonomyRoute(deps);
  registerClassifySeverityRoute(deps);
  registerAssessRelevanceRoute(deps);
  registerListSourcesRoute(deps);
  registerUpdateSourceRoute(deps);
  registerFindThreatReportsRoute(deps);
  registerGetThreatReportRoute(deps);
  registerReadinessRoute(deps);
};
