/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import { PLUGIN_ID } from '../common';
import { registerDataSetsRoutes } from './routes/register_routes';
import type { DataFederationConfigType } from './config';

export class DataFederationServerPlugin
  implements Plugin<void, void, { features: FeaturesPluginSetup }>
{
  private readonly config: DataFederationConfigType;

  constructor(initializerContext: PluginInitializerContext) {
    this.config = initializerContext.config.get<DataFederationConfigType>();
  }

  public setup({ http }: CoreSetup, { features }: { features: FeaturesPluginSetup }) {
    features.registerElasticsearchFeature({
      id: PLUGIN_ID,
      management: {
        data: [PLUGIN_ID],
      },
      privileges: [
        {
          requiredClusterPrivileges: ['manage'],
          ui: ['manageFederatedData'],
        },
      ],
    });

    registerDataSetsRoutes(http.createRouter(), this.config);
  }

  public start(_core: CoreStart) {}

  public stop() {}
}
