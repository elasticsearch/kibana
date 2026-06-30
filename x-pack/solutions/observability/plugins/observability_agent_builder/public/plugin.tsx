/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/public';
import type {
  ObservabilityAgentBuilderPluginPublicSetup,
  ObservabilityAgentBuilderPluginSetupDependencies,
  ObservabilityAgentBuilderPluginPublicStart,
  ObservabilityAgentBuilderPluginStartDependencies,
} from './types';
import {
  createAlertAskAiAssistantButton,
  createErrorSampleAIInsight,
  createLogAIInsight,
  createLogsAIInsightRenderer,
} from './components/insights';
import { registerAttachmentUiDefinitions } from './attachment_types';
import { registerTelemetryEventTypes } from './analytics';

export class ObservabilityAgentBuilderPlugin
  implements
    Plugin<
      ObservabilityAgentBuilderPluginPublicSetup,
      ObservabilityAgentBuilderPluginPublicStart,
      ObservabilityAgentBuilderPluginSetupDependencies,
      ObservabilityAgentBuilderPluginStartDependencies
    >
{
  constructor(initContext: PluginInitializerContext) {}

  public setup(
    core: CoreSetup<
      ObservabilityAgentBuilderPluginStartDependencies,
      ObservabilityAgentBuilderPluginPublicStart
    >,
    plugins: ObservabilityAgentBuilderPluginSetupDependencies
  ): ObservabilityAgentBuilderPluginPublicSetup {
    registerTelemetryEventTypes(core.analytics);
    return {};
  }

  public start(
    core: CoreStart,
    plugins: ObservabilityAgentBuilderPluginStartDependencies
  ): ObservabilityAgentBuilderPluginPublicStart {
    const LogAIInsight = createLogAIInsight(core, plugins);

    plugins.discoverShared.features.registry.register({
      id: 'observability-logs-ai-insight',
      render: createLogsAIInsightRenderer(LogAIInsight),
    });

    registerAttachmentUiDefinitions({
      attachments: plugins.agentBuilder.attachments,
    });

    return {
      getAlertAskAiAssistantButton: () => createAlertAskAiAssistantButton(core, plugins),
      getErrorSampleAIInsight: () => createErrorSampleAIInsight(core, plugins),
    };
  }

  public stop() {}
}
