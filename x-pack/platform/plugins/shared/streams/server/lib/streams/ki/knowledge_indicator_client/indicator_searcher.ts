/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RetrieverContainer } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { Feature, KnowledgeIndicator, QueryLink } from '@kbn/streams-schema';
import {
  isStoredFeatureKnowledgeIndicator,
  isStoredQueryKnowledgeIndicator,
  KNOWLEDGE_INDICATORS_DATA_STREAM,
  type StoredKnowledgeIndicator,
} from '../data_stream';
import { combineWhere, inPredicate, IS_NOT_DELETED, IS_NOT_EXCLUDED } from '../esql_helpers';
import {
  FEATURE_TYPE,
  KI_TYPE_FEATURE,
  KI_TYPE_QUERY,
  STREAM_NAME,
  TYPE,
  type KnowledgeIndicatorType,
} from '../fields';
import { fromStoredFeature, fromStoredQuery } from './serializers';
import { searchWithKeywordFallback } from '../../errors/search_with_keyword_fallback';
import type { SearchMode } from '../../../../../common/queries';
import type { SigEventsTuningConfig } from '../../../../../common/sig_events_tuning_config';
import type { RevisionReader } from './revision_reader';
import type { RuleUnbackedFilter } from './types';

const SEARCH_SIZE_LIMIT = 10_000;

export class IndicatorSearcher {
  constructor(
    private readonly esClient: ElasticsearchClient,
    private readonly logger: Logger,
    private readonly config: Pick<
      SigEventsTuningConfig,
      'semantic_min_score' | 'rrf_rank_constant'
    >,
    private readonly revisionReader: RevisionReader
  ) {}

  async findIndicators(
    streams: string | string[],
    query: string,
    options: {
      types?: KnowledgeIndicatorType[];
      searchMode?: SearchMode;
      limit?: number;
      includeExcluded?: boolean;
    } = {}
  ): Promise<{ hits: KnowledgeIndicator[] }> {
    const streamNames = Array.isArray(streams) ? streams : [streams];
    if (streamNames.length === 0) {
      return { hits: [] };
    }

    return searchWithKeywordFallback(
      this.logger,
      { searchMode: options.searchMode, label: 'KnowledgeIndicator', streamNames },
      (mode) => this.executeFindIndicators(mode, streamNames, query, options)
    );
  }

  async findFeatures(
    streams: string | string[],
    query: string,
    options: { searchMode?: SearchMode; limit?: number; includeExcluded?: boolean } = {}
  ): Promise<{ hits: Feature[] }> {
    const { hits } = await this.findIndicators(streams, query, {
      ...options,
      types: [KI_TYPE_FEATURE],
    });
    return {
      hits: hits.flatMap((h) => (h.type === 'feature' ? [h.feature] : [])),
    };
  }

  async findQueries(
    streams: string | string[],
    query: string,
    filters?: { ruleUnbacked?: RuleUnbackedFilter },
    searchMode?: SearchMode
  ): Promise<QueryLink[]> {
    const { hits } = await this.findIndicators(streams, query, {
      types: [KI_TYPE_QUERY],
      searchMode,
    });
    const queryLinks = hits.flatMap((h) => (h.type === 'query' ? [h.query] : []));
    if (!filters?.ruleUnbacked || filters.ruleUnbacked === 'include') {
      return queryLinks;
    }
    if (filters.ruleUnbacked === 'only') {
      return queryLinks.filter((q) => !q.rule_backed);
    }
    return queryLinks.filter((q) => q.rule_backed);
  }

