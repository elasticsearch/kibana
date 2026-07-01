/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ContentManagementServerSetup } from '@kbn/content-management-plugin/server';
import type {
  CoreSetup,
  CoreStart,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/server';
import type { EmbeddableSetup } from '@kbn/embeddable-plugin/server';
import type { UsageCollectionSetup, UsageCounter } from '@kbn/usage-collection-plugin/server';

import { LINKS_EMBEDDABLE_TYPE } from '../common';
import { transforms } from '../common/embeddable/transforms/transforms';
import { registerRoutes } from './api';
import { linksEmbeddableSchema } from './api/schemas';
import { linksSavedObjectDefinition } from './links_saved_object';
import type { LinksByValueState } from './types';

export class LinksServerPlugin implements Plugin<object, object> {
  private readonly logger: Logger;
  private apiUsageCounter?: UsageCounter;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(
    core: CoreSetup,
    plugins: {
      contentManagement: ContentManagementServerSetup;
      embeddable: EmbeddableSetup;
      usageCollection?: UsageCollectionSetup;
    }
  ) {
    core.savedObjects.registerType<LinksByValueState>(linksSavedObjectDefinition);
    plugins.embeddable.registerEmbeddableServerDefinition(LINKS_EMBEDDABLE_TYPE, {
      title: 'Links',
      getTransforms: () => transforms,
      getSchema: () => linksEmbeddableSchema,
    });

    if (plugins.usageCollection) {
      this.apiUsageCounter = plugins.usageCollection.createUsageCounter('links_api');
    }
    registerRoutes(core.http, this.apiUsageCounter, this.logger);

    return {};
  }

  public start(core: CoreStart) {
    return {};
  }

  public stop() {}
}
