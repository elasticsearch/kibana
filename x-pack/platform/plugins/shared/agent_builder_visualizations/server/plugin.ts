/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import type {
  AgentBuilderVisualizationsSetupDependencies,
  AgentBuilderVisualizationsStartDependencies,
  AgentBuilderVisualizationsPluginSetup,
  AgentBuilderVisualizationsPluginStart,
} from './types';
import { createVisualizationAttachmentType } from './attachment_types';

export class AgentBuilderVisualizationsPlugin
  implements
    Plugin<
      AgentBuilderVisualizationsPluginSetup,
      AgentBuilderVisualizationsPluginStart,
      AgentBuilderVisualizationsSetupDependencies,
      AgentBuilderVisualizationsStartDependencies
    >
{
  constructor(_context: PluginInitializerContext) {}

  setup(
    _coreSetup: CoreSetup<
      AgentBuilderVisualizationsStartDependencies,
      AgentBuilderVisualizationsPluginStart
    >,
    setupDeps: AgentBuilderVisualizationsSetupDependencies
  ): AgentBuilderVisualizationsPluginSetup {
    setupDeps.agentBuilder.attachments.registerType(
      createVisualizationAttachmentType() as Parameters<
        typeof setupDeps.agentBuilder.attachments.registerType
      >[0]
    );
    return {};
  }

  start(
    _coreStart: CoreStart,
    _startDeps: AgentBuilderVisualizationsStartDependencies
  ): AgentBuilderVisualizationsPluginStart {
    return {};
  }

  stop() {}
}
