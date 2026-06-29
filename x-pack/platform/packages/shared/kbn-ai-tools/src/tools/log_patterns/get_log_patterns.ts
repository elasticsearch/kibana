/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AggregationsAggregationContainer,
  AggregationsCategorizeTextAggregation,
  AggregationsDateHistogramAggregation,
  AggregationsMaxAggregation,
  AggregationsMinAggregation,
  AggregationsTopHitsAggregation,
  QueryDslQueryContainer,
} from '@elastic/elasticsearch/lib/api/types';
import { categorizationAnalyzer } from '@kbn/aiops-log-pattern-analysis/categorization_analyzer';
import type { ChangePointType } from '@kbn/es-types/src';
import type { ESQLSearchResponse } from '@kbn/es-types';
import { calculateAuto } from '@kbn/calculate-auto';
import { omit, orderBy, uniqBy } from 'lodash';
import moment from 'moment';
import type { TracedElasticsearchClient } from '@kbn/traced-es-client';
import { kqlQuery, dateRangeQuery } from '@kbn/es-query';
import { buildCountQuery } from '../../utils/build_count_query';
import { getEsqlColumnSchema } from '../../utils/get_esql_column_schema';
import { pValueToLabel } from '../../utils/p_value_to_label';
import {
  buildCategorizeWithSampleQuery,
  parseCategorizeWithSampleRows,
} from '../../utils/esql_categorize';

const MAX_DOCS_TO_SAMPLE = 100_000;

// SigEvents asks the LLM for a small common/rare pattern summary. Pulling a
// bounded long tail from one ES|QL categorization query avoids reimplementing
// the DSL helper's second rare-pattern aggregation, while still giving
// selectLogPatternsForLlm enough sorted rows to take the head and tail.
const SIGNIFICANT_EVENTS_PASS1_LIMIT = 1000;

interface FieldPatternResultBase {
  field: string;
  count: number;
  pattern: string;
  regex: string;
  sample: string;
  firstOccurrence: string;
  lastOccurrence: string;
  highlight: Record<string, string[]>;
  metadata: Record<string, unknown[] | undefined>;
}

interface FieldPatternResultChanges {
  timeseries: Array<{ x: number; y: number }>;
  change: {
    timestamp?: string;
    significance: 'high' | 'medium' | 'low' | null;
    type: ChangePointType;
    change_point?: number;
    p_value?: number;
  };
}

export type FieldPatternResult<TChanges extends boolean | undefined = undefined> =
  FieldPatternResultBase & (TChanges extends true ? FieldPatternResultChanges : {});

export type FieldPatternResultWithChanges = FieldPatternResult<true>;

export interface LogPatternEsqlEntry {
  field: string;
  pattern: string;
  count: number;
  sample: string;
}

interface CategorizeTextOptions {
  query: QueryDslQueryContainer;
  metadata: string[];
  esClient: TracedElasticsearchClient;
  samplingProbability: number;
  fields: string[];
  index: string | string[];
  useMlStandardTokenizer: boolean;
  size: number;
  start: number;
  end: number;
}

type CategorizeTextSubAggregations = Record<string, AggregationsAggregationContainer> & {
  sample: { top_hits: AggregationsTopHitsAggregation };
  minTimestamp: { min: AggregationsMinAggregation };
  maxTimestamp: { max: AggregationsMaxAggregation };
};

interface CategorizeTextAggregationResult {
  categorize_text: AggregationsCategorizeTextAggregation;
  aggs: CategorizeTextSubAggregations &
    (
      | {}
      | {
          timeseries: { date_histogram: AggregationsDateHistogramAggregation };
          changes: { change_point: { buckets_path: string } };
        }
    );
}

export async function runCategorizeTextAggregation<
  TChanges extends boolean | undefined = undefined
>(
  options: CategorizeTextOptions & { includeChanges?: TChanges }
): Promise<Array<FieldPatternResult<TChanges>>>;

