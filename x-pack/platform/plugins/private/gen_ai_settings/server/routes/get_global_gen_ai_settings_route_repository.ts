/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { connectorRoutes } from './connectors/route';
import { installTokenUsageDashboardRoutes } from './install_token_usage_dashboard/route';
import { agentBuilderTracingRoutes } from './agent_builder_tracing/route';

export function getGlobalGenAiSettingsServerRouteRepository() {
  return {
    ...connectorRoutes,
    ...installTokenUsageDashboardRoutes,
    ...agentBuilderTracingRoutes,
  };
}

export type GenAiSettingsServerRouteRepository = ReturnType<
  typeof getGlobalGenAiSettingsServerRouteRepository
>;
