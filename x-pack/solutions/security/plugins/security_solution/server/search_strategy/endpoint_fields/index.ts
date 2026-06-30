/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { from } from 'rxjs';
import type { DataViewsServerPluginStart } from '@kbn/data-views-plugin/server';
import type { ISearchStrategy, SearchStrategyDependencies } from '@kbn/data-plugin/server';
import type { CoreStart } from '@kbn/core/server';

import { requestIndexFieldSearch } from '@kbn/timelines-plugin/server/search_strategy/index_fields';

import { eventsIndexPattern, METADATA_UNITED_INDEX } from '../../../common/endpoint/constants';
import type {
  BeatFields,
  IndexFieldsStrategyRequest,
  IndexFieldsStrategyResponse,
} from '../../../common/search_strategy';
import type { EndpointAppContextService } from '../../endpoint/endpoint_app_context_services';
import { EndpointAuthorizationError } from '../../endpoint/errors';
import { parseRequest } from './parse_request';
import { buildIndexNameWithNamespace } from '../../../common/endpoint/utils/index_name_utilities';
import {
  hasConnectedRemoteClusters,
  prefixIndexPatternsWithCcs,
} from '../../endpoint/utils/ccs_utils';

/**
 * EndpointFieldProvider mimics indexField provider from timeline plugin: x-pack/solutions/security/plugins/timelines/server/search_strategy/index_fields/index.ts
 * but it uses ES internalUser instead to avoid adding extra index privileges for users with event filters permissions.
 * It is used to retrieve index patterns for event filters form.
 */
export const endpointFieldsProvider = (
  context: EndpointAppContextService,
  indexPatterns: DataViewsServerPluginStart,
  esClient: CoreStart['elasticsearch']['client']
): ISearchStrategy<IndexFieldsStrategyRequest<'indices'>, IndexFieldsStrategyResponse> => {
  // require the fields once we actually need them, rather than ahead of time, and pass
  // them to createFieldItem to reduce the amount of work done as much as possible
  const beatFields: BeatFields =
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@kbn/timelines-plugin/server/utils/beat_schema/fields.json').fieldsBeat;

  return {
    search: (request, _, deps) =>
      from(
        requestEndpointFieldsSearch(context, request, deps, beatFields, indexPatterns, esClient)
      ),
  };
};

export const requestEndpointFieldsSearch = async (
  context: EndpointAppContextService,
  request: IndexFieldsStrategyRequest<'indices'>,
  deps: SearchStrategyDependencies,
  beatFields: BeatFields,
  indexPatterns: DataViewsServerPluginStart,
  esClient: CoreStart['elasticsearch']['client']
): Promise<IndexFieldsStrategyResponse> => {
  const isTAAdvancedModeFeatureFlagEnabled = context.experimentalFeatures.trustedAppsAdvancedMode;
  const ccsEnabled = await hasConnectedRemoteClusters(
    esClient.asInternalUser,
    context.experimentalFeatures.defendRemoteOutputCcs
  );
  let parsedRequest = parseRequest(request);

  if (
    parsedRequest.indices.length > 1 ||
    (parsedRequest.indices[0] !== eventsIndexPattern &&
      parsedRequest.indices[0] !== METADATA_UNITED_INDEX)
  ) {
    throw new Error(`Invalid indices request ${request.indices.join(', ')}`);
  }

  if (parsedRequest.indices[0] === eventsIndexPattern) {
    const { id: spaceId } = await context.getActiveSpace(deps.request);
    const integrationNamespaces = await context
      .getInternalFleetServices(spaceId)
      .getIntegrationNamespaces(['endpoint']);

    const namespaces = integrationNamespaces.endpoint;
    if (namespaces && namespaces.length > 0) {
      const combinedPatterns = namespaces.map((namespace) =>
        buildIndexNameWithNamespace(eventsIndexPattern, namespace, { preserveWildcard: true })
      );
      parsedRequest = {
        ...parsedRequest,
        indices: [combinedPatterns.join(',')],
      };
    }
  }

  const { canWriteEventFilters, canReadEndpointList, canWriteTrustedApplications } =
    await context.getEndpointAuthz(deps.request);

  if (
    (!canWriteEventFilters && parsedRequest.indices[0] === eventsIndexPattern) ||
    (isTAAdvancedModeFeatureFlagEnabled &&
      !canWriteTrustedApplications &&
      parsedRequest.indices[0] === eventsIndexPattern) ||
    (!canReadEndpointList && parsedRequest.indices[0] === METADATA_UNITED_INDEX)
  ) {
    throw new EndpointAuthorizationError();
  }

  const ccsIndexPattern = prefixIndexPatternsWithCcs(parsedRequest.indices[0], ccsEnabled);

  parsedRequest = {
    ...parsedRequest,
    // CCS prefixing yields `local,*:local`. The downstream existence check
    // (`findExistingIndices`) runs `field_caps` with `allow_no_indices: false`, which
    // errors on the local entry when all endpoint data lives on the remote cluster
    // (remote-output topology). Passing each pattern separately lets the remote (`*:`)
    // entry resolve on its own instead of the empty local entry failing the whole call.
    indices: ccsEnabled ? ccsIndexPattern.split(',') : [ccsIndexPattern],
  };

  return requestIndexFieldSearch(parsedRequest, deps, beatFields, indexPatterns, true);
};
