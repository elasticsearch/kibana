/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ServiceIdentifier } from 'inversify';
import type { QueryServiceContract } from './query_service';

/**
 * QueryService flavor that uses an Elasticsearch client scoped to the current request user:
 * `elasticsearch.client.asScoped(request).asCurrentUser`.
 * Requests stay scoped to the origin project.
 */
export const QueryServiceScopedToken = Symbol.for(
  'alerting_v2.QueryServiceScoped'
) as ServiceIdentifier<QueryServiceContract>;

/**
 * QueryService flavor for rule-execution queries against user data. Uses an Elasticsearch client
 * scoped to the current request user with `projectRouting: 'space'`:
 * `elasticsearch.client.asScoped(request, { projectRouting: 'space' }).asCurrentUser`.
 * This scopes queries to the originating space/project when CPS is enabled.
 */
export const QueryServiceScopedSpaceRoutingToken = Symbol.for(
  'alerting_v2.QueryServiceScopedSpaceRouting'
) as ServiceIdentifier<QueryServiceContract>;

/**
 * QueryService flavor that uses the internal Kibana system user:
 * `elasticsearch.client.asInternalUser`
 */
export const QueryServiceInternalToken = Symbol.for(
  'alerting_v2.QueryServiceInternal'
) as ServiceIdentifier<QueryServiceContract>;
