/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest, PluginInitializerContext } from '@kbn/core/server';
import type { DataPluginStart } from '@kbn/data-plugin/server/plugin';
import type {
  ColumnsFromLocatorFn,
  SearchSourceFromLocatorFn,
  TitleFromLocatorFn,
  QueryFromLocatorFn,
  FiltersFromLocatorFn,
  TimeFieldNameFromLocatorFn,
} from './locator';

export interface DiscoverServerPluginStartDeps {
  data: DataPluginStart;
}

export interface LocatorServiceScopedClient {
  columnsFromLocator: ColumnsFromLocatorFn;
  searchSourceFromLocator: SearchSourceFromLocatorFn;
  titleFromLocator: TitleFromLocatorFn;
  queryFromLocator: QueryFromLocatorFn;
  filtersFromLocator: FiltersFromLocatorFn;
  timeFieldNameFromLocator: TimeFieldNameFromLocatorFn;
}

export interface DiscoverServerPluginLocatorService {
  asScopedClient: (req: KibanaRequest<unknown>) => Promise<LocatorServiceScopedClient>;
}

export interface DiscoverServerPluginStart {
  locator: DiscoverServerPluginLocatorService;
}

export { config } from './config';
export type {
  DiscoverSessionClassicTab,
  DiscoverSessionEsqlTab,
  DiscoverSessionTab,
  DiscoverSessionPanelOverrides,
  DiscoverSessionEmbeddableByValueProps,
  DiscoverSessionEmbeddableByReferenceProps,
  DiscoverSessionEmbeddableByValueState,
  DiscoverSessionEmbeddableByReferenceState,
  DiscoverSessionEmbeddableState,
} from './embeddable';
export {
  discoverSessionApiRequestBodySchema,
  discoverSessionApiResponseSchema,
  discoverSessionDataSchema,
} from './api/schema';
export type {
  DiscoverSessionApiClassicTab,
  DiscoverSessionApiEsqlTab,
  DiscoverSessionApiResponse,
  DiscoverSessionApiTab,
  DiscoverSessionData,
} from './api/schema';

export const plugin = async (context: PluginInitializerContext) => {
  const { DiscoverServerPlugin } = await import('./plugin');
  return new DiscoverServerPlugin(context);
};
