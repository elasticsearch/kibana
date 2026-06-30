/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginStart } from '@kbn/agent-builder-browser';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type { LensPublicStart } from '@kbn/lens-plugin/public';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AgentBuilderVisualizationsPluginPublicSetup {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AgentBuilderVisualizationsPluginPublicStart {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AgentBuilderVisualizationsPluginPublicSetupDependencies {}

export interface AgentBuilderVisualizationsPluginPublicStartDependencies {
  agentBuilder: AgentBuilderPluginStart;
  lens: LensPublicStart;
  dataViews: DataViewsPublicPluginStart;
  uiActions: UiActionsStart;
  unifiedSearch: UnifiedSearchPublicPluginStart;
  embeddable: EmbeddableStart;
}
