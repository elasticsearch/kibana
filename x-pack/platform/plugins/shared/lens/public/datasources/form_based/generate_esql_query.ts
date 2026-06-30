/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import type { IUiSettingsClient } from '@kbn/core/public';
import { UI_SETTINGS, convertIntervalToEsInterval } from '@kbn/data-plugin/public';
import { TIME_SYSTEM_PARAMS } from '@kbn/esql-language';
import moment from 'moment';
import { partition } from 'lodash';
import type {
  DateHistogramIndexPatternColumn,
  DateRange,
  FormBasedLayer,
  IndexPattern,
  GenericIndexPatternColumn,
  StaticValueIndexPatternColumn,
} from '@kbn/lens-common';
import { calculateAuto } from '@kbn/calculate-auto';
import { isColumnOfType, isColumnFormatted } from './operations/definitions/helpers';
import { convertToAbsoluteDateRange } from '../../utils';
import type { OriginalColumn } from '../../../common/types';
import { operationDefinitionMap } from './operations';
import { resolveTimeShift } from './time_shift_utils';
import type { EsqlConversionFailureReason } from './to_esql_failure_reasons';
import { createEsAggsIdMapEntry } from './create_es_aggs_id_map_entry';
import { defaultValue as defaultStaticValue } from './operations/definitions/static_value';
import {
  AUTO_INTERVAL,
  AUTO_TARGET_NUMBER_OF_BUCKETS,
  getTimeZoneAndInterval,
  hasDateRange,
} from './date_histogram_esql';

// esAggs column ID manipulation functions
export const extractAggId = (id: string) => id.split('.')[0].split('-')[2];

// Used for metrics and buckets ES|QL verification
interface EsqlConversionResult {
  esql: string;
}
type EsqlConversion = EsqlConversionResult | EsqlQueryFailure;
const areValidEsqlConversionItems = (
  metrics: EsqlConversion[]
): metrics is EsqlConversionResult[] => metrics.every((m) => typeof m === 'object' && 'esql' in m);

/**
 * Result type for generateEsqlQuery.
 * Either a successful conversion with the ES|QL query,
 * or a failure with a specific reason.
 */
interface EsqlQuerySuccess {
  success: true;
  esql: string;
  partialRows: boolean;
  esAggsIdMap: Record<string, OriginalColumn[]>;
}

interface EsqlQueryFailure {
  success: false;
  reason: EsqlConversionFailureReason;
  operationType?: string;
}

export type EsqlQueryResult = EsqlQuerySuccess | EsqlQueryFailure;

/**
 * Type guard to check if the result is a successful ES|QL query.
 */
export const isEsqlQuerySuccess = (result: unknown): result is EsqlQuerySuccess =>
  result !== null && typeof result === 'object' && 'success' in result && result.success === true;

/**
 * Type guard to check if the result is a failed ES|QL query.
 */
export const isEsqlQueryFailure = (result: unknown): result is EsqlQueryFailure =>
  result !== null && typeof result === 'object' && 'success' in result && result.success === false;

/**
 * Helper function to create a consistent failure result for ES|QL query generation.
 */
function getEsqlQueryFailedResult(
  reason: EsqlConversionFailureReason,
  operationType?: string
): EsqlQueryFailure {
  return operationType ? { success: false, reason, operationType } : { success: false, reason };
}

/**
 * Optional mapping of column IDs to semantic role names.
 * Used to generate more meaningful ES|QL column names.
 * e.g., { 'col-123': 'max_value' } will generate
 * `EVAL static_max_value = 100` instead of `EVAL static_value = 100`.
 */
export interface ColumnRoles {
  [columnId: string]: string;
}

const SINGLE_CHAR_INTERVAL: Record<string, string> = {
  d: '1d',
  h: '1h',
  m: '1m',
  s: '1s',
  ms: '1ms',
} as const;

const DEFAULT_DATE_HISTOGRAM_INTERVAL_MS = moment.duration(1, 'h').as('ms');

