/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { ContentManagementServerSetup } from '@kbn/content-management-plugin/server';
import { getUiSettings } from './ui_settings';
import { registerRoutes } from './routes';
import { ESQLExtensionsRegistry } from './extensions_registry';
import type { EsqlServerPluginSetup, EsqlServerPluginStart } from './types';

export class EsqlServerPlugin
  implements
    Plugin<
      EsqlServerPluginSetup,
      void,
      { contentManagement: ContentManagementServerSetup },
      EsqlServerPluginStart
    >
{
  private readonly initContext: PluginInitializerContext;
  private extensionsRegistry: ESQLExtensionsRegistry = new ESQLExtensionsRegistry();

  constructor(initContext: PluginInitializerContext) {
    this.initContext = { ...initContext };
  }

  public setup(
    core: CoreSetup<EsqlServerPluginStart, void>,
    plugins: { contentManagement: ContentManagementServerSetup }
  ) {
    const { initContext } = this;

    core.uiSettings.register(getUiSettings());

    plugins.contentManagement.favorites.registerFavoriteType('esql_query', {
      typeMetadataSchema: schema.object({
        queryString: schema.string(),
        createdAt: schema.string(),
        status: schema.string(),
      }),
    });

    registerRoutes(core, this.extensionsRegistry, initContext);

    return {
      getExtensionsRegistry: () => this.extensionsRegistry,
    };
  }

  public start(core: CoreStart) {
    return {};
  }

  public stop() {}
}