export async function runCategorizeTextAggregation({
  esClient,
  fields,
  metadata,
  index,
  query,
  samplingProbability,
  useMlStandardTokenizer,
  includeChanges,
  size,
  start,
  end,
}: CategorizeTextOptions & { includeChanges?: boolean }): Promise<
  Array<FieldPatternResult<boolean>>
> {
  const aggs = Object.fromEntries(
    fields.map((field): [string, CategorizeTextAggregationResult] => [
      field,
      {
        categorize_text: {
          field,
          min_doc_count: 1,
          size,
          categorization_analyzer: useMlStandardTokenizer
            ? {
                tokenizer: 'ml_standard',
                char_filter: [
                  {
                    type: 'pattern_replace',
                    pattern: '\\\\n',
                    replacement: '',
                  } as unknown as string,
                ],
              }
            : categorizationAnalyzer,
        },
        aggs: {
          minTimestamp: {
            min: {
              field: '@timestamp',
            },
          },
          maxTimestamp: {
            max: {
              field: '@timestamp',
            },
          },
          ...(includeChanges
            ? {
                timeseries: {
                  date_histogram: {
                    field: '@timestamp',
                    min_doc_count: 0,
                    extended_bounds: {
                      min: start,
                      max: end,
                    },
                    fixed_interval: `${calculateAuto
                      .atLeast(30, moment.duration(end - start, 'ms'))!
                      .asMilliseconds()}ms`,
                  },
                },
                changes: {
                  change_point: {
                    buckets_path: 'timeseries>_count',
                  },
                },
              }
            : {}),
          sample: {
            top_hits: {
              size: 1,
              _source: false,
              fields: [field, ...metadata],
              sort: {
                _score: {
                  order: 'desc',
                },
              },
              highlight: {
                fields: {
                  '*': {},
                },
              },
            },
          },
        },
      },
    ])
  );

  const response = await esClient.search('get_log_patterns', {
    index,
    size: 0,
    track_total_hits: false,
    timeout: '10s',
    query: {
      bool: {
        filter: [query, ...dateRangeQuery(start, end)],
      },
    },
    aggregations: {
      sampler: {
        random_sampler: {
          probability: samplingProbability,
        },
        aggs,
      },
    },
  });

  if (!response.aggregations) {
    return [];
  }

  const fieldAggregates = omit(response.aggregations.sampler, 'seed', 'doc_count', 'probability');

  return Object.entries(fieldAggregates).flatMap(([fieldName, aggregate]) => {
    const buckets = aggregate.buckets;

    return buckets.map((bucket) => {
      return {
        field: fieldName,
        count: bucket.doc_count,
        pattern: bucket.key,
        regex: bucket.regex,
        sample: bucket.sample.hits.hits[0].fields![fieldName]![0] as string,
        highlight: bucket.sample.hits.hits[0].highlight ?? {},
        metadata: bucket.sample.hits.hits[0].fields!,
        firstOccurrence: new Date(bucket.minTimestamp.value!).toISOString(),
        lastOccurrence: new Date(bucket.maxTimestamp.value!).toISOString(),
        ...('timeseries' in bucket
          ? {
              // @ts-expect-error timeseries result types can't be inferred
              timeseries: bucket.timeseries.buckets.map((dateBucket) => ({
                x: dateBucket.key,
                y: dateBucket.doc_count,
              })),
              // @ts-expect-error changes result types can't be inferred
              change: Object.entries(bucket.changes.type).map(
                ([changePointType, change]): FieldPatternResultChanges['change'] => {
                  return {
                    type: changePointType as ChangePointType,
                    significance:
                      // @ts-expect-error changes result types can't be inferred
                      change.p_value !== undefined ? pValueToLabel(change.p_value) : null,
                    // @ts-expect-error changes result types can't be inferred
                    change_point: change.change_point,
                    // @ts-expect-error changes result types can't be inferred
                    p_value: change.p_value,
                    timestamp:
                      // @ts-expect-error changes result types can't be inferred
                      change.change_point !== undefined
                        ? // @ts-expect-error changes and timeseries result types can't be inferred
                          bucket.timeseries.buckets[change.change_point].key_as_string
                        : undefined,
                  };
                }
              )[0],
            }
          : {}),
      };
    });
  });
}

