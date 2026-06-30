/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RouteDependencies } from '../types';

import { registerComponentTemplateRoutes } from './api/component_templates';
import { registerDataStreamRoutes } from './api/data_streams';
import { registerEnrichPoliciesRoute } from './api/enrich_policies';
import { registerIndicesRoutes } from './api/indices';
import { registerInferenceModelRoutes } from './api/inference_models';
import { registerIndexMappingRoutes } from './api/mapping/register_index_mapping_route';
import { registerNodesRoute } from './api/nodes';
import { registerSettingsRoutes } from './api/settings';
import { registerSnapshotRepositoriesRoute } from './api/snapshot_repositories';
import { registerStatsRoute } from './api/stats';
import { registerTemplateRoutes } from './api/templates';

export class ApiRoutes {
  setup(dependencies: RouteDependencies) {
    registerDataStreamRoutes(dependencies);
    registerIndicesRoutes(dependencies);
    registerTemplateRoutes(dependencies);
    registerSettingsRoutes(dependencies);
    registerIndexMappingRoutes(dependencies);
    registerComponentTemplateRoutes(dependencies);
    registerInferenceModelRoutes(dependencies);
    registerNodesRoute(dependencies);
    registerEnrichPoliciesRoute(dependencies);
    registerSnapshotRepositoriesRoute(dependencies);

    if (dependencies.config.isIndexStatsEnabled !== false) {
      registerStatsRoute(dependencies);
    }
  }

  start() {}
  stop() {}
}
