/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  DURATION,
  EVENT_OUTCOME,
  PROCESSOR_EVENT,
  STATUS_CODE,
  TRANSACTION_DURATION,
  TRANSACTION_ID,
  SPAN_ID,
  SPAN_DURATION,
} from '@kbn/apm-types';
import { esql, type ComposerQuery } from '@elastic/esql';
import { i18n } from '@kbn/i18n';
import type { LensSeriesLayer } from '@kbn/lens-embeddable-utils';
import { ProcessorEvent } from '@kbn/apm-types-shared';
import type { MetricUnit } from '../../../types';
import { createTimeBucketAggregation } from '../../../common/utils/esql/create_aggregation';
import { chartPalette } from '.';

interface TraceChart {
  id: string;
  title: string;
  color: string;
  unit: MetricUnit;
  seriesType: LensSeriesLayer['seriesType'];
  esqlQuery: string;
}

const UNMAPPED_FIELDS_NULLIFY_SET_COMMAND = 'SET unmapped_fields="NULLIFY";';

function getWhereClauses(filters: string[]): string[] {
  return [
    ...filters,
    `TO_STRING(${PROCESSOR_EVENT}) == "${ProcessorEvent.transaction}" OR TO_STRING(${PROCESSOR_EVENT}) == "${ProcessorEvent.span}" OR ${PROCESSOR_EVENT} IS NULL`,
  ];
}

interface TraceQueryParams {
  indexes: string;
  filters: string[];
  metadataFields: string[];
  breakdownField?: string;
}

function createBaseTraceQuery({
  indexes,
  filters,
  metadataFields,
}: TraceQueryParams): ComposerQuery {
  const whereClauses = getWhereClauses(filters);
  const query = metadataFields.length ? esql.from([indexes], metadataFields) : esql.from(indexes);
  for (const clause of whereClauses) {
    query.pipe(`WHERE ${clause}`);
  }
  return query;
}

export function getErrorRateChart({
  indexes,
  filters,
  metadataFields,
  breakdownField,
}: TraceQueryParams): TraceChart | null {
  try {
    const query = createBaseTraceQuery({ indexes, filters, metadataFields });
    const byClause = breakdownField
      ? `timestamp = ${createTimeBucketAggregation({})}, ${breakdownField}`
      : `timestamp = ${createTimeBucketAggregation({})}`;
    query.pipe(
      `STATS failure = COUNT(*) WHERE TO_STRING(${EVENT_OUTCOME}) == "failure" OR TO_STRING(${STATUS_CODE}) == "Error", all = COUNT(*) BY ${byClause}`
    );
    query.pipe('EVAL error_rate = TO_DOUBLE(failure) / all');
    query.pipe(`KEEP timestamp, error_rate${breakdownField ? `, ${breakdownField}` : ''}`);
    query.pipe('SORT timestamp');

    return {
      id: 'error_rate',
      title: i18n.translate('metricsExperience.grid.error_rate.label', {
        defaultMessage: 'Error Rate',
      }),
      color: chartPalette[6],
      unit: 'percent',
      seriesType: 'line',
      esqlQuery: `${UNMAPPED_FIELDS_NULLIFY_SET_COMMAND} ${query.print('basic')}`,
    };
  } catch (error) {
    return null;
  }
}

export function getLatencyChart({
  indexes,
  filters,
  metadataFields,
  breakdownField,
}: TraceQueryParams): TraceChart | null {
  try {
    const query = createBaseTraceQuery({ indexes, filters, metadataFields });
    // apm duration is in us
    query.pipe(
      `EVAL duration_ms_ecs = CASE(${TRANSACTION_DURATION} IS NOT NULL, TO_DOUBLE(${TRANSACTION_DURATION})/1000, ${SPAN_DURATION} IS NOT NULL, TO_DOUBLE(${SPAN_DURATION})/1000, null)`
    );
    // otel duration is in ns
    query.pipe(`EVAL duration_ms_otel = ROUND(${DURATION})/1000/1000`);
    // need to convert both to the same type to make sure the COALESCE works
    query.pipe('EVAL duration_ms = COALESCE(TO_LONG(duration_ms_ecs), TO_LONG(duration_ms_otel))');
    query.pipe(
      `STATS AVG(duration_ms) BY ${createTimeBucketAggregation({})}${
        breakdownField ? `, ${breakdownField}` : ''
      }`
    );

    return {
      id: 'latency',
      title: i18n.translate('metricsExperience.grid.latency.label', {
        defaultMessage: 'Latency',
      }),
      color: chartPalette[2],
      unit: 'ms',
      seriesType: 'line',
      esqlQuery: `${UNMAPPED_FIELDS_NULLIFY_SET_COMMAND} ${query.print('basic')}`,
    };
  } catch (error) {
    return null;
  }
}

export function getThroughputChart({
  indexes,
  filters,
  metadataFields,
  breakdownField,
}: TraceQueryParams): TraceChart | null {
  try {
    const query = createBaseTraceQuery({ indexes, filters, metadataFields });
    query.pipe(`EVAL id = COALESCE(${TRANSACTION_ID}, ${SPAN_ID})`);
    query.pipe(
      `STATS COUNT(id) BY ${createTimeBucketAggregation({})}${
        breakdownField ? `, ${breakdownField}` : ''
      }`
    );

    return {
      id: 'throughput',
      title: i18n.translate('metricsExperience.grid.throughput.label', {
        defaultMessage: 'Throughput',
      }),
      color: chartPalette[0],
      unit: 'count',
      seriesType: 'line',
      esqlQuery: `${UNMAPPED_FIELDS_NULLIFY_SET_COMMAND} ${query.print('basic')}`,
    };
  } catch (error) {
    return null;
  }
}
