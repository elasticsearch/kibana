/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsqlQueryResponse } from '@elastic/elasticsearch/lib/api/types';
import type { IScopedClusterClient } from '@kbn/core/server';
import type {
  SignificantEventsGetResponse,
  SignificantEventsResponse,
} from '@kbn/significant-events-schema';
import { MS_PER_UNIT } from '@kbn/streams-schema';
import { isEsqlUnknownIndexError } from '@kbn/storage-adapter';
import { chunk, isEmpty } from 'lodash';
import pLimit from 'p-limit';
import type { QueryLink, SearchMode } from '../../../common/queries';
import type { KnowledgeIndicatorClient } from '../streams/ki';
import type { RuleUnbackedFilter } from '../streams/ki';
import { parseError } from '../streams/errors/parse_error';
import { SecurityError } from '../streams/errors/security_error';
import { getColumnIndex } from '../streams/helpers/esql';
import { type ISignificantEventsAlertsReader, ALERTS_READER_V1 } from './alerting/alerts_reader';
import { ESQL_UNITS, MAX_FILL_BUCKETS, parseBucketSize } from './helpers/fill_bucket_gaps';

export interface SparseBucket {
  date: string;
  count: number;
}

// Shared time-grid bucket: epoch ms + pre-rendered ISO string.
interface TimeBucket {
  ms: number;
  date: string;
}

export interface SignificantEventsParams {
  streamNames?: string[];
  from: Date;
  to: Date;
  bucketSize: string;
  query?: string;
  filters?: { ruleUnbacked?: RuleUnbackedFilter; queryIds?: string[]; minSeverityScore?: number };
  searchMode?: SearchMode;
  alertsReader?: ISignificantEventsAlertsReader;
}

export interface SignificantEventsDependencies {
  kiClient: KnowledgeIndicatorClient;
  scopedClusterClient: IScopedClusterClient;
}

export interface ComputeOccurrencesResult {
  sparseByRule: Map<string, SparseBucket[]>;
  aggregatedOccurrences: SparseBucket[];
  // Shared bucket grid (built once) for lazy per-rule gap-fill.
  timeline: TimeBucket[];
}

export interface QueryOccurrences extends ComputeOccurrencesResult {
  queryLinks: QueryLink[];
}

// Shared empty array for rules with no firings / missing alerts index.
const EMPTY_OCCURRENCES: SparseBucket[] = [];

// Empty stub: server no longer populates change_points; kept until consumers drop it.
const EMPTY_CHANGE_POINTS = { type: {} } as const;

// ES|QL caps results at result_truncation_max_size (default 10k) per request.
// Grouping by (rule_uuid × bucket) silently drops rules past the cap, so we
// batch rules under it and run batches in parallel.
const RESULT_CEILING = 10_000;

// Upper bound on parallel ES|QL requests when the per-rule fold spans multiple
// batches, so a large rule set can't fan out into hundreds of concurrent queries.
const BATCH_CONCURRENCY = 5;

function buildTimeline({
  from,
  to,
  intervalMs,
}: {
  from: Date;
  to: Date;
  intervalMs: number;
}): TimeBucket[] {
  const timeline: TimeBucket[] = [];
  const endMs = to.getTime();
  let current = Math.floor(from.getTime() / intervalMs) * intervalMs;
  while (current <= endMs && timeline.length < MAX_FILL_BUCKETS) {
    timeline.push({ ms: current, date: new Date(current).toISOString() });
    current += intervalMs;
  }
  return timeline;
}

/** Projects a rule's firing buckets onto a shared {@link TimeBucket} grid, zero-filling gaps. */
function fillTimeline({
  timeline,
  sparse,
}: {
  timeline: TimeBucket[];
  sparse: SparseBucket[];
}): SparseBucket[] {
  const countByMs = new Map(sparse.map(({ date, count }) => [Date.parse(date), count]));
  return timeline.map(({ ms, date }) => ({ date, count: countByMs.get(ms) ?? 0 }));
}

