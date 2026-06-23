/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ElasticsearchClient } from './client';
import type { ScopeableRequest } from './types';
import type { IScopedClusterClient } from './scoped_cluster_client';

/**
 * Options for the `asScoped` method.
 *
 * **Background**: Cross-Project Search (CPS) is a Serverless feature that allows Kibana to
 * transparently orchestrate searches across multiple Elastic projects. Kibana itself does not
 * execute the cross-project logic - it forwards requests with the appropriate `project_routing`
 * parameter and Elasticsearch handles execution, security enforcement, and result aggregation.
 *
 * **Important**: These options only take effect in CPS-enabled Serverless environments. In all
 * other environments (stateful, non-CPS Serverless), any `project_routing` params are
 * stripped from requests to avoid Elasticsearch rejections and to preserve traditional
 * single-cluster routing behavior.
 *
 * @public
 */
export type AsScopedOptions = SpaceProjectRoutingOptions | ExpressionProjectRoutingOptions;

/**
 * Routes requests to the Named Project Routing Expression (NPRE) configured for the current
 * Kibana space. The active space is read from `request.spaceId`. Use this when the scope of the
 * query should match the data boundaries of the active space (e.g. alerting rules).
 *
 * @public
 */
export interface SpaceProjectRoutingOptions {
  projectRouting: 'space';
}

/**
 * Routes requests using a caller-supplied `project_routing` expression. Use this when the scope
 * of the query is not the active space but a custom expression - for example a routing expression
 * that a user explicitly configured for a specific rule, workflow, or agent.
 *
 * The provided `value` is injected verbatim as the `project_routing` parameter of the underlying
 * Elasticsearch requests, so callers are responsible for ensuring it is a valid routing
 * expression.
 *
 * @public
 */
export interface ExpressionProjectRoutingOptions {
  projectRouting: 'expression';
  /**
   * The raw `project_routing` expression to inject into Elasticsearch requests
   * (e.g. `'_alias:_origin'` or `'@kibana_space_my-space_default'`).
   */
  value: string;
}

/**
 * Represents an Elasticsearch cluster API client created by the platform.
 * It allows to call API on behalf of the internal Kibana user and
 * the actual user that is derived from the request headers (via `asScoped(...)`).
 *
 * @public
 **/
export interface IClusterClient {
  /**
   * A {@link ElasticsearchClient | client} used to query the Elasticsearch cluster on behalf of
   * the Kibana internal user. Intended primarily for administrative and infrastructure-level
   * operations (e.g., index management, bootstrapping, health checks) rather than user-facing
   * data queries.
   *
   * In CPS-enabled Serverless environments, requests made through this client are always bound
   * to `'origin-only'` routing - they will never fan out to other CPS-connected projects.
   */
  readonly asInternalUser: ElasticsearchClient;

  /**
   * Creates a {@link IScopedClusterClient | scoped cluster client} bound to the given request,
   * forwarding the request's authentication headers to Elasticsearch.
   *
   * When `opts.projectRouting` is `'space'`, CPS routes to the NPRE for the active space
   * (read from `request.spaceId`). When it is `'expression'`, CPS routes using the
   * caller-supplied `opts.value` expression. Without opts, origin-only routing is used.
   *
   * @param request - A {@link ScopeableRequest} carrying authentication headers (and `spaceId` for space routing).
   * @param opts - Optional {@link AsScopedOptions} to configure CPS routing behavior.
   */
  asScoped(request: ScopeableRequest, opts?: AsScopedOptions): IScopedClusterClient;
}

/**
 * See {@link IClusterClient}
 *
 * @public
 */
export interface ICustomClusterClient extends IClusterClient {
  /**
   * Closes the cluster client. After that client cannot be used and one should
   * create a new client instance to be able to interact with Elasticsearch API.
   */
  close: () => Promise<void>;
}
