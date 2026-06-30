/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { fromKueryExpression, toElasticsearchQuery } from '@kbn/es-query';
import { buildAgentStatusRuntimeField } from '@kbn/fleet-plugin/server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import { EndpointSortableField } from '../../../../common/endpoint/types';
import {
  ENDPOINT_DEFAULT_PAGE,
  ENDPOINT_DEFAULT_PAGE_SIZE,
  ENDPOINT_DEFAULT_SORT_DIRECTION,
  ENDPOINT_DEFAULT_SORT_FIELD,
  metadataCurrentIndexPattern,
  METADATA_UNITED_INDEX,
} from '../../../../common/endpoint/constants';
import { buildStatusesKuery } from './support/agent_status';
import type { GetMetadataListRequestQuery } from '../../../../common/api/endpoint';
import { buildBaseEndpointMetadataFilter } from '../../../../common/endpoint/utils/endpoint_metadata_filter';
import { prefixIndexPatternsWithCcs } from '../../utils/ccs_utils';

export interface QueryBuilderOptions {
  page: number;
  pageSize: number;
  kuery?: string;
  unenrolledAgentIds?: string[];
  statusAgentIds?: string[];
}

// sort using either event.created, or HostDetails.event.created,
// depending on whichever exists. This works for QueryStrat v1 and v2, and the v2+ schema change.
// using unmapped_type avoids errors when the given field doesn't exist, and sets to the 0-value for that type
// effectively ignoring it
// https://www.elastic.co/guide/en/elasticsearch/reference/current/sort-search-results.html#_ignoring_unmapped_fields
export const MetadataSortMethod: estypes.SortCombinations[] = [
  {
    'event.created': {
      order: 'desc',
      unmapped_type: 'date',
    },
  },
  {
    'HostDetails.event.created': {
      order: 'desc',
      unmapped_type: 'date',
    },
  },
];

const getUnitedMetadataSortMethod = (
  sortField: EndpointSortableField,
  sortDirection: 'asc' | 'desc'
): estypes.SortCombinations[] => {
  const DATE_FIELDS = [EndpointSortableField.LAST_SEEN, EndpointSortableField.ENROLLED_AT];

  const mappedUnitedMetadataSortField =
    sortField === EndpointSortableField.HOST_STATUS
      ? 'status'
      : sortField === EndpointSortableField.ENROLLED_AT
      ? 'united.agent.enrolled_at'
      : sortField.replace('metadata.', 'united.endpoint.');

  if (DATE_FIELDS.includes(sortField)) {
    return [{ [mappedUnitedMetadataSortField]: { order: sortDirection, unmapped_type: 'date' } }];
  } else {
    return [{ [mappedUnitedMetadataSortField]: sortDirection }];
  }
};

export function getESQueryHostMetadataByID(
  agentID: string,
  ccsEnabled: boolean = false
): estypes.SearchRequest {
  return {
    query: {
      bool: {
        filter: [
          {
            bool: {
              should: [
                { term: { 'agent.id': agentID } },
                { term: { 'HostDetails.agent.id': agentID } },
              ],
            },
          },
        ],
      },
    },
    sort: MetadataSortMethod,
    size: 1,
    index: prefixIndexPatternsWithCcs(metadataCurrentIndexPattern, ccsEnabled),
  };
}

export function getESQueryHostMetadataByFleetAgentIds(
  fleetAgentIds: string[],
  ccsEnabled: boolean = false
): estypes.SearchRequest {
  return {
    query: {
      bool: {
        filter: [
          {
            bool: {
              should: [{ terms: { 'elastic.agent.id': fleetAgentIds } }],
            },
          },
        ],
      },
    },
    sort: MetadataSortMethod,
    index: prefixIndexPatternsWithCcs(metadataCurrentIndexPattern, ccsEnabled),
  };
}

export function getESQueryHostMetadataByIDs(
  agentIDs: string[],
  ccsEnabled: boolean = false
): estypes.SearchRequest {
  return {
    query: {
      bool: {
        filter: [
          {
            bool: {
              should: [
                { terms: { 'agent.id': agentIDs } },
                { terms: { 'HostDetails.agent.id': agentIDs } },
              ],
            },
          },
        ],
      },
    },
    sort: MetadataSortMethod,
    index: prefixIndexPatternsWithCcs(metadataCurrentIndexPattern, ccsEnabled),
    size: agentIDs.length,
  };
}

const lastCheckinRuntimeField = {
  last_checkin: {
    type: 'date' as const,
    script: {
      lang: 'painless',
      source:
        "emit(doc['united.agent.last_checkin'].size() > 0 ? doc['united.agent.last_checkin'].value.toInstant().toEpochMilli() : doc['united.endpoint.@timestamp'].value.toInstant().toEpochMilli());",
    },
  },
};

interface BuildUnitedIndexQueryResponse extends estypes.SearchRequest {
  track_total_hits: boolean;
  sort: estypes.SortCombinations[];
  fields?: string[];
  from: number;
  size: number;
  index: string;
}

export async function buildUnitedIndexQuery(
  soClient: SavedObjectsClientContract,
  queryOptions: GetMetadataListRequestQuery,
  endpointPolicyIds: string[] = [],
  ccsEnabled: boolean = false
): Promise<BuildUnitedIndexQueryResponse> {
  const {
    page = ENDPOINT_DEFAULT_PAGE,
    pageSize = ENDPOINT_DEFAULT_PAGE_SIZE,
    hostStatuses = [],
    kuery = '',
    sortField = ENDPOINT_DEFAULT_SORT_FIELD,
    sortDirection = ENDPOINT_DEFAULT_SORT_DIRECTION,
  } = queryOptions || {};

  const statusesKuery = buildStatusesKuery(hostStatuses);
  const idFilter = buildBaseEndpointMetadataFilter(endpointPolicyIds);

  let query: BuildUnitedIndexQueryResponse['query'] = idFilter;

  if (statusesKuery || kuery) {
    const kqlQuery = toElasticsearchQuery(fromKueryExpression(kuery ?? ''));
    const q = [idFilter];

    if (statusesKuery) {
      q.push(toElasticsearchQuery(fromKueryExpression(statusesKuery)));
    }
    q.push({ ...kqlQuery });
    query = {
      bool: { must: q },
    };
  }

  const statusRuntimeField = await buildAgentStatusRuntimeField(soClient, 'united.agent.');
  const runtimeMappings = { ...statusRuntimeField, ...lastCheckinRuntimeField };

  const fields = Object.keys(runtimeMappings);
  return {
    query,
    track_total_hits: true,
    sort: getUnitedMetadataSortMethod(sortField as EndpointSortableField, sortDirection),
    fields,
    runtime_mappings: runtimeMappings,
    from: page * pageSize,
    size: pageSize,
    index: prefixIndexPatternsWithCcs(METADATA_UNITED_INDEX, ccsEnabled),
  };
}
