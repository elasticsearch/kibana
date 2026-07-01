/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import type {
  SignificantEventsPluginSetupDependencies,
  SignificantEventsPluginStartDependencies,
} from './types';

export interface SignificantEventsPluginSetup {}
export interface SignificantEventsPluginStart {}

export class SignificantEventsPlugin
  implements
    Plugin<
      SignificantEventsPluginSetup,
      SignificantEventsPluginStart,
      SignificantEventsPluginSetupDependencies,
      SignificantEventsPluginStartDependencies
    >
{
  constructor(_ctx: PluginInitializerContext) {}

  setup(
    _core: CoreSetup<SignificantEventsPluginStartDependencies>,
    plugins: SignificantEventsPluginSetupDependencies
  ): SignificantEventsPluginSetup {
    // Stage 2: register KnowledgeIndicatorService provider into streams so
    // streams-core can call KI operations without depending on this plugin.
    // plugins.streams.registerKnowledgeIndicatorClientProvider((request) => ...);
    void plugins;
    return {};
  }

  start(
    _core: CoreStart,
    _plugins: SignificantEventsPluginStartDependencies
  ): SignificantEventsPluginStart {
    return {};
  }
}
