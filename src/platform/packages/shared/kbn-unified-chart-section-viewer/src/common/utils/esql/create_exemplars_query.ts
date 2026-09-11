/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { esql } from '@elastic/esql';
import { isSingleSource, sanitazeESQLInput } from '@kbn/esql-utils';
import { EXEMPLARS_MAX_ROWS } from '../../constants';
import { deriveExemplarsIndex } from '../exemplars/derive_exemplars_index';
import type { ParsedMetricItem } from '../../../types';

/** Column holding the exemplar timestamp. Also the sort and time-filter field. */
const TIMESTAMP_FIELD = '@timestamp';
/**
 * Trace correlation columns. `trace_id` and `span_id` are mapped to ECS-compliant
 * equivalents `trace.id` and `span.id`, but referencing the native field names skips
 * this alias resolution.
 */
const TRACE_ID_FIELD = 'trace_id';
const SPAN_ID_FIELD = 'span_id';

interface CreateExemplarsQueryParams {
  metricItem: ParsedMetricItem;
  /**
   * Verbatim ES|QL fragments from the user's own `WHERE` commands, re-piped so
   * the exemplars include the same dimension filters as the metric chart.
   */
  whereStatements?: string[];
  /**
   * The source the user typed in their query. Resolved with the same precedence as
   * {@link createESQLQuery}, so the exemplars scope matches the chart's scope.
   */
  originalSource?: string;
  /**
   * Optionally specify the LIMIT value.
   */
  maxRows?: number;
}

/**
 * Builds the ES|QL query that fetches OTLP exemplars for a single metric, or returns
 * an empty string when the metric cannot have exemplars (callers treat `''` as
 * "do not fetch").
 *
 * Deliberately takes no breakdown accessors: breaking down the metric chart by a
 * dimension must not change which exemplars are fetched.
 */
export function createExemplarsQuery({
  metricItem,
  whereStatements = [],
  originalSource,
  maxRows = EXEMPLARS_MAX_ROWS,
}: CreateExemplarsQueryParams): string {
  const { metricName, indexName, dimensionFields } = metricItem;
  const metricsIndex = isSingleSource(originalSource) ? originalSource : indexName;
  const exemplarsIndex = deriveExemplarsIndex(metricsIndex);

  if (!exemplarsIndex || !metricName) {
    return '';
  }

  // TODO(elasticsearch#154786): swap `FROM <index>` for `TS_EXEMPLARS` when available.
  const query = esql.from(exemplarsIndex);
  const escapedMetricName = sanitazeESQLInput(metricName);

  // Rows where the metric column is null belong to a different metric in the same
  // exemplars stream.
  query.pipe(`WHERE ${escapedMetricName} IS NOT NULL`);

  for (const statement of whereStatements) {
    const trimmed = statement.trim();
    if (trimmed.length > 0) {
      query.pipe(`WHERE ${trimmed}`);
    }
  }

  const baseColumns = [TIMESTAMP_FIELD, metricName, TRACE_ID_FIELD, SPAN_ID_FIELD];
  const keepColumns = [
    TIMESTAMP_FIELD,
    escapedMetricName,
    TRACE_ID_FIELD,
    SPAN_ID_FIELD,
    ...dimensionFields
      .filter(({ name }) => !baseColumns.includes(name))
      .map(({ name }) => sanitazeESQLInput(name)),
  ];
  query.pipe(`KEEP ${keepColumns.join(', ')}`);

  query.pipe(`SORT ${TIMESTAMP_FIELD} DESC`);
  query.pipe(`LIMIT ${maxRows}`);

  return query.print('pipe-multiline');
}
