/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import type { AgentContextLayerPluginSetup } from '@kbn/agent-context-layer-plugin/server';

export interface AgentBuilderVisualizationsSetupDependencies {
  agentBuilder: AgentBuilderPluginSetup;
  agentContextLayer: AgentContextLayerPluginSetup;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AgentBuilderVisualizationsStartDependencies {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AgentBuilderVisualizationsPluginSetup {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AgentBuilderVisualizationsPluginStart {}
