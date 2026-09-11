/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  AVG_ID,
  CARDINALITY_ID,
  COUNT_ID,
  MAX_ID,
  MEDIAN_ID,
  MIN_ID,
  PERCENTILE_ID,
  STD_DEVIATION_ID,
  SUM_ID,
} from '@kbn/lens-formula-docs';
import type { BaseIndexPatternColumn } from '../../datasources/types';
import type {
  CountIndexPatternColumn,
  CardinalityIndexPatternColumn,
} from '../../datasources/operations';
import { countToESQL, getCountSerializedFormat } from './count_to_esql';
import { cardinalityToESQL, getCardinalitySerializedFormat } from './cardinality_to_esql';
import { percentileToESQL } from './percentile_to_esql';
import { buildMetricToESQL } from './metric_to_esql';
import { dateHistogramToESQL, getDateHistogramSerializedFormat } from './date_histogram_to_esql';
import { rangesToESQL } from './ranges_to_esql';
import { termsToESQL } from './terms_to_esql';
import type {
  EsqlOperationColumnMap,
  EsqlSupportedOperation,
  GetSerializedFormatFn,
  ToEsqlFn,
} from './types';

export const DATE_HISTOGRAM_ID = 'date_histogram';
export const RANGE_ID = 'range';
export const STATIC_VALUE_ID = 'static_value';
export const TERMS_ID = 'terms';

/**
 * UI-free registry of per-operation DSL-to-ES|QL conversion functions.
 * Each entry is precisely typed against its column type via
 * `EsqlOperationColumnMap`, so wiring a function to the wrong key is a
 * compile error.
 */
export const toEsqlRegistry: {
  [K in EsqlSupportedOperation]?: ToEsqlFn<EsqlOperationColumnMap[K]>;
} = {
  [COUNT_ID]: countToESQL,
  [CARDINALITY_ID]: cardinalityToESQL,
  [PERCENTILE_ID]: percentileToESQL,
  [MIN_ID]: buildMetricToESQL(MIN_ID),
  [MAX_ID]: buildMetricToESQL(MAX_ID),
  [AVG_ID]: buildMetricToESQL(AVG_ID),
  [SUM_ID]: buildMetricToESQL(SUM_ID),
  [MEDIAN_ID]: buildMetricToESQL(MEDIAN_ID),
  [STD_DEVIATION_ID]: buildMetricToESQL(STD_DEVIATION_ID),
  [DATE_HISTOGRAM_ID]: dateHistogramToESQL,
  [RANGE_ID]: rangesToESQL,
  [TERMS_ID]: termsToESQL,
};

/**
 * Static, UI-free metadata about operations participating in the DSL-to-ES|QL
 * conversion. Mirrors the corresponding `OperationDefinition` properties.
 */
export interface EsqlOperationMeta<C extends BaseIndexPatternColumn = BaseIndexPatternColumn> {
  filterable?: boolean;
  canReduceTimeRange?: boolean;
  getSerializedFormat?: GetSerializedFormatFn<C>;
}

/** Shared meta for basic field metrics (min/max/avg/sum/median/std_dev). */
export const metricEsqlMeta: EsqlOperationMeta = { filterable: true, canReduceTimeRange: true };

export const countEsqlMeta: EsqlOperationMeta<CountIndexPatternColumn> = {
  ...metricEsqlMeta,
  getSerializedFormat: getCountSerializedFormat,
};

export const cardinalityEsqlMeta: EsqlOperationMeta<CardinalityIndexPatternColumn> = {
  ...metricEsqlMeta,
  getSerializedFormat: getCardinalitySerializedFormat,
};

export const percentileEsqlMeta: EsqlOperationMeta = metricEsqlMeta;

export const dateHistogramEsqlMeta: EsqlOperationMeta<EsqlOperationColumnMap['date_histogram']> = {
  getSerializedFormat: getDateHistogramSerializedFormat,
};

export const esqlOperationMetaRegistry: {
  [K in EsqlSupportedOperation]?: EsqlOperationMeta<EsqlOperationColumnMap[K]>;
} = {
  [COUNT_ID]: countEsqlMeta,
  [CARDINALITY_ID]: cardinalityEsqlMeta,
  [PERCENTILE_ID]: percentileEsqlMeta,
  [MIN_ID]: metricEsqlMeta,
  [MAX_ID]: metricEsqlMeta,
  [AVG_ID]: metricEsqlMeta,
  [SUM_ID]: metricEsqlMeta,
  [MEDIAN_ID]: metricEsqlMeta,
  [STD_DEVIATION_ID]: metricEsqlMeta,
  [DATE_HISTOGRAM_ID]: dateHistogramEsqlMeta,
  [RANGE_ID]: {},
  [TERMS_ID]: {},
};

const isEsqlSupportedOperation = (
  operationType: string,
  registry: Partial<Record<EsqlSupportedOperation, unknown>>
): operationType is EsqlSupportedOperation => operationType in registry;

/**
 * Dynamic-dispatch read of {@link toEsqlRegistry}. The widening to the base
 * column type is the single deliberately unsound point of the registry: the
 * caller selects the entry via `column.operationType`, which guarantees the
 * key/column correlation at runtime.
 */
export const getToEsqlFn = (operationType: string): ToEsqlFn | undefined =>
  isEsqlSupportedOperation(operationType, toEsqlRegistry)
    ? (toEsqlRegistry[operationType] as ToEsqlFn)
    : undefined;

/** Dynamic-dispatch read of {@link esqlOperationMetaRegistry}; see {@link getToEsqlFn}. */
export const getEsqlOperationMeta = (operationType: string): EsqlOperationMeta =>
  isEsqlSupportedOperation(operationType, esqlOperationMetaRegistry)
    ? (esqlOperationMetaRegistry[operationType] as EsqlOperationMeta) ?? {}
    : {};
