/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  MsearchRequestItem,
  MsearchResponseItem,
  QueryDslQueryContainer,
} from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { AiIndexHttpItem } from '../../common/http_api/ai_indices';
import { buildAiIndexSpaceFilter } from '../../common/space_filter';

/**
 * `visible`: docs in this space. `empty`: no readable docs, or no index yet. `hidden`: readable
 * docs, none in this space. `unknown`: probe failed or incomplete, typically missing `read`.
 */
export type AiIndexVisibility = 'visible' | 'empty' | 'hidden' | 'unknown';

interface AiIndexVisibilityResult {
  aiIndex: AiIndexHttpItem;
  visibility: AiIndexVisibility;
}

interface ResolveAiIndexVisibilityParams {
  esClient: ElasticsearchClient;
  aiIndices: AiIndexHttpItem[];
  spaceId: string;
  logger: Logger;
}

/** Strict index options on purpose: `ignore_unavailable` silently drops unreadable indices. */
const probe = (target: string, query: QueryDslQueryContainer): MsearchRequestItem[] => [
  { index: target, allow_partial_search_results: false },
  { size: 1, _source: false, terminate_after: 1, track_total_hits: false, query },
];

const hasHits = (item: MsearchResponseItem): boolean =>
  !('error' in item) && item.hits.hits.length > 0;

const isNotFound = (item: MsearchResponseItem): boolean =>
  'error' in item && item.error.type === 'index_not_found_exception';

/** Single expression only: `existing,missing` is also a 404. */
const isEmptyTarget = (
  target: string,
  anyDocs: MsearchResponseItem,
  visibleDocs: MsearchResponseItem
) => !target.includes(',') && isNotFound(anyDocs) && isNotFound(visibleDocs);

/** Error, timeout, or failed shard; undefined when the probe can be trusted. */
const failureReason = (item: MsearchResponseItem): string | undefined => {
  if ('error' in item) {
    return item.error.reason ?? item.error.type;
  }
  if (item.timed_out) {
    return 'timed out';
  }
  if (item._shards.failed > 0) {
    return `${item._shards.failed} shard(s) failed`;
  }
  return undefined;
};

/** One `msearch` as the caller, two probes per AI Index: any docs, and any visible in `spaceId`. */
export const resolveAiIndexVisibility = async ({
  esClient,
  aiIndices,
  spaceId,
  logger,
}: ResolveAiIndexVisibilityParams): Promise<AiIndexVisibilityResult[]> => {
  if (aiIndices.length === 0) {
    return [];
  }

  const spaceFilter = buildAiIndexSpaceFilter(spaceId);
  const { responses } = await esClient.msearch({
    searches: aiIndices.flatMap(({ dest }) => [
      ...probe(dest.value, { match_all: {} }),
      ...probe(dest.value, spaceFilter),
    ]),
  });

  return aiIndices.map((aiIndex, index) => {
    const anyDocs = responses[2 * index];
    const visibleDocs = responses[2 * index + 1];
    if (isEmptyTarget(aiIndex.dest.value, anyDocs, visibleDocs)) {
      return { aiIndex, visibility: 'empty' };
    }
    const failure = failureReason(anyDocs) ?? failureReason(visibleDocs);
    if (failure !== undefined) {
      logger.debug(`AI index '${aiIndex.id}' visibility unknown: ${failure}`);
      return { aiIndex, visibility: 'unknown' };
    }
    if (hasHits(visibleDocs)) {
      return { aiIndex, visibility: 'visible' };
    }
    return { aiIndex, visibility: hasHits(anyDocs) ? 'hidden' : 'empty' };
  });
};
