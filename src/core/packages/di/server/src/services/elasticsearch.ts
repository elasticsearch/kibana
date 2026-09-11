/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createToken } from '@kbn/core-di';
import type { ServiceToken } from '@kbn/core-di';
import type {
  AsScopedOptions,
  ElasticsearchClient as IElasticsearchClient,
  IScopedClusterClient,
} from '@kbn/core-elasticsearch-server';

/**
 * Factory type for creating parameterized scoped cluster client instances.
 * @see {@link IScopedClusterClient}
 * @public
 */
export type IScopedClusterClientFactory = (options?: AsScopedOptions) => IScopedClusterClient;

/**
 * The Elasticsearch client authenticated as the user of the current HTTP request.
 * @public
 */
export const ElasticsearchClient: ServiceToken<IElasticsearchClient> =
  createToken('ElasticsearchClient');

/**
 * The Elasticsearch client authenticated as the internal Kibana user.
 * @public
 */
export const InternalElasticsearchClient: ServiceToken<IElasticsearchClient> = createToken(
  'InternalElasticsearchClient'
);

/**
 * The Elasticsearch cluster client scoped to the current HTTP request.
 * @see {@link IScopedClusterClient}
 * @public
 */
export const ScopedClusterClient: ServiceToken<IScopedClusterClient> =
  createToken('ScopedClusterClient');

/**
 * The cluster client factory that constructs a scoped client instance in the current HTTP request context.
 * @public
 */
export const ScopedClusterClientFactory: ServiceToken<IScopedClusterClientFactory> = createToken(
  'ScopedClusterClientFactory'
);
