/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  PluginSetupContract as ActionsPluginSetup,
  PluginStartContract as ActionsPluginStart,
} from '@kbn/actions-plugin/server';
import type { InferenceServerSetup, InferenceServerStart } from '@kbn/inference-plugin/server';
import type {
  AgentBuilderPlatformPluginSetup,
  AgentBuilderPlatformPluginStart,
} from '@kbn/agent-builder-platform-plugin/server';

export interface GenAiSettingsPluginSetupDependencies {
  actions: ActionsPluginSetup;
  inference: InferenceServerSetup;
  agentBuilderPlatform?: AgentBuilderPlatformPluginSetup;
}

export interface GenAiSettingsPluginStartDependencies {
  actions: ActionsPluginStart;
  inference: InferenceServerStart;
  agentBuilderPlatform?: AgentBuilderPlatformPluginStart;
}
