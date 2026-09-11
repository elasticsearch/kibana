/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsqlNamedValue } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core/server';
import { isMaximumResponseSizeExceededError } from '@kbn/es-errors';
import {
  DEFAULT_AI_INDEX_QUERY_LIMIT,
  MAX_AI_INDEX_QUERY_RESPONSE_BYTES,
} from '../../common/constants';
import type {
  QueryAiIndicesRequest,
  QueryAiIndicesResponse,
} from '../../common/http_api/ai_indices';
import { buildAiIndexSpaceFilter } from '../../common/space_filter';
import { validateQueryAiIndicesRequest } from '../../common/validation';
import { applyLimit } from './apply_limit';
import { AiIndexQueryResponseTooLargeError, InvalidAiIndexQueryError } from './errors';

export interface QueryAiIndicesParams extends QueryAiIndicesRequest {
  esClient: ElasticsearchClient;
  spaceId: string;
}

/**
 * Runs caller-supplied ES|QL with server-owned space filter and row cap.
 * `allow_partial_results` may silently drop failed shards.
 */
export const queryAiIndices = async ({
  esClient,
  spaceId,
  query,
  params,
  limit,
}: QueryAiIndicesParams): Promise<QueryAiIndicesResponse> => {
  const validationError = validateQueryAiIndicesRequest({ query, params, limit });
  if (validationError) {
    throw new InvalidAiIndexQueryError(validationError);
  }

  const namedParams: EsqlNamedValue[] = Object.entries(params ?? {}).map(([name, value]) => ({
    [name]: value,
  }));

  try {
    const { columns, values } = await esClient.esql.query(
      {
        query: applyLimit(query, limit ?? DEFAULT_AI_INDEX_QUERY_LIMIT),
        filter: buildAiIndexSpaceFilter(spaceId),
        drop_null_columns: true,
        allow_partial_results: true,
        ...(namedParams.length > 0 ? { params: namedParams } : {}),
      },
      { maxResponseSize: MAX_AI_INDEX_QUERY_RESPONSE_BYTES }
    );
    return { columns, values };
  } catch (error) {
    if (isMaximumResponseSizeExceededError(error)) {
      throw new AiIndexQueryResponseTooLargeError(MAX_AI_INDEX_QUERY_RESPONSE_BYTES);
    }
    throw error;
  }
};
