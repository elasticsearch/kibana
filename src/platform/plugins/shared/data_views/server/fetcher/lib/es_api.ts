/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type {
  ExpandWildcard,
  FieldCapsResponse,
  MappingRuntimeFields,
} from '@elastic/elasticsearch/lib/api/types';
import type { QueryDslQueryContainer } from '../../../common/types';
import { convertEsError } from './errors';
import { mergeFieldCapsResponses } from './field_capabilities/merge_field_caps_responses';

// Elasticsearch defaults to a 4096 request-line limit. Leave headroom for the
// `_field_caps` suffix and the other request-line components.
const FIELD_CAPS_INDEX_PATH_LENGTH_LIMIT = 3000;

// This mirrors the Elasticsearch JS client's serialization of `params.index`.
const encodedIndexPathLength = (indices: string[]): number =>
  encodeURIComponent(indices.join(',')).length;

const getFieldCapsIndexBatches = (
  indices: string[] | string | undefined
): string[][] | undefined => {
  if (indices === undefined) {
    return undefined;
  }

  const indexExpressions = typeof indices === 'string' ? indices.split(',') : indices;
  if (encodedIndexPathLength(indexExpressions) <= FIELD_CAPS_INDEX_PATH_LENGTH_LIMIT) {
    return undefined;
  }

  const positiveExpressions = indexExpressions.filter((index) => !index.startsWith('-'));
  const negativeExpressions = indexExpressions.filter((index) => index.startsWith('-'));
  // Exclusions affect every positive expression, so every batch repeats them and
  // includes their encoded length in its budget.
  if (
    positiveExpressions.length === 0 ||
    positiveExpressions.some(
      (index) =>
        encodedIndexPathLength([index, ...negativeExpressions]) > FIELD_CAPS_INDEX_PATH_LENGTH_LIMIT
    )
  ) {
    return undefined;
  }

  const batches: string[][] = [];
  let positiveBatch: string[] = [];
  for (const index of positiveExpressions) {
    const candidate = [...positiveBatch, index, ...negativeExpressions];
    if (
      positiveBatch.length > 0 &&
      encodedIndexPathLength(candidate) > FIELD_CAPS_INDEX_PATH_LENGTH_LIMIT
    ) {
      batches.push([...positiveBatch, ...negativeExpressions]);
      positiveBatch = [index];
    } else {
      positiveBatch.push(index);
    }
  }
  batches.push([...positiveBatch, ...negativeExpressions]);

  return batches.length > 1 ? batches : undefined;
};

/**
 *  Call the index.getAlias API for a list of indices.
 *
 *  If `indices` is an array or comma-separated list and some of the
 *  values don't match anything but others do this will return the
 *  matches and not throw an error.
 *
 *  If not a single index matches then a NoMatchingIndicesError will
 *  be thrown.
 *
 *  @param  {Function} callCluster bound function for accessing an es client
 *  @param  {Array<String>|String} indices
 *  @return {Promise<IndexAliasResponse>}
 */
export async function callIndexAliasApi(
  callCluster: ElasticsearchClient,
  indices: string[] | string
) {
  try {
    return await callCluster.indices.getAlias({
      index: indices,
      ignore_unavailable: true,
      allow_no_indices: false,
    });
  } catch (error) {
    throw convertEsError(indices, error);
  }
}

interface FieldCapsApiParams {
  callCluster: ElasticsearchClient;
  indices: string[] | string;
  fieldCapsOptions?: { allow_no_indices: boolean; include_unmapped?: boolean };
  indexFilter?: QueryDslQueryContainer;
  fields?: string[];
  expandWildcards?: ExpandWildcard;
  fieldTypes?: string[];
  includeEmptyFields?: boolean;
  runtimeMappings?: MappingRuntimeFields;
  abortSignal?: AbortSignal;
  projectRouting?: string;
}

/**
 *  Call the fieldCaps API for a list of indices.
 *
 *  Just like callIndexAliasApi(), callFieldCapsApi() throws
 *  if no indexes are matched, but will return potentially
 *  "partial" results if even a single index is matched.
 *
 *  @param  {Function} callCluster bound function for accessing an es client
 *  @param  {Array<String>|String} indices
 *  @param  {Object} fieldCapsOptions
 *  @return {Promise<FieldCapsResponse>}
 */
export async function callFieldCapsApi(params: FieldCapsApiParams) {
  const {
    callCluster,
    indices,
    indexFilter,
    fieldCapsOptions = {
      allow_no_indices: false,
      include_unmapped: false,
    },
    fields = ['*'],
    expandWildcards,
    fieldTypes,
    includeEmptyFields,
    runtimeMappings,
    abortSignal,
    projectRouting,
  } = params;
  const requestOptions = {
    fields,
    ignore_unavailable: true,
    index_filter: indexFilter,
    expand_wildcards: expandWildcards,
    types: fieldTypes,
    include_empty_fields: includeEmptyFields ?? true,
    runtime_mappings: runtimeMappings,
    ...(projectRouting ? { project_routing: projectRouting } : {}),
    ...fieldCapsOptions,
  };
  const transportOptions = { meta: true as const, signal: abortSignal };
  try {
    const batches = getFieldCapsIndexBatches(indices);
    if (!batches) {
      return await callCluster.fieldCaps({ index: indices, ...requestOptions }, transportOptions);
    }

    const [firstBatch, ...remainingBatches] = batches;
    const firstResponse = await callCluster.fieldCaps(
      // Unmapped coverage is required to reconstruct a single logical response.
      { index: firstBatch, ...requestOptions, include_unmapped: true },
      transportOptions
    );
    const responseBodies: FieldCapsResponse[] = [firstResponse.body];
    // Sequential calls bound cluster load, preserve deterministic ordering, and
    // stop immediately when a batch fails.
    for (const batch of remainingBatches) {
      const response = await callCluster.fieldCaps(
        { index: batch, ...requestOptions, include_unmapped: true },
        transportOptions
      );
      responseBodies.push(response.body);
    }

    return {
      // Only the body is aggregateable; consumers expect the first call's transport metadata.
      ...firstResponse,
      body: mergeFieldCapsResponses(responseBodies, fieldCapsOptions.include_unmapped === true),
    };
  } catch (error) {
    // return an empty set for closed indices
    if (
      error.message.startsWith('index_closed_exception') ||
      error.message.startsWith('cluster_block_exception')
    ) {
      return { body: { indices: [], fields: {} } };
    }
    throw convertEsError(indices, error);
  }
}
