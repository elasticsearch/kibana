/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializer, PluginInitializerContext } from '@kbn/core/public';
import { MCP_SERVER_PATH } from '@kbn/agent-builder-common';
import type {
  AgentBuilderPluginSetup,
  AgentBuilderPluginStart,
  AgentBuilderSetupDependencies,
  AgentBuilderStartDependencies,
  ConfigSchema,
} from './types';
import { AgentBuilderPlugin } from './plugin';
import { AGENTBUILDER_FEATURE_ID, AGENTBUILDER_APP_ID, uiPrivileges } from '../common/features';
import { type CreateSkillResponse, SKILLS_API_PATH } from '../common/http_api/skills';

export type {
  AgentBuilderPluginSetup,
  AgentBuilderPluginStart,
  PublicEmbeddableConversationProps,
  PublicEmbeddableConversationInputProps,
  EmbeddableConversationInputRef,
} from './types';
export type { EmbeddableConversationProps } from './embeddable/types';
export { AGENTBUILDER_FEATURE_ID, AGENTBUILDER_APP_ID, uiPrivileges, MCP_SERVER_PATH };
export { type CreateSkillResponse, SKILLS_API_PATH };
export { ConversationInputShell } from '@kbn/agent-builder-browser';
export type { ConversationInputShellProps } from '@kbn/agent-builder-browser';
export const plugin: PluginInitializer<
  AgentBuilderPluginSetup,
  AgentBuilderPluginStart,
  AgentBuilderSetupDependencies,
  AgentBuilderStartDependencies
> = (pluginInitializerContext: PluginInitializerContext<ConfigSchema>) => {
  return new AgentBuilderPlugin(pluginInitializerContext);
};