export function generateEsqlQuery(
  esAggEntries: Array<readonly [string, GenericIndexPatternColumn]>,
  layer: FormBasedLayer,
  indexPattern: IndexPattern,
  uiSettings: IUiSettingsClient,
  dateRange: DateRange,
  nowInstant: Date,
  columnRoles?: ColumnRoles
): EsqlQueryResult {
  // esql mode variables
  const partialRows = true;

  // Check for unsupported column features in layer.columns
  for (const col of Object.values(layer.columns)) {
    if (col.operationType === 'formula') {
      return getEsqlQueryFailedResult('formula_not_supported');
    }
    if (col.timeShift) {
      return getEsqlQueryFailedResult('time_shift_not_supported');
    }
    if ('sourceField' in col && indexPattern.getFieldByName(col.sourceField)?.runtime) {
      return getEsqlQueryFailedResult('runtime_field_not_supported');
    }
  }

  // indexPattern.title is the actual ES pattern
  // ES|QL Composer API docs: https://github.com/elastic/esql-js/blob/main/src/composer/README.md
  const queryParts: string[] = [`FROM ${esql.src(indexPattern.title)}`];

  if (indexPattern.timeFieldName) {
    const [ESQL_TIME_RANGE_START, ESQL_TIME_RANGE_END] = TIME_SYSTEM_PARAMS;
    const timeField = `${esql.col(indexPattern.timeFieldName)}`;
    queryParts.push(
      `WHERE ${timeField} >= ${ESQL_TIME_RANGE_START} AND ${timeField} <= ${ESQL_TIME_RANGE_END}`
    );
  }

  const histogramBarsTarget = uiSettings.get(UI_SETTINGS.HISTOGRAM_BAR_TARGET);
  const absDateRange = convertToAbsoluteDateRange(dateRange, nowInstant);

  const hasDateHistogram = esAggEntries.some(([, col]) => col.operationType === 'date_histogram');

  const esAggsIdMap: Record<string, OriginalColumn[]> = {};

  const [metricEsAggsEntries, bucketEsAggsEntries] = partition(
    esAggEntries,
    ([_, col]) => !col.isBucketed
  );

  // Separate static_value columns from regular metrics
  const [staticValueEntries, regularMetricEntries] = partition(
    metricEsAggsEntries,
    ([_, col]) => col.operationType === 'static_value'
  );

  // Process static value columns - these will become EVAL statements
  const staticValueEvals: string[] = [];
  staticValueEntries.forEach(([colId, col], index) => {
    const staticCol = col as StaticValueIndexPatternColumn;
    const value = staticCol.params?.value ?? `${defaultStaticValue}`;

    // Generate a column name for the static value
    // Priority: 1) semantic role name from visualization, 2) 'static_value' for single, 3) 'static_value_N' for multiple
    const roleName = columnRoles?.[colId];
    let esAggsId: string;
    if (roleName) {
      esAggsId = `static_${roleName}`;
    } else if (staticValueEntries.length === 1) {
      esAggsId = 'static_value';
    } else {
      esAggsId = `static_value_${index}`;
    }

    const format = isColumnFormatted(col) ? col.params?.format : undefined;

    // Add to esAggsIdMap so the column can be mapped in text-based layer
    esAggsIdMap[esAggsId] = createEsAggsIdMapEntry({
      col,
      colId,
      format,
      layer,
      indexPattern,
      uiSettings,
      dateRange,
    });

    // Generate EVAL statement using composer literal helpers
    staticValueEvals.push(`${esAggsId} = ${esql.num(Number(value))}`);
  });

  // Process metrics (excluding static_value which is handled above)
  const metricsResult: EsqlConversion[] = regularMetricEntries.map(([colId, col]) => {
    const def = operationDefinitionMap[col.operationType];

    // Check for specific unsupported operations before general toESQL check
    if (col.operationType === 'formula') {
      return getEsqlQueryFailedResult('formula_not_supported');
    }

    if (!def.toESQL) {
      return getEsqlQueryFailedResult('function_not_supported', col.operationType);
    }

    const wrapInFilter = Boolean(def.filterable && col.filter?.query);
    const wrapInTimeFilter =
      def.canReduceTimeRange &&
      !hasDateHistogram &&
      col.reducedTimeRange &&
      indexPattern.timeFieldName;

    if (wrapInTimeFilter) {
      return getEsqlQueryFailedResult('reduced_time_range_not_supported');
    }

    const format =
      // 1. User-configured format in Lens (highest priority)
      (isColumnFormatted(col) ? col.params?.format : undefined) ??
      // 2. Operation-specific format
      operationDefinitionMap[col.operationType].getSerializedFormat?.(
        col,
        col,
        indexPattern,
        uiSettings,
        dateRange
      ) ??
      // 3. Field's default format from data view
      ('sourceField' in col
        ? col.sourceField === '___records___'
          ? { id: 'number' }
          : undefined
        : undefined);

    const rawResult = def.toESQL(
      {
        ...col,
        timeShift: resolveTimeShift(
          col.timeShift,
          absDateRange,
          histogramBarsTarget,
          hasDateHistogram
        ),
      },
      wrapInFilter || wrapInTimeFilter ? `${colId}-metric` : colId,
      indexPattern,
      layer,
      uiSettings,
      dateRange
    );

    if (!rawResult) {
      return getEsqlQueryFailedResult('function_not_supported', col.operationType);
    }

    let filterClause = '';
    if (wrapInFilter && col.filter) {
      const { query, language } = col.filter;
      if ((language !== 'kuery' && language !== 'lucene') || typeof query !== 'string') {
        return getEsqlQueryFailedResult('function_not_supported', col.operationType);
      }
      const cmd = language === 'kuery' ? 'KQL' : 'QSTR';
      const filteredQueryString = query.replace(/"""/g, '').trim();
      filterClause = ` WHERE ${cmd}(${esql.str(filteredQueryString)})`;
    }

    const fullStatsMetricExpression = rawResult.template + filterClause;

    const statsColumnAlias = columnRoles?.[colId];
    const statsMetricFragment = statsColumnAlias
      ? `${statsColumnAlias} = ${fullStatsMetricExpression}`
      : fullStatsMetricExpression;

    // Key must match the STATS output column name: alias if set, else the bare expression.
    // Use the same truthy check as statsMetricFragment so empty string roles map to the bare expression.
    const esAggsIdMapKey = statsColumnAlias ? statsColumnAlias : fullStatsMetricExpression;

    esAggsIdMap[esAggsIdMapKey] = createEsAggsIdMapEntry({
      col,
      colId,
      format,
      layer,
      indexPattern,
      uiSettings,
      dateRange,
    });

    return { esql: statsMetricFragment } satisfies EsqlConversionResult;
  });

  // Check for metric conversion errors with a type guard
  if (!areValidEsqlConversionItems(metricsResult)) {
    const metricError = metricsResult.find(isEsqlQueryFailure);
    if (isEsqlQueryFailure(metricError)) {
      return getEsqlQueryFailedResult(
        metricError.reason,
        'operationType' in metricError ? metricError.operationType : undefined
      );
    }
    return getEsqlQueryFailedResult('function_not_supported');
  }

  // Process buckets
  const resolvedBucketExprs = new Map<number, string>();
  const bucketsResult: EsqlConversion[] = bucketEsAggsEntries.map(([colId, col], index) => {
    const def = operationDefinitionMap[col.operationType];

    // Check for specific unsupported operations before general toESQL check
    if (col.operationType === 'terms') {
      return getEsqlQueryFailedResult('terms_not_supported');
    }

    if (!def.toESQL) {
      return getEsqlQueryFailedResult('function_not_supported', col.operationType);
    }

    const wrapInFilter = Boolean(def.filterable && col.filter?.query);
    const wrapInTimeFilter =
      def.canReduceTimeRange &&
      !hasDateHistogram &&
      col.reducedTimeRange &&
      indexPattern.timeFieldName;

    let intervalInMs: number | undefined;
    if (isColumnOfType<DateHistogramIndexPatternColumn>('date_histogram', col)) {
      const { interval } = getTimeZoneAndInterval(col, indexPattern);

      if (interval === AUTO_INTERVAL) {
        if (hasDateRange(dateRange)) {
          const { toDate, fromDate } = absDateRange;
          const absDate = new Date(toDate).getTime() - new Date(fromDate).getTime();
          const rangeDuration = moment.duration(absDate, 'ms');
          const intervalDuration = calculateAuto.near(AUTO_TARGET_NUMBER_OF_BUCKETS, rangeDuration);
          intervalInMs = intervalDuration?.as('ms') ?? DEFAULT_DATE_HISTOGRAM_INTERVAL_MS;
        } else {
          // Fall back to default 1h when date range is missing
          intervalInMs = DEFAULT_DATE_HISTOGRAM_INTERVAL_MS;
        }
      } else {
        const cleanInterval = (i: string) => SINGLE_CHAR_INTERVAL[i] ?? i;
        const esInterval = convertIntervalToEsInterval(cleanInterval(interval));
        intervalInMs = moment.duration(esInterval.value, esInterval.unit).as('ms');
      }
    }

    if (isColumnOfType<DateHistogramIndexPatternColumn>('date_histogram', col)) {
      const column = col;
      if (column.params?.includeEmptyRows) {
        return getEsqlQueryFailedResult('include_empty_rows_not_supported');
      }
    }

    const rawResult = def.toESQL(
      {
        ...col,
        timeShift: resolveTimeShift(
          col.timeShift,
          absDateRange,
          histogramBarsTarget,
          hasDateHistogram
        ),
      },
      wrapInFilter || wrapInTimeFilter ? `${colId}-metric` : colId,
      indexPattern,
      layer,
      uiSettings,
      dateRange
    );

    if (!rawResult) {
      return getEsqlQueryFailedResult('function_not_supported', col.operationType);
    }

    const esAggsId = rawResult.template;
    resolvedBucketExprs.set(index, esAggsId);

    const format =
      // 1. User-configured format in Lens (highest priority)
      (isColumnFormatted(col) ? col.params?.format : undefined) ??
      // 2. Operation-specific format
      operationDefinitionMap[col.operationType].getSerializedFormat?.(
        col,
        col,
        indexPattern,
        uiSettings,
        dateRange
      ) ??
      // 3. Field's default format from data view (buckets don't need fallback)
      undefined;

    esAggsIdMap[esAggsId] = createEsAggsIdMapEntry({
      col,
      colId,
      format,
      interval: intervalInMs,
      layer,
      indexPattern,
      uiSettings,
      dateRange,
      includeSourceField: true,
    });

    return { esql: rawResult.template };
  });

  // Check for bucket conversion errors with type guard
  if (!areValidEsqlConversionItems(bucketsResult)) {
    const bucketError = bucketsResult.find(isEsqlQueryFailure);
    if (isEsqlQueryFailure(bucketError)) {
      return getEsqlQueryFailedResult(
        bucketError.reason,
        'operationType' in bucketError ? bucketError.operationType : undefined
      );
    }
    return getEsqlQueryFailedResult('function_not_supported');
  }

  // Type assertion after error checks - we know these are all strings now
  const validMetrics = metricsResult.map((m) => m.esql);
  const validBuckets = bucketsResult.map((b) => b.esql);

  if (validBuckets.length > 0) {
    if (validMetrics.length > 0) {
      const statsBody = `${validMetrics.join(', ')} BY ${validBuckets.join(', ')}`;
      queryParts.push(`STATS ${statsBody}`);
    }

    // Build sort fields, excluding date fields (date_histogram columns)
    // The first .map() attaches the original index so we can reference
    // the correct esAggsId in the final string.
    const sortFields = bucketEsAggsEntries
      .map(([, col], index) => ({ col, index }))
      .filter(({ col, index }) => col.dataType !== 'date' && resolvedBucketExprs.has(index))
      .map(({ index }) => `\`${resolvedBucketExprs.get(index)}\` ASC`);

    // Only add SORT clause if there are non-date fields to sort by
    if (sortFields.length > 0) {
      queryParts.push(`SORT ${sortFields.join(', ')}`);
    }
  } else {
    if (validMetrics.length > 0) {
      const statsBody = validMetrics.join(', ');
      queryParts.push(`STATS ${statsBody}`);
    }
  }

  // Add EVAL statements for static values after STATS/SORT
  if (staticValueEvals.length > 0) {
    queryParts.push(`EVAL ${staticValueEvals.join(', ')}`);
  }

  const queryString = queryParts.join(' | ');
  try {
    const query = esql(queryString);
    return {
      success: true,
      esql: query.print('basic'),
      partialRows,
      esAggsIdMap,
    };
  } catch (e) {
    return getEsqlQueryFailedResult('unknown');
  }
}