export async function fetchQueryLinks(
  {
    streamNames = [],
    query,
    filters,
    searchMode,
  }: Pick<SignificantEventsParams, 'streamNames' | 'query' | 'filters' | 'searchMode'>,
  kiClient: KnowledgeIndicatorClient
): Promise<QueryLink[]> {
  return query
    ? kiClient.findQueries(streamNames, query, filters, searchMode)
    : kiClient.getQueryLinks(streamNames, filters);
}

/**
 * Per-rule firing buckets for `ruleIds` plus the across-rules aggregate, in one
 * pass. Scope `ruleIds` to what the caller renders (e.g. one page) to keep the fold proportional.
 */
export async function computeOccurrences(
  {
    ruleIds,
    from,
    to,
    bucketSize,
    alertsReader = ALERTS_READER_V1,
  }: {
    ruleIds: string[];
    from: Date;
    to: Date;
    bucketSize: string;
    alertsReader?: ISignificantEventsAlertsReader;
  },
  { scopedClusterClient }: { scopedClusterClient: IScopedClusterClient }
): Promise<ComputeOccurrencesResult> {
  // "No data": empty per-rule map + empty (not zero-filled) aggregate.
  const emptyResult: ComputeOccurrencesResult = {
    sparseByRule: new Map(),
    aggregatedOccurrences: EMPTY_OCCURRENCES,
    timeline: [],
  };

  if (isEmpty(ruleIds)) {
    return emptyResult;
  }

  const { value, unit } = parseBucketSize(bucketSize);
  const esqlUnit = ESQL_UNITS[unit] ?? unit;
  const intervalMs = value * (MS_PER_UNIT[unit] ?? 1000);
  const ruleIdColumn = alertsReader.ruleIdColumn;

  // Build the grid once; reused by lazy per-rule fill and the aggregate.
  // `buckets` is capped at MAX_FILL_BUCKETS, so for ranges wider than the cap
  // the LIMIT below intentionally matches the truncated grid: SORT bucket ASC
  // keeps the earliest buckets, the only ones the timeline can render.
  const timeline = buildTimeline({ from, to, intervalMs });
  const buckets = Math.max(timeline.length, 1);

  // One row per (rule × bucket): batch rules under the row cap, run in parallel
  // but concurrency-capped so a large rule set can't flood ES with requests.
  const rulesPerBatch = Math.max(1, Math.floor(RESULT_CEILING / buckets));
  const batches = chunk(ruleIds, rulesPerBatch);
  const limiter = pLimit(BATCH_CONCURRENCY);

  const timeRangeFilter = {
    bool: {
      filter: [{ range: { '@timestamp': { gte: from.toISOString(), lte: to.toISOString() } } }],
    },
  };

  const runBatch = async (batchRuleIds: string[]): Promise<EsqlQueryResponse | null> => {
    try {
      return await scopedClusterClient.asCurrentUser.esql.query({
        ...alertsReader.buildOccurrencesEsqlRequest({
          ruleIds: batchRuleIds,
          value,
          esqlUnit,
          limit: batchRuleIds.length * buckets,
        }),
        filter: timeRangeFilter,
        drop_null_columns: true,
      });
    } catch (err) {
      const { type, message } = parseError(err);
      if (type === 'security_exception') {
        throw new SecurityError(`Cannot read occurrences, insufficient privileges: ${message}`, {
          cause: err instanceof Error ? err : new Error(String(err)),
        });
      }
      // Missing alerts index → batch contributes nothing; other
      // verification_exceptions (unknown column, mapping regression) rethrow.
      if (isEsqlUnknownIndexError(err)) {
        return null;
      }
      throw err;
    }
  };

  const responses = await Promise.all(
    batches.map((batchRuleIds) => limiter(() => runBatch(batchRuleIds)))
  );

  // Fold every batch into per-rule firing buckets and, in the same pass,
  // per-bucket totals across rules (by epoch ms) for the aggregate. A batch with
  // missing columns (schema regression) is skipped; usable only if at least one
  // batch returned columns, otherwise "no data".
  const sparseByRule = new Map<string, SparseBucket[]>();
  const totalByMs = new Map<number, number>();
  let hasData = false;
  for (const response of responses) {
    if (!response) continue;
    const countIdx = getColumnIndex(response, 'count');
    const ruleIdx = getColumnIndex(response, ruleIdColumn);
    const bucketIdx = getColumnIndex(response, 'bucket');
    if (countIdx === -1 || ruleIdx === -1 || bucketIdx === -1) continue;
    hasData = true;
    for (const row of response.values) {
      const ruleId = row[ruleIdx] as string;
      const date = row[bucketIdx] as string;
      const count = (row[countIdx] as number) ?? 0;
      const existing = sparseByRule.get(ruleId);
      if (existing) {
        existing.push({ date, count });
      } else {
        sparseByRule.set(ruleId, [{ date, count }]);
      }
      const ms = Date.parse(date);
      totalByMs.set(ms, (totalByMs.get(ms) ?? 0) + count);
    }
  }

  if (!hasData) {
    return emptyResult;
  }

  // Grid covers the all-zero case too, so the histogram renders flat not empty.
  const aggregatedOccurrences = timeline.map(({ ms, date }) => ({
    date,
    count: totalByMs.get(ms) ?? 0,
  }));

  return { sparseByRule, aggregatedOccurrences, timeline };
}

