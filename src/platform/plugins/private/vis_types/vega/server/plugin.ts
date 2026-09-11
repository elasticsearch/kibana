/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PluginInitializerContext, CoreSetup, Logger, Plugin } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
import type {
  VisTypeVegaPluginSetupDependencies,
  VisTypeVegaPluginSetup,
  VisTypeVegaPluginStart,
} from './types';
import { VEGA_EMBEDDABLE_TYPE, VEGA_STANDALONE_EMBEDDABLE_FLAG } from '../common/constants';
import { getVegaEmbeddableSchema } from './embeddable/schema';
import { getTransforms } from './embeddable/transforms/get_transforms';
import { vegaLibraryItemSavedObjectType } from './vega_saved_object';
import { registerRoutes } from './api/register_routes';

export class VisTypeVegaPlugin implements Plugin<VisTypeVegaPluginSetup, VisTypeVegaPluginStart> {
  private standaloneEmbeddableEnabled = false;
  private readonly logger: Logger;
  private apiUsageCounter?: UsageCounter;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(
    core: CoreSetup,
    { embeddable, usageCollection }: VisTypeVegaPluginSetupDependencies
  ) {
    // Startup-only: public API/OpenAPI contract should not hot-swap mid-process.
    void core
      .getStartServices()
      .then(([coreStart]) =>
        coreStart.featureFlags.getBooleanValue(VEGA_STANDALONE_EMBEDDABLE_FLAG, false)
      )
      .then((enabled) => {
        this.standaloneEmbeddableEnabled = enabled;
      })
      .catch(() => {});

    embeddable.registerEmbeddableServerDefinition(VEGA_EMBEDDABLE_TYPE, {
      title: 'Vega',
      getSchema: (getDrilldownsSchema) =>
        this.standaloneEmbeddableEnabled ? getVegaEmbeddableSchema(getDrilldownsSchema) : undefined,
      getTransforms,
    });

    core.savedObjects.registerType(vegaLibraryItemSavedObjectType);

    if (usageCollection) {
      this.apiUsageCounter = usageCollection.createUsageCounter('vega_api');
    }
    registerRoutes(core.http, this.apiUsageCounter, this.logger);

    return {};
  }

  public start() {
    return {};
  }
}
