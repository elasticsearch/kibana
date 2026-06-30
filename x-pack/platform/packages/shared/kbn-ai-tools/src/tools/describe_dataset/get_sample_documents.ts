/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  MappingRuntimeFields,
  QueryDslFieldAndFormat,
  QueryDslQueryContainer,
  SearchHit,
} from '@elastic/elasticsearch/lib/api/types';
import { esql, type ComposerQuery, type ComposerQueryTagHole } from '@elastic/esql';
import type { ESQLAstExpression } from '@elastic/esql/types';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { ESQLSearchResponse } from '@kbn/es-types';
import { kqlQuery, dateRangeQuery } from '@kbn/es-query';
import { castArray } from 'lodash';
import {
  parseEsqlSourceDocuments,
  getEsqlDocumentId,
} from '../../utils/parse_esql_source_documents';

const SAMPLE_PROBABILITY_FACTOR = 3;
const SAMPLE_LIMIT_FACTOR = 10;

type WhereCondition = ESQLAstExpression & ComposerQueryTagHole;

interface GetSampleDocumentsEsqlParams {
  esClient: ElasticsearchClient;
  index: string | string[];
  start: number;
  end: number;
  kql?: string;
  size?: number;
  sampleSize?: number;
  whereCondition?: WhereCondition;
  /**
   * Controls the ES|QL `SET unmapped_fields=...` prefix:
   * - `'LOAD'` reads unmapped fields from `_source` (used by the entity-filter
   *   sampling arm to query source-only fields).
   * - `'NULLIFY'` nullifies unmapped fields so full-text-search functions like
   *   `MATCH_PHRASE` skip them silently instead of raising
   *   `verification_exception: Unknown column [...]`.
   * Omitted means ES|QL uses its default unmapped-field behavior (any direct
   * reference to an unmapped column is a verification error).
   */
  unmappedFields?: 'LOAD' | 'NULLIFY';
  /**
   * Optional Query DSL filter clauses forwarded as the ES|QL `_query` request's
   * `filter` parameter. ES applies these at the request layer (before the ES|QL
   * pipeline runs), so callers can pass raw fixture-style DSL (`term`, `terms`,
   * `match`, `match_phrase`, `exists`, `bool { should, minimum_should_match }`,
   * ...) without translating to KQL. Multiple clauses are ANDed with the
   * internal date-range filter.
   */
  dslFilter?: QueryDslQueryContainer | QueryDslQueryContainer[];
}

interface GetSampleDocumentsEsqlResponse {
  hits: Array<SearchHit<Record<string, unknown>>>;
  total: number;
}

export function getSampleDocuments({
  esClient,
  index,
  start,
  end,
  kql,
  filter,
  size = 1000,
  fields = [
    {
      field: '*',
      include_unmapped: true,
    },
  ],
  _source = false,
  timeout = '5s',
  runtime_mappings,
}: {
  esClient: ElasticsearchClient;
  index: string | string[];
  start: number;
  end: number;
  kql?: string;
  size?: number;
  filter?: QueryDslQueryContainer | QueryDslQueryContainer[];
  fields?: Array<QueryDslFieldAndFormat | string>;
  _source?: boolean;
  timeout?: string;
  runtime_mappings?: MappingRuntimeFields;
}) {
  return esClient
    .search<Record<string, any>>({
      index,
      size,
      track_total_hits: true,
      timeout,
      runtime_mappings,
      query: {
        bool: {
          must: [...kqlQuery(kql), ...dateRangeQuery(start, end), ...castArray(filter ?? [])],
          should: [
            {
              function_score: {
                functions: [
                  {
                    random_score: {},
                  },
                ],
              },
            },
          ],
        },
      },
      sort: {
        _score: {
          order: 'desc',
        },
      },
      _source,
      fields,
    })
    .then((response) => ({
      hits: response.hits.hits as Array<SearchHit<Record<string, any>>>,
      total:
        typeof response.hits.total === 'number'
          ? response.hits.total!
          : response.hits.total?.value!,
    }));
}