interface LogPatternOptions {
  esClient: TracedElasticsearchClient;
  start: number;
  end: number;
  index: string | string[];
  fields: string[];
  metadata?: string[];
  kql?: string;
}

interface SigEventsLogPatternEsqlOptions {
  esClient: TracedElasticsearchClient;
  start: number;
  end: number;
  samplingSource: string;
  fields: string[];
  kql?: string;
}

export async function getLogPatterns<TChanges extends boolean | undefined = undefined>(
  options: LogPatternOptions & { includeChanges?: TChanges }
): Promise<Array<FieldPatternResult<TChanges>>>;

export async function getLogPatterns({
  esClient,
  start,
  end,
  index,
  kql,
  includeChanges,
  metadata = [],
  fields,
}: LogPatternOptions & { includeChanges?: boolean }): Promise<Array<FieldPatternResult<boolean>>> {
  const fieldCapsResponse = await esClient.fieldCaps('get_field_caps_for_log_pattern_analysis', {
    fields,
    index_filter: {
      bool: {
        filter: [...dateRangeQuery(start, end)],
      },
    },
    index,
    types: ['text', 'match_only_text'],
  });

  const fieldsInFieldCaps = Object.keys(fieldCapsResponse.fields);

  if (!fieldsInFieldCaps.length) {
    return [];
  }

  const totalDocsResponse = await esClient.search('get_total_docs_for_log_pattern_analysis', {
    index,
    size: 0,
    track_total_hits: true,
    query: {
      bool: {
        filter: [...kqlQuery(kql), ...dateRangeQuery(start, end)],
      },
    },
  });

  const totalHits = totalDocsResponse.hits.total.value;

  if (totalHits === 0) {
    return [];
  }

  let samplingProbability = 100_000 / totalHits;

  if (samplingProbability >= 0.5) {
    samplingProbability = 1;
  }

  const fieldGroups = includeChanges
    ? fieldsInFieldCaps.map((field) => [field])
    : [fieldsInFieldCaps];

  const allPatterns = await Promise.all(
    fieldGroups.map(async (fieldGroup) => {
      const topMessagePatterns = await runCategorizeTextAggregation({
        esClient,
        index,
        fields: fieldGroup,
        query: {
          bool: {
            filter: kqlQuery(kql),
          },
        },
        samplingProbability,
        useMlStandardTokenizer: false,
        size: 100,
        start,
        end,
        includeChanges,
        metadata,
      });

      if (topMessagePatterns.length === 0) {
        return [];
      }

      const patternsToExclude = topMessagePatterns.filter((pattern) => pattern.count >= 50);
      const excludeQueries = patternsToExclude.map((pattern) => {
        return {
          match: {
            [pattern.field]: {
              query: pattern.pattern,
              fuzziness: 0,
              operator: 'and' as const,
              auto_generate_synonyms_phrase_query: false,
            },
          },
        };
      });

      const rareMessagePatterns = await runCategorizeTextAggregation({
        esClient,
        index,
        fields: fieldGroup,
        start,
        end,
        query: {
          bool: {
            filter: kqlQuery(kql),
            must_not: excludeQueries,
          },
        },
        size: 1000,
        includeChanges,
        samplingProbability: 1,
        useMlStandardTokenizer: true,
        metadata,
      });

      return [...patternsToExclude, ...rareMessagePatterns];
    })
  );

  return uniqBy(
    orderBy(allPatterns.flat(), (pattern) => pattern.count, 'desc'),
    (pattern) => pattern.sample
  );
}

