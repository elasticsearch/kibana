/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart } from '@kbn/core/server';
import type { DefaultRouteHandlerResources } from '@kbn/server-route-repository-utils';
import type {
  GenAiSettingsPluginSetupDependencies,
  GenAiSettingsPluginStartDependencies,
} from '../types';

export interface GenAiSettingsRouteHandlerResources
  extends Omit<DefaultRouteHandlerResources, 'context' | 'response'> {
  plugins: {
    core: {
      setup: CoreSetup<GenAiSettingsPluginStartDependencies>;
      start: () => Promise<CoreStart>;
    };
    actions: {
      setup: GenAiSettingsPluginSetupDependencies['actions'];
      start: () => Promise<GenAiSettingsPluginStartDependencies['actions']>;
    };
    inference: {
      setup: GenAiSettingsPluginSetupDependencies['inference'];
      start: () => Promise<GenAiSettingsPluginStartDependencies['inference']>;
    };
    agentBuilderPlatform?: {
      start: () => Promise<
        NonNullable<GenAiSettingsPluginStartDependencies['agentBuilderPlatform']>
      >;
    };
  };
}

export interface GenAiSettingsRouteCreateOptions {
  timeout?: {
    payload?: number;
    idleSocket?: number;
  };
}