  private async executeFindIndicators(
    mode: SearchMode,
    streamNames: string[],
    queryText: string,
    options: { types?: KnowledgeIndicatorType[]; limit?: number; includeExcluded?: boolean }
  ): Promise<{ hits: KnowledgeIndicator[] }> {
    // Phase 1: ES|QL latest-per-group reduction.
    const where = combineWhere(
      inPredicate(STREAM_NAME, streamNames),
      inPredicate(TYPE, options.types ?? [])
    );
    // Default: drop tombstones and excluded revisions. Queries don't write
    // `excluded`, so the filter is a no-op for them. `includeExcluded`
    // relaxes back to drop-tombstones-only.
    const postGroupingWhere = combineWhere(
      IS_NOT_DELETED,
      options.includeExcluded ? undefined : IS_NOT_EXCLUDED
    );
    const docs = await this.revisionReader.fetchLatestRevisions(where, postGroupingWhere);
    const docById = new Map(docs.map((d) => [`${d['stream.name']}:${d.type}:${d.id}`, d]));

    // Phase 2: rank via ES standard search on the latest doc subset. We
    // re-issue a search constrained by the (stream.name, type, id) tuples
    // we got back from phase 1. The data stream client doesn't expose the
    // raw ES client `_id` filter directly, so we scope by id terms.
    if (docById.size === 0) {
      return { hits: [] };
    }

    const ids = Array.from(new Set(docs.map((d) => d.id)));
    const limit = options.limit ?? SEARCH_SIZE_LIMIT;

    const filter: Array<Record<string, unknown>> = [
      { terms: { id: ids } },
      { terms: { 'stream.name': streamNames } },
    ];
    if (options.types?.length) {
      filter.push({ terms: { type: options.types } });
    }

    let retriever: RetrieverContainer;
    if (mode === 'keyword') {
      retriever = {
        standard: {
          query: this.buildKeywordQuery(queryText, filter, options.types),
        },
      };
    } else if (mode === 'semantic') {
      retriever = {
        linear: {
          retrievers: [
            {
              retriever: {
                standard: {
                  query: { match: { search_embedding: queryText } },
                  filter: { bool: { filter } },
                },
              },
              weight: 1,
              normalizer: 'minmax',
            },
          ],
          rank_window_size: limit,
          min_score: this.config.semantic_min_score,
        },
      };
    } else {
      retriever = {
        rrf: {
          retrievers: [
            { standard: { query: this.buildKeywordQuery(queryText, [], options.types) } },
            {
              linear: {
                retrievers: [
                  {
                    retriever: {
                      standard: { query: { match: { search_embedding: queryText } } },
                    },
                    weight: 1,
                    normalizer: 'minmax',
                  },
                ],
                rank_window_size: limit,
                min_score: this.config.semantic_min_score,
              },
            },
          ],
          filter: { bool: { filter } },
          rank_window_size: limit,
          rank_constant: this.config.rrf_rank_constant,
        },
      };
    }

    const response = await this.esClient.search({
      index: KNOWLEDGE_INDICATORS_DATA_STREAM,
      size: limit,
      track_total_hits: true,
      retriever,
    });

    // Walk the ranked rows and surface each group once, in rank order. A row
    // only counts if its @timestamp matches the group's latest revision — that
    // keeps the search scoped to current state (a stale revision matching the
    // query must not resurface its group). We emit the authoritative latest doc
    // from phase 1 rather than the matched row, so a same-timestamp tie can't
    // surface a non-latest payload. A Set is enough to dedupe.
    const seen = new Set<string>();
    const hits: KnowledgeIndicator[] = [];
    for (const hit of response.hits.hits) {
      const source = hit._source as StoredKnowledgeIndicator | undefined;
      if (!source) continue;
      const key = `${source['stream.name']}:${source.type}:${source.id}`;
      if (seen.has(key)) continue;
      const latest = docById.get(key);
      if (
        !latest ||
        new Date(latest['@timestamp']).getTime() !== new Date(source['@timestamp']).getTime()
      ) {
        continue;
      }
      seen.add(key);
      if (isStoredFeatureKnowledgeIndicator(latest)) {
        hits.push({ type: 'feature', feature: fromStoredFeature(latest) });
      } else if (isStoredQueryKnowledgeIndicator(latest)) {
        hits.push({ type: 'query', query: fromStoredQuery(latest) });
      }
    }

    return { hits };
  }

  private buildKeywordQuery(
    queryText: string,
    filter: Array<Record<string, unknown>>,
    types: KnowledgeIndicatorType[] = []
  ): Record<string, unknown> {
    const escaped = queryText.replace(/[\\*?]/g, '\\$&');
    const wildcard = (field: string, boost?: number) => ({
      wildcard: {
        [field]: {
          value: `*${escaped}*`,
          case_insensitive: true,
          ...(boost !== undefined ? { boost } : {}),
        },
      },
    });

    const featureShould = [
      wildcard('title', 3),
      wildcard('description', 2),
      wildcard(FEATURE_TYPE),
      wildcard('feature.subtype'),
      wildcard('tags'),
    ];

    const queryShould = [
      wildcard('title', 3),
      wildcard('description', 2),
      wildcard('query.esql'),
      wildcard('query.features.id'),
    ];

    let should: Array<Record<string, unknown>>;
    if (types.length === 0 || (types.includes(KI_TYPE_FEATURE) && types.includes(KI_TYPE_QUERY))) {
      should = [...featureShould, ...queryShould];
    } else if (types.includes(KI_TYPE_FEATURE)) {
      should = featureShould;
    } else {
      should = queryShould;
    }

    return {
      bool: {
        filter,
        should,
        minimum_should_match: 1,
      },
    };
  }
}
