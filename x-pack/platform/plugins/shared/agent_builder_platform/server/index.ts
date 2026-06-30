/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializer, PluginInitializerContext } from '@kbn/core/server';
import type { PluginConfig } from './config';
import type {
  PluginSetupDependencies,
  PluginStartDependencies,
  AgentBuilderPlatformPluginSetup,
  AgentBuilderPlatformPluginStart,
} from './types';

export const plugin: PluginInitializer<
  AgentBuilderPlatformPluginSetup,
  AgentBuilderPlatformPluginStart,
  PluginSetupDependencies,
  PluginStartDependencies
> = async (pluginInitializerContext: PluginInitializerContext<PluginConfig>) => {
  const { AgentBuilderPlatformPlugin } = await import('./plugin');
  return new AgentBuilderPlatformPlugin(pluginInitializerContext);
};

export { config } from './config';
export type { AgentBuilderPlatformPluginSetup, AgentBuilderPlatformPluginStart } from './types';
