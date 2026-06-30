/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/public';
import { VISUALIZATION_ATTACHMENT_TYPE } from '@kbn/agent-builder-visualizations-common';
import { createVisualizationAttachmentDefinition } from './attachment_types/visualization_attachment';
import type {
  AgentBuilderVisualizationsPluginPublicSetup,
  AgentBuilderVisualizationsPluginPublicStart,
  AgentBuilderVisualizationsPluginPublicSetupDependencies,
  AgentBuilderVisualizationsPluginPublicStartDependencies,
} from './types';

export class AgentBuilderVisualizationsPublicPlugin
  implements
    Plugin<
      AgentBuilderVisualizationsPluginPublicSetup,
      AgentBuilderVisualizationsPluginPublicStart,
      AgentBuilderVisualizationsPluginPublicSetupDependencies,
      AgentBuilderVisualizationsPluginPublicStartDependencies
    >
{
  constructor(_initContext: PluginInitializerContext) {}

  setup(
    _core: CoreSetup<
      AgentBuilderVisualizationsPluginPublicStartDependencies,
      AgentBuilderVisualizationsPluginPublicStart
    >,
    _plugins: AgentBuilderVisualizationsPluginPublicSetupDependencies
  ): AgentBuilderVisualizationsPluginPublicSetup {
    return {};
  }

  start(
    core: CoreStart,
    plugins: AgentBuilderVisualizationsPluginPublicStartDependencies
  ): AgentBuilderVisualizationsPluginPublicStart {
    plugins.agentBuilder.attachments.addAttachmentType(
      VISUALIZATION_ATTACHMENT_TYPE,
      createVisualizationAttachmentDefinition({
        application: core.application,
        lens: plugins.lens,
        dataViews: plugins.dataViews,
        uiActions: plugins.uiActions,
        unifiedSearch: plugins.unifiedSearch,
        embeddable: plugins.embeddable,
      })
    );

    return {};
  }

  stop() {}
}
