/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { ServiceIdentifier } from 'inversify';

export const EsServiceInternalToken = Symbol.for(
  'alerting_v2.EsServiceInternal'
) as ServiceIdentifier<ElasticsearchClient>;

export const EsServiceScopedToken = Symbol.for(
  'alerting_v2.EsServiceScoped'
) as ServiceIdentifier<ElasticsearchClient>;

/**
 * Request-scoped current-user client with `projectRouting: 'space'`:
 * `elasticsearch.client.asScoped(request, { projectRouting: 'space' }).asCurrentUser`.
 * Used for rule-execution queries against user data so they are scoped to the originating
 * space/project when CPS is enabled (falls back to local routing when CPS is disabled).
 */
export const EsServiceScopedSpaceRoutingToken = Symbol.for(
  'alerting_v2.EsServiceScopedSpaceRouting'
) as ServiceIdentifier<ElasticsearchClient>;