/**
 * ES|QL-native companion to `getSampleDocuments` for callers that must sample
 * from remote clusters or external data sources where classic search APIs are
 * not available. The helper returns `_source`-backed hits instead of `fields`
 * hits, which keeps downstream document formatting compatible while avoiding
 * Query DSL.
 *
 * When `sampleSize` is provided, ES|QL has no `random_score` equivalent, and
 * `SAMPLE p | LIMIT n` returns sampled rows in storage order. To preserve the
 * old random-sampling behavior, this first counts the matching population,
 * oversamples with `SAMPLE`, shuffles the returned rows client-side, then trims
 * to the requested size.
 *
 * `unmappedFields` emits `SET unmapped_fields="<mode>"` so ES|QL predicates
 * can evaluate source-only fields (`'LOAD'`, replaces the older fieldCaps +
 * runtime_mappings path for entity-filtered sampling) or silently nullify
 * unmapped columns (`'NULLIFY'`, required when the `WHERE` includes
 * `MATCH_PHRASE` / `MATCH` against fields that may not be mapped on every
 * backing index — DSL `match_phrase` no-matches missing fields, but bare
 * ES|QL full-text functions raise `verification_exception` instead).
 */
export async function getSampleDocumentsEsql({
  esClient,
  index,
  start,
  end,
  kql,
  size = 1000,
  sampleSize,
  whereCondition,
  unmappedFields,
  dslFilter,
}: GetSampleDocumentsEsqlParams): Promise<GetSampleDocumentsEsqlResponse> {
  const indices = Array.isArray(index) ? index : [index];
  const extraDslClauses = dslFilter ? castArray(dslFilter) : [];
  const filter = {
    bool: { filter: [...dateRangeQuery(start, end), ...extraDslClauses] },
  };

  const whereExpression = buildWhereExpression({ kql, whereCondition });
  const printQuery = (query: ComposerQuery) => {
    if (unmappedFields) {
      query.addSetCommand('unmapped_fields', unmappedFields);
    }
    return query.print('basic');
  };

  const buildQuery = ({
    sampleProbability,
    limit,
  }: {
    sampleProbability?: number;
    limit?: number;
  } = {}) => {
    let query = esql.from(indices, ['_id', '_source']);
    if (whereExpression) {
      query = query.where`${whereExpression}`;
    }
    if (sampleProbability !== undefined && sampleProbability < 1) {
      query = query.sample(sampleProbability);
    }
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return printQuery(query);
  };

  const buildCountQuery = () => {
    let query = esql.from(indices);
    if (whereExpression) {
      query = query.where`${whereExpression}`;
    }
    query = query.pipe`STATS total = COUNT(*)`;
    return printQuery(query);
  };

  if (sampleSize !== undefined) {
    if (sampleSize <= 0) {
      return { hits: [], total: 0 };
    }

    const countResponse = (await esClient.esql.query({
      query: buildCountQuery(),
      filter,
      drop_null_columns: true,
    })) as unknown as ESQLSearchResponse;

    const total = getCount(countResponse);
    if (total === 0) {
      return { hits: [], total: 0 };
    }

    const sampleProbability = Math.min(1, (SAMPLE_PROBABILITY_FACTOR * sampleSize) / total);
    const sampleLimit = SAMPLE_LIMIT_FACTOR * sampleSize;
    const sampleResponse = (await esClient.esql.query({
      query: buildQuery({ sampleProbability, limit: sampleLimit }),
      filter,
      drop_null_columns: true,
    })) as unknown as ESQLSearchResponse;

    const hits = parseHits(sampleResponse);
    shuffleInPlace(hits); // This is very important, read the function jsdoc for more information
    return { hits: hits.slice(0, sampleSize), total: hits.length };
  }

  const response = (await esClient.esql.query({
    query: buildQuery({ limit: size }),
    filter,
    drop_null_columns: true,
  })) as unknown as ESQLSearchResponse;
  const hits = parseHits(response);
  return { hits, total: hits.length };
}

function buildWhereExpression({
  kql,
  whereCondition,
}: {
  kql?: string;
  whereCondition?: WhereCondition;
}) {
  const kqlCondition = kql ? esql.exp`KQL(${esql.str(kql)})` : undefined;

  if (kqlCondition && whereCondition) {
    return esql.exp`${kqlCondition} AND ${whereCondition}`;
  }
  return kqlCondition ?? whereCondition;
}

function parseHits(response: ESQLSearchResponse): Array<SearchHit<Record<string, unknown>>> {
  return parseEsqlSourceDocuments(response).map((doc) => ({
    _index: '',
    _id: getEsqlDocumentId(doc),
    _source: doc.source,
  }));
}

function getCount(response: ESQLSearchResponse): number {
  const total = response.values[0]?.[0];
  return typeof total === 'number' ? total : 0;
}

/**
 * Fisher-Yates shuffle.
 *
 * The old DSL path sorted by `function_score.random_score`, so both the selected
 * documents and their returned order were random. ES|QL `SAMPLE` randomly
 * includes rows, but the resulting rows still come back in storage order; without
 * this shuffle, taking the first N rows after oversampling would reintroduce an
 * ordering bias.
 */
function shuffleInPlace<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}
