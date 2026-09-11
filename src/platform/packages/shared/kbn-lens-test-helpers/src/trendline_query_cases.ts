/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Shared trendline rewrite case matrix for ES|QL metric charts.
 *
 * Single source of truth consumed by two layers:
 * - unit tests (this package): assert the generated query and time field for
 *   every case — fast first line of defense, no infra required
 * - Scout API tests (Lens plugin): execute the source and generated queries
 *   against a real Elasticsearch to catch regressions in query validity,
 *   result schema, and ES-side semantics (e.g. FORK schema merging)
 *
 * Queries reference fields of the `kibana_sample_data_logstsdb` ES archive
 * (`bytes`, `bytes_gauge`, `phpmemory`, `request`, `@timestamp`) so every
 * case is executable when bound to that index.
 */
export interface TrendlineQueryCase {
  readonly description: string;
  readonly sourceQuery: string;
  readonly expectedQuery: string;
  readonly expectedTimeField: string;
  readonly expectedMetricFields: readonly string[];
  readonly metricFields?: readonly string[];
  readonly groupByFields?: readonly string[];
  /** When set, unit consumers assert the generated metricFieldMap equals this record. */
  readonly expectedMetricFieldMap?: Readonly<Record<string, string>>;
}

export const buildTrendlineQueryCases = ({ index }: { index: string }): TrendlineQueryCase[] => {
  const tsQuery = `TS ${index} | STATS avg_bytes = AVG(AVG_OVER_TIME(bytes_gauge)) BY TBUCKET(100)`;
  const aliasedTsQuery = `TS ${index} | STATS avg_bytes = AVG(AVG_OVER_TIME(bytes_gauge)) BY custom_time_bucket = TBUCKET(100)`;

  return [
    {
      description: 'TS query with TBUCKET',
      sourceQuery: tsQuery,
      expectedQuery: tsQuery,
      expectedTimeField: 'TBUCKET(100)',
      expectedMetricFields: ['avg_bytes'],
    },
    {
      description: 'TS query with aliased TBUCKET',
      sourceQuery: aliasedTsQuery,
      expectedQuery: aliasedTsQuery,
      expectedTimeField: 'custom_time_bucket',
      expectedMetricFields: ['avg_bytes'],
    },
    {
      description: 'regular source query',
      sourceQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes)`,
      expectedQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['avg_bytes'],
      expectedMetricFieldMap: {},
    },
    {
      description: 'raw query without STATS',
      sourceQuery: `FROM ${index} | KEEP bytes`,
      expectedQuery: `FROM ${index} | KEEP bytes, @timestamp | STATS AVG(bytes) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['AVG(bytes)'],
      metricFields: ['bytes'],
      expectedMetricFieldMap: { bytes: 'AVG(bytes)' },
    },
    {
      description: 'raw query with breakdown',
      sourceQuery: `FROM ${index}`,
      expectedQuery: `FROM ${index} | STATS AVG(bytes) BY request, BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['AVG(bytes)', 'request'],
      metricFields: ['bytes'],
      groupByFields: ['request'],
      expectedMetricFieldMap: { bytes: 'AVG(bytes)' },
    },
    {
      description: 'TS query without TBUCKET',
      sourceQuery: `TS ${index} | STATS avg_bytes = AVG(AVG_OVER_TIME(bytes_gauge)) BY request`,
      expectedQuery: `TS ${index} | STATS avg_bytes = AVG(AVG_OVER_TIME(bytes_gauge)) BY request, TBUCKET(75)`,
      expectedTimeField: 'TBUCKET(75)',
      expectedMetricFields: ['avg_bytes', 'request'],
    },
    {
      description: 'FROM query with existing TBUCKET',
      sourceQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY TBUCKET(100)`,
      expectedQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY TBUCKET(100)`,
      expectedTimeField: 'TBUCKET(100)',
      expectedMetricFields: ['avg_bytes'],
    },
    {
      description: 'FROM query with aliased TBUCKET',
      sourceQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY time_bucket = TBUCKET(100)`,
      expectedQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY time_bucket = TBUCKET(100)`,
      expectedTimeField: 'time_bucket',
      expectedMetricFields: ['avg_bytes'],
    },
    {
      description: 'FROM query with KEEP after STATS',
      sourceQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) | KEEP avg_bytes`,
      expectedQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend) | KEEP avg_bytes, \`BUCKET(@timestamp, 75, ?_tstart, ?_tend)\``,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['avg_bytes'],
    },
    {
      description: 'FROM query with aliased BUCKET and KEEP after STATS',
      sourceQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY time_bucket = BUCKET(@timestamp, 1 hour) | KEEP avg_bytes`,
      expectedQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY time_bucket = BUCKET(@timestamp, 1 hour) | KEEP avg_bytes, time_bucket`,
      expectedTimeField: 'time_bucket',
      expectedMetricFields: ['avg_bytes'],
    },
    {
      description: 'TS query with renamed TBUCKET column',
      sourceQuery: `TS ${index} | STATS avg_bytes = AVG(AVG_OVER_TIME(bytes_gauge)) BY bucket = TBUCKET(100) | RENAME bucket AS time`,
      expectedQuery: `TS ${index} | STATS avg_bytes = AVG(AVG_OVER_TIME(bytes_gauge)) BY bucket = TBUCKET(100) | RENAME bucket AS time`,
      expectedTimeField: 'time',
      expectedMetricFields: ['avg_bytes'],
    },
    {
      description: 'FROM query with renamed BUCKET column and KEEP',
      sourceQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 hour) | RENAME bucket AS time | KEEP avg_bytes`,
      expectedQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 hour) | RENAME bucket AS time | KEEP avg_bytes, time`,
      expectedTimeField: 'time',
      expectedMetricFields: ['avg_bytes'],
    },
    {
      description: 'raw query with multiple metric fields',
      sourceQuery: `FROM ${index}`,
      expectedQuery: `FROM ${index} | STATS AVG(bytes), AVG(phpmemory) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['AVG(bytes)', 'AVG(phpmemory)'],
      metricFields: ['bytes', 'phpmemory'],
    },
    {
      description: 'raw query without metric fields falls back to COUNT(*)',
      sourceQuery: `FROM ${index}`,
      expectedQuery: `FROM ${index} | STATS COUNT(*) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['COUNT(*)'],
      expectedMetricFieldMap: {},
    },
    {
      description: 'query with an existing BUCKET on the time field is unchanged',
      sourceQuery: `FROM ${index} | STATS COUNT(*) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedQuery: `FROM ${index} | STATS COUNT(*) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['COUNT(*)'],
    },
    {
      description: 'FROM query with KEEP before STATS',
      sourceQuery: `FROM ${index} | KEEP bytes | STATS avg_bytes = AVG(bytes)`,
      expectedQuery: `FROM ${index} | KEEP bytes, @timestamp | STATS avg_bytes = AVG(bytes) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['avg_bytes'],
    },
    {
      description: 'FROM query with TBUCKET renamed via assignment form',
      sourceQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY bucket = TBUCKET(100) | RENAME time = bucket`,
      expectedQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY bucket = TBUCKET(100) | RENAME time = bucket`,
      expectedTimeField: 'time',
      expectedMetricFields: ['avg_bytes'],
    },
    {
      description: 'FROM query with aliased BUCKET through chained RENAMEs',
      sourceQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY b = BUCKET(@timestamp, 1 hour) | RENAME b AS c | RENAME c AS d`,
      expectedQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY b = BUCKET(@timestamp, 1 hour) | RENAME b AS c | RENAME c AS d`,
      expectedTimeField: 'd',
      expectedMetricFields: ['avg_bytes'],
    },
    {
      description: 'FORK query selecting the KPI branch by metric column',
      sourceQuery: `FROM ${index} | FORK (STATS total_bytes = SUM(bytes)) (STATS event_count = COUNT(*) BY time_bucket = BUCKET(@timestamp, 75, ?_tstart, ?_tend))`,
      expectedQuery: `FROM ${index} | STATS total_bytes = SUM(bytes) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['total_bytes'],
      metricFields: ['total_bytes'],
    },
    {
      // original repro from https://github.com/elastic/kibana/issues/282275:
      // backtick-quoted column names with spaces through branch selection and rewrite
      description: 'FORK query with backtick-quoted metric and bucket column names',
      sourceQuery: `FROM ${index} | FORK (STATS \`Total Events\` = COUNT(*)) (STATS \`Event Count\` = COUNT(*) BY \`Time Bucket\` = BUCKET(@timestamp, 75, ?_tstart, ?_tend))`,
      expectedQuery: `FROM ${index} | STATS \`Total Events\` = COUNT(*) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['Total Events'],
      metricFields: ['Total Events'],
    },
    {
      description: 'FORK query selecting the branch with an existing aliased BUCKET',
      sourceQuery: `FROM ${index} | FORK (STATS total_bytes = SUM(bytes)) (STATS event_count = COUNT(*) BY time_bucket = BUCKET(@timestamp, 75, ?_tstart, ?_tend))`,
      expectedQuery: `FROM ${index} | STATS event_count = COUNT(*) BY time_bucket = BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'time_bucket',
      expectedMetricFields: ['event_count'],
      metricFields: ['event_count'],
    },
    {
      description: 'FORK query without metric fields falls back to the first STATS branch',
      // the WHERE branch projects to KEEP bytes: counter-typed fields in the TSDB
      // index otherwise conflict across FORK branch schemas (ES rejects the query)
      sourceQuery: `FROM ${index} | FORK (WHERE bytes > 0 | KEEP bytes) (STATS avg_bytes = AVG(bytes))`,
      expectedQuery: `FROM ${index} | STATS avg_bytes = AVG(bytes) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['avg_bytes'],
    },
    {
      // canonical FORK metric idiom from the ES|QL docs: top-N rows + KPI count branch
      description: 'FORK query with top-N branch and COUNT KPI branch',
      sourceQuery: `FROM ${index} | FORK (SORT bytes DESC | LIMIT 5 | KEEP bytes) (STATS total = COUNT(*))`,
      expectedQuery: `FROM ${index} | STATS total = COUNT(*) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['total'],
      metricFields: ['total'],
    },
    {
      description: 'FORK query with SORT _fork after FORK',
      sourceQuery: `FROM ${index} | FORK (STATS total = COUNT(*)) (STATS avg_bytes = AVG(bytes)) | SORT _fork`,
      expectedQuery: `FROM ${index} | STATS total = COUNT(*) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['total'],
      metricFields: ['total'],
    },
    {
      description: 'FORK query with SORT _fork DESC NULLS LAST after FORK',
      sourceQuery: `FROM ${index} | FORK (STATS total = COUNT(*)) (STATS avg_bytes = AVG(bytes)) | SORT _fork DESC NULLS LAST`,
      expectedQuery: `FROM ${index} | STATS total = COUNT(*) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['total'],
      metricFields: ['total'],
    },
    {
      description: 'FORK query with WHERE on the _fork discriminator',
      sourceQuery: `FROM ${index} | FORK (STATS total = COUNT(*)) (STATS avg_bytes = AVG(bytes)) | WHERE _fork == "fork1"`,
      expectedQuery: `FROM ${index} | STATS total = COUNT(*) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['total'],
      metricFields: ['total'],
    },
    {
      description: 'FORK query with compound WHERE combining _fork and a metric predicate',
      sourceQuery: `FROM ${index} | FORK (STATS total = COUNT(*)) (STATS avg_bytes = AVG(bytes)) | WHERE _fork == "fork1" AND total > 0`,
      expectedQuery: `FROM ${index} | STATS total = COUNT(*) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend) | WHERE total > 0`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['total'],
      metricFields: ['total'],
    },
    {
      description: 'FORK query with KEEP including the _fork discriminator',
      sourceQuery: `FROM ${index} | FORK (STATS total = COUNT(*)) (STATS avg_bytes = AVG(bytes)) | KEEP total, _fork`,
      expectedQuery: `FROM ${index} | STATS total = COUNT(*) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend) | KEEP total, \`BUCKET(@timestamp, 75, ?_tstart, ?_tend)\``,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['total'],
      metricFields: ['total'],
    },
    {
      description: 'FORK query with metric column produced via RENAME inside a branch',
      sourceQuery: `FROM ${index} | FORK (STATS cnt = COUNT(*) | RENAME cnt AS total) (STATS avg_bytes = AVG(bytes))`,
      expectedQuery: `FROM ${index} | STATS cnt = COUNT(*) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend) | RENAME cnt AS total`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['total'],
      metricFields: ['total'],
    },
    {
      description: 'FORK query with WHERE-only branches and raw metric fields',
      sourceQuery: `FROM ${index} | FORK (WHERE bytes > 0) (WHERE bytes <= 0)`,
      expectedQuery: `FROM ${index} | WHERE bytes > 0 | STATS AVG(bytes) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['AVG(bytes)'],
      metricFields: ['bytes'],
    },
    {
      description: 'FORK query with WHERE prefix kept before the selected branch',
      sourceQuery: `FROM ${index} | WHERE bytes > 0 | FORK (STATS a = COUNT(*)) (STATS b = MAX(bytes))`,
      expectedQuery: `FROM ${index} | WHERE bytes > 0 | STATS b = MAX(bytes) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['b'],
      metricFields: ['b'],
    },
    {
      description: 'FORK query dropping a KEEP that only referenced the _fork discriminator',
      sourceQuery: `FROM ${index} | FORK (STATS a = COUNT(*)) (STATS b = COUNT(*)) | KEEP _fork`,
      expectedQuery: `FROM ${index} | STATS a = COUNT(*) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['a'],
      metricFields: ['a'],
    },
    {
      description: 'FORK query with EVAL prefix shared by both branches',
      sourceQuery: `FROM ${index} | EVAL kb = bytes / 1024 | FORK (STATS avg_kb = AVG(kb)) (STATS total = COUNT(*))`,
      expectedQuery: `FROM ${index} | EVAL kb = bytes / 1024 | STATS avg_kb = AVG(kb) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['avg_kb'],
      metricFields: ['avg_kb'],
    },
    {
      description: 'FORK query selecting a branch by unaliased aggregation expression',
      sourceQuery: `FROM ${index} | FORK (STATS COUNT(*)) (STATS total = SUM(bytes))`,
      expectedQuery: `FROM ${index} | STATS COUNT(*) BY BUCKET(@timestamp, 75, ?_tstart, ?_tend)`,
      expectedTimeField: 'BUCKET(@timestamp, 75, ?_tstart, ?_tend)',
      expectedMetricFields: ['COUNT(*)'],
      metricFields: ['COUNT(*)'],
    },
  ];
};