export async function getQueryOccurrences(
  params: SignificantEventsParams,
  dependencies: SignificantEventsDependencies
): Promise<QueryOccurrences> {
  const { kiClient, scopedClusterClient } = dependencies;
  const { from, to, bucketSize, alertsReader = ALERTS_READER_V1 } = params;

  const queryLinks = await fetchQueryLinks(params, kiClient);
  if (isEmpty(queryLinks)) {
    return {
      queryLinks: [],
      sparseByRule: new Map(),
      aggregatedOccurrences: EMPTY_OCCURRENCES,
      timeline: [],
    };
  }

  const ruleIds = [...new Set(queryLinks.map((queryLink) => queryLink.rule_id))];
  const occurrences = await computeOccurrences(
    { ruleIds, from, to, bucketSize, alertsReader },
    { scopedClusterClient }
  );
  return { queryLinks, ...occurrences };
}

/** Gap-fills one rule's occurrences; silent rules get `[]` (see {@link EMPTY_OCCURRENCES}). */
export function buildQueryOccurrences({
  queryLink,
  queryOccurrences,
}: {
  queryLink: QueryLink;
  queryOccurrences: QueryOccurrences;
}): SparseBucket[] {
  const sparse = queryOccurrences.sparseByRule.get(queryLink.rule_id);
  return sparse ? fillTimeline({ timeline: queryOccurrences.timeline, sparse }) : EMPTY_OCCURRENCES;
}

/** Builds a full significant-events response row (query fields + occurrences). */
export function toSignificantEventResponse({
  queryLink,
  queryOccurrences,
}: {
  queryLink: QueryLink;
  queryOccurrences: QueryOccurrences;
}): SignificantEventsResponse {
  return {
    ...queryLink.query,
    stream_name: queryLink.stream_name,
    occurrences: buildQueryOccurrences({ queryLink, queryOccurrences }),
    change_points: EMPTY_CHANGE_POINTS,
    rule_backed: queryLink.rule_backed,
  };
}

export async function fetchQueryOccurrencesFromAlerts(
  params: SignificantEventsParams,
  dependencies: SignificantEventsDependencies
): Promise<SignificantEventsGetResponse> {
  const queryOccurrences = await getQueryOccurrences(params, dependencies);
  return {
    significant_events: queryOccurrences.queryLinks.map((queryLink) =>
      toSignificantEventResponse({ queryLink, queryOccurrences })
    ),
    aggregated_occurrences: queryOccurrences.aggregatedOccurrences,
  };
}
