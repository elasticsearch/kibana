/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreSetup,
  CoreStart,
  CustomRequestHandlerContext,
  IScopedClusterClient,
  IUiSettingsClient,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import type { LicensingApiRequestHandlerContext } from '@kbn/licensing-plugin/server/types';
import type { RacApiRequestHandlerContext } from '@kbn/rule-registry-plugin/server';
import type { RulesClientApi } from '@kbn/alerting-plugin/server/types';
import type { DefaultRouteHandlerResources } from '@kbn/server-route-repository-utils';
import type { ObservabilityAIAssistantService } from '../service';
import type {
  ObservabilityAIAssistantPluginSetupDependencies,
  ObservabilityAIAssistantPluginStartDependencies,
} from '../types';

type ObservabilityAIAssistantRequestHandlerContextBase = CustomRequestHandlerContext<{
  licensing: Pick<LicensingApiRequestHandlerContext, 'license' | 'featureUsage'>;
  // these two are here for compatibility with APM functions
  rac: Pick<RacApiRequestHandlerContext, 'getAlertsClient'>;
  alerting: {
    getRulesClient: () => Promise<RulesClientApi>;
  };
}>;

// this is the type used across methods, it's stripped down for compatibility
// with the context that's available when executing as an action
export type ObservabilityAIAssistantRequestHandlerContext = Omit<
  ObservabilityAIAssistantRequestHandlerContextBase,
  'core' | 'resolve' | 'loadPluginContract'
> & {
  core: Promise<{
    elasticsearch: {
      client: IScopedClusterClient;
    };
    uiSettings: {
      client: IUiSettingsClient;
      globalClient: IUiSettingsClient;
    };
    savedObjects: {
      client: SavedObjectsClientContract;
    };
  }>;
};

interface PluginContractResolveCore {
  core: {
    setup: CoreSetup<ObservabilityAIAssistantPluginStartDependencies>;
    start: () => Promise<CoreStart>;
  };
}

type PluginContractResolveDependenciesStart = {
  [key in keyof ObservabilityAIAssistantPluginStartDependencies]: {
    start: () => Promise<Required<ObservabilityAIAssistantPluginStartDependencies>[key]>;
  };
};

type PluginContractResolveDependenciesSetup = {
  [key in keyof ObservabilityAIAssistantPluginSetupDependencies]: {
    setup: Required<ObservabilityAIAssistantPluginSetupDependencies>[key];
  };
};

export interface ObservabilityAIAssistantRouteHandlerResources
  extends Omit<DefaultRouteHandlerResources, 'context' | 'response'> {
  context: ObservabilityAIAssistantRequestHandlerContext;
  service: ObservabilityAIAssistantService;
  plugins: PluginContractResolveCore &
    PluginContractResolveDependenciesSetup &
    PluginContractResolveDependenciesStart;
}

export interface ObservabilityAIAssistantRouteCreateOptions {
  timeout?: {
    payload?: number;
    idleSocket?: number;
  };
}