export async function getSigEventsLogPatternsEsql({
  esClient,
  start,
  end,
  samplingSource,
  kql,
  fields,
}: SigEventsLogPatternEsqlOptions): Promise<LogPatternEsqlEntry[]> {
  const columns = await getEsqlColumnSchema({
    esClient: esClient.client,
    index: samplingSource,
    start,
    end,
  });
  // ES|QL normalizes the `text` family in `column.type`: both `text` and
  // `match_only_text` mappings report as `text`.
  const textColumnNames = new Set(
    columns.filter((column) => column.type === 'text').map((column) => column.name)
  );
  const eligibleFields = fields.filter((field) => textColumnNames.has(field));

  if (!eligibleFields.length) {
    return [];
  }

  const totalDocs = await runEsqlCountQuery({
    esClient,
    samplingSource,
    start,
    end,
    kql,
  });
  if (totalDocs === 0) {
    return [];
  }

  const samplingProbability =
    MAX_DOCS_TO_SAMPLE / totalDocs < 0.5 ? MAX_DOCS_TO_SAMPLE / totalDocs : 1;
  const perField = await Promise.all(
    eligibleFields.map(async (field) => {
      // A single categorization query both groups the patterns and emits a
      // representative sample value per pattern via `TOP(<field>::keyword, 1)`.
      // This avoids the `_index`/`_id`/`_source` metadata round-trip, which ES|QL
      // views (e.g. query streams' `$.<name>` views) do not expose — `FROM <view>
      // METADATA _index, _id` raises `Unknown column [_index]`.
      const rows = await runSigEventsCategorize({
        esClient,
        samplingSource,
        start,
        end,
        kql,
        field,
        samplingProbability,
        limit: SIGNIFICANT_EVENTS_PASS1_LIMIT,
      });

      return rows.map((row) => ({
        field,
        pattern: row.pattern,
        // DSL random_sampler returns population-scaled doc_counts. ES|QL
        // SAMPLE returns sampled counts, so scale back for prompt parity.
        count: Math.round(row.count / samplingProbability),
        sample: row.sample,
      }));
    })
  );

  return uniqBy(
    // Preserve the DSL helper's downstream contract: sorted descending by count
    // and deduped by sample so `message` and `body.text` do not show the same
    // representative log line twice.
    perField.flat().sort((a, b) => b.count - a.count),
    (pattern) => pattern.sample
  );
}

async function runEsqlCountQuery({
  esClient,
  samplingSource,
  start,
  end,
  kql,
}: {
  esClient: TracedElasticsearchClient;
  samplingSource: string;
  start: number;
  end: number;
  kql?: string;
}): Promise<number> {
  const response = (await esClient.esql('count_docs_for_sigevents_log_patterns', {
    query: buildCountQuery({ index: samplingSource, kql }),
    filter: { bool: { filter: dateRangeQuery(start, end) } },
    drop_null_columns: true,
  })) as unknown as ESQLSearchResponse;
  const total = response.values[0]?.[0];

  return typeof total === 'number' ? total : 0;
}

async function runSigEventsCategorize({
  esClient,
  samplingSource,
  start,
  end,
  kql,
  field,
  samplingProbability,
  limit,
}: {
  esClient: TracedElasticsearchClient;
  samplingSource: string;
  start: number;
  end: number;
  kql?: string;
  field: string;
  samplingProbability: number;
  limit: number;
}): Promise<Array<{ count: number; pattern: string; sample: string }>> {
  const response = (await esClient.esql('categorize_sigevents_log_patterns', {
    query: buildCategorizeWithSampleQuery({
      indices: samplingSource,
      kql,
      field,
      samplingProbability,
      limit,
    }),
    filter: { bool: { filter: dateRangeQuery(start, end) } },
    drop_null_columns: true,
  })) as unknown as ESQLSearchResponse;

  return parseCategorizeWithSampleRows(response);
}
