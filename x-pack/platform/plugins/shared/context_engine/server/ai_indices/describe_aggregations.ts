/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { isResponseError } from '@kbn/es-errors';
import {
  MAX_AI_INDEX_DESCRIBE_TAG_COUNTS,
  MAX_AI_INDEX_DESCRIBE_TYPE_COUNTS,
} from '../../common/constants';
import type { KiTypeCount } from '../../common/http_api/ai_indices';
import { buildAiIndexSpaceFilter } from '../../common/space_filter';
import type { AiIndexField, AiIndexTagCount } from './types';

const KI_TYPE_FIELD = 'type';
const KI_TAGS_FIELD = 'tags';

/** Bucket keys must be strings: `conflict` and numeric mappings are excluded by construction. */
const KEYWORD_TYPES: ReadonlySet<string> = new Set(['keyword', 'constant_keyword', 'wildcard']);

interface TermsBuckets {
  buckets: Array<{ key: string; doc_count: number }>;
}

interface DescribeAggregations {
  types?: TermsBuckets;
  tags?: TermsBuckets;
}

export interface AiIndexAggregationsDescription {
  kiTypeCounts: KiTypeCount[];
  tagCounts: AiIndexTagCount[];
}

export interface DescribeAiIndexAggregationsParams {
  esClient: ElasticsearchClient;
  target: string;
  spaceId: string;
  fields: AiIndexField[];
}

const NO_COUNTS: AiIndexAggregationsDescription = { kiTypeCounts: [], tagCounts: [] };

const isAggregatableKeyword = (fields: AiIndexField[], path: string): boolean =>
  fields.some(
    (field) => field.path === path && field.aggregatable && KEYWORD_TYPES.has(field.type)
  );

/**
 * Space-filtered `terms` counts on `type` / `tags`; each skipped unless an aggregatable keyword.
 * Shard failures error out rather than return undercounts. A 403 (caller lacks `read` on the
 * backing indices) yields no counts instead of failing the whole describe.
 */
export const describeAiIndexAggregations = async ({
  esClient,
  target,
  spaceId,
  fields,
}: DescribeAiIndexAggregationsParams): Promise<AiIndexAggregationsDescription> => {
  const hasType = isAggregatableKeyword(fields, KI_TYPE_FIELD);
  const hasTags = isAggregatableKeyword(fields, KI_TAGS_FIELD);
  if (!hasType && !hasTags) {
    return NO_COUNTS;
  }

  try {
    const response = await esClient.search<never, DescribeAggregations>({
      index: target,
      ignore_unavailable: true,
      allow_no_indices: true,
      allow_partial_search_results: false,
      size: 0,
      track_total_hits: false,
      query: buildAiIndexSpaceFilter(spaceId),
      aggs: {
        ...(hasType && {
          types: {
            terms: {
              field: KI_TYPE_FIELD,
              size: MAX_AI_INDEX_DESCRIBE_TYPE_COUNTS,
              order: [{ _count: 'desc' }, { _key: 'asc' }],
            },
          },
        }),
        ...(hasTags && {
          tags: {
            terms: {
              field: KI_TAGS_FIELD,
              size: MAX_AI_INDEX_DESCRIBE_TAG_COUNTS,
              order: [{ _count: 'desc' }, { _key: 'asc' }],
            },
          },
        }),
      },
    });

    const { types, tags } = response.aggregations ?? {};
    return {
      kiTypeCounts: (types?.buckets ?? []).map(({ key, doc_count }) => ({
        type: key,
        count: doc_count,
      })),
      tagCounts: (tags?.buckets ?? []).map(({ key, doc_count }) => ({
        tag: key,
        count: doc_count,
      })),
    };
  } catch (error) {
    if (isResponseError(error) && error.statusCode === 403) {
      return NO_COUNTS;
    }
    throw error;
  }
};
