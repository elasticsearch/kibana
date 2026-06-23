/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LENS_DOCUMENT_FIELD_NAME } from '@kbn/lens-common';
import type {
  AvgIndexPatternColumn,
  CardinalityIndexPatternColumn,
  CountIndexPatternColumn,
  CounterRateIndexPatternColumn,
  CumulativeSumIndexPatternColumn,
  DataType,
  DerivativeIndexPatternColumn,
  FormulaIndexPatternColumn,
  LastValueIndexPatternColumn,
  MaxIndexPatternColumn,
  MedianIndexPatternColumn,
  MinIndexPatternColumn,
  MovingAverageIndexPatternColumn,
  PercentileIndexPatternColumn,
  PercentileRanksIndexPatternColumn,
  StandardDeviationIndexPatternColumn,
  StaticValueIndexPatternColumn,
  SumIndexPatternColumn,
} from '@kbn/lens-common';

import { fromCountAPItoLensState, fromCountLensStateToAPI } from './count';
import type {
  LensApiAllMetricOrFormulaOperations,
  LensApiCountMetricOperation,
  LensApiCounterRateOperation,
  LensApiCumulativeSumOperation,
  LensApiDifferencesOperation,
  LensApiFormulaOperation,
  LensApiLastValueOperation,
  LensApiMetricOperation,
  LensApiMovingAverageOperation,
  LensApiPercentileOperation,
  LensApiPercentileRanksOperation,
  LensApiReferableMetricOperations,
  LensApiStaticValueOperation,
  LensApiSumMetricOperation,
  LensApiUniqueCountMetricOperation,
} from '../../schema/metric_ops';
import { fromUniqueCountAPItoLensState, fromUniqueCountLensStateToAPI } from './unique_count';
import {
  fromBasicMetricAPItoLensState,
  fromBasicMetricLensStateToAPI,
  fromSumMetricAPIToLensState,
  fromSumMetricLensStateToAPI,
} from './max_min_avg_sum';
import { fromStaticValueAPItoLensState, fromStaticValueLensStateToAPI } from './static_value';
import { fromLastValueAPItoLensState, fromLastValueLensStateToAPI } from './last_value';
import { fromFormulaAPItoLensState, fromFormulaLensStateToAPI } from './formula';
import { fromPercentileAPItoLensState, fromPercentileLensStateToAPI } from './percentile';
import {
  fromPercentileRankLensStateToAPI,
  fromPercentileRanksAPItoLensState,
} from './percentile_ranks';
import { fromDifferencesAPItoLensState, fromDifferencesLensStateToAPI } from './differences';
import { fromCumulativeSumAPItoLensState, fromCumulativeSumLensStateToAPI } from './cumulative_sum';
import { fromCounterRateAPItoLensState, fromCounterRateLensStateToAPI } from './counter_rate';
import { fromMovingAverageAPItoLensState, fromMovingAverageLensStateToAPI } from './moving_average';
import type {
  AnyLensStateColumn,
  AnyMetricLensStateColumn,
  ReferenceMetricLensStateColumn,
} from './types';
import {
  LENS_EMPTY_AS_NULL_DEFAULT_VALUE,
  isAPIColumnOfType,
  isApiColumnOfReferableType,
  isColumnOfReferableType,
  isLensStateBucketColumnType,
  isLensStateColumnOfType,
} from './utils';

/**
 * Specialized function signatures for transforming metric API operations to Lens state columns
 */
export function fromMetricAPItoLensState(
  options: LensApiAllMetricOrFormulaOperations | LensApiStaticValueOperation,
  dataType?: DataType
): AnyMetricLensStateColumn[] {
  if (isAPIColumnOfType<LensApiCountMetricOperation>('count', options)) {
    return [fromCountAPItoLensState(options)];
  }
  if (isAPIColumnOfType<LensApiUniqueCountMetricOperation>('unique_count', options)) {
    return [fromUniqueCountAPItoLensState(options)];
  }
  if (
    isAPIColumnOfType<LensApiMetricOperation>('average', options) ||
    isAPIColumnOfType<LensApiMetricOperation>('median', options) ||
    isAPIColumnOfType<LensApiMetricOperation>('min', options) ||
    isAPIColumnOfType<LensApiMetricOperation>('max', options) ||
    isAPIColumnOfType<LensApiMetricOperation>('standard_deviation', options)
  ) {
    return [fromBasicMetricAPItoLensState(options)];
  }
  if (isAPIColumnOfType<LensApiSumMetricOperation>('sum', options)) {
    return [fromSumMetricAPIToLensState(options)];
  }
  if (isAPIColumnOfType<LensApiStaticValueOperation>('static_value', options)) {
    return [fromStaticValueAPItoLensState(options)];
  }
  if (isAPIColumnOfType<LensApiFormulaOperation>('formula', options)) {
    return [fromFormulaAPItoLensState(options)];
  }
  if (isAPIColumnOfType<LensApiLastValueOperation>('last_value', options)) {
    return [fromLastValueAPItoLensState(options, dataType)];
  }
  if (isAPIColumnOfType<LensApiPercentileOperation>('percentile', options)) {
    return [fromPercentileAPItoLensState(options)];
  }
  if (isAPIColumnOfType<LensApiPercentileRanksOperation>('percentile_rank', options)) {
    return [fromPercentileRanksAPItoLensState(options)];
  }
  if (isAPIColumnOfType<LensApiMovingAverageOperation>('moving_average', options)) {
    if (isApiColumnOfReferableType(options.of)) {
      const [refColumn] = fromMetricAPItoLensState(options.of);
      return [fromMovingAverageAPItoLensState(options), refColumn];
    }
  }
  if (isAPIColumnOfType<LensApiCounterRateOperation>('counter_rate', options)) {
    const [refColumn] = fromMetricAPItoLensState({ operation: 'max', field: options.field });
    if (!refColumn || !('sourceField' in refColumn)) {
      return [];
    }
    return [fromCounterRateAPItoLensState(options), refColumn];
  }
  if (isAPIColumnOfType<LensApiCumulativeSumOperation>('cumulative_sum', options)) {
    const isCountOfRecords = options.field == null || options.field === LENS_DOCUMENT_FIELD_NAME;
    const [refColumn] = fromMetricAPItoLensState(
      isCountOfRecords
        ? {
            operation: 'count',
            empty_as_null: LENS_EMPTY_AS_NULL_DEFAULT_VALUE,
          }
        : {
            operation: 'sum',
            field: options.field,
            empty_as_null: LENS_EMPTY_AS_NULL_DEFAULT_VALUE,
          }
    );
    if (!refColumn || !('sourceField' in refColumn)) {
      return [];
    }
    return [fromCumulativeSumAPItoLensState(options), refColumn];
  }
  if (isAPIColumnOfType<LensApiDifferencesOperation>('differences', options)) {
    if (isApiColumnOfReferableType(options.of)) {
      const [refColumn] = fromMetricAPItoLensState(options.of);
      if (!refColumn || !isColumnOfReferableType(refColumn)) {
        return [];
      }
      return [fromDifferencesAPItoLensState(options), refColumn];
    }
  }
  throw new Error(`Unsupported metric operation: ${options.operation}`);
}

export function getMetricReferableApiColumnFromLensState(
  parentColumn: ReferenceMetricLensStateColumn,
  columns: Record<string, AnyLensStateColumn>
): LensApiReferableMetricOperations {
  const refId = parentColumn.references[0];
  if (refId == null || columns[refId] == null) {
    throw new Error(`Missing referenced metric operation for ${parentColumn.operationType}`);
  }
  const refColumn = columns[refId];
  if (isLensStateBucketColumnType(refColumn)) {
    throw new Error(`Unsupported referenced metric operation: ${refColumn.operationType}`);
  }
  if (!isColumnOfReferableType(refColumn)) {
    throw Error(`Unsupported referable metric operation: ${refColumn.operationType}`);
  }
  const retColumn = getMetricApiColumnFromLensState(refColumn, columns) as
    | LensApiReferableMetricOperations
    | undefined;
  if (!retColumn) {
    throw new Error(`Unsupported referenced metric operation: ${refColumn.operationType}`);
  }
  return retColumn;
}

export function getMetricApiColumnFromLensState(
  options: AnyMetricLensStateColumn,
  columns: Record<string, AnyLensStateColumn>
): LensApiAllMetricOrFormulaOperations | LensApiStaticValueOperation {
  if (isLensStateColumnOfType<CountIndexPatternColumn>('count', options)) {
    return fromCountLensStateToAPI(options);
  }
  if (isLensStateColumnOfType<CardinalityIndexPatternColumn>('unique_count', options)) {
    return fromUniqueCountLensStateToAPI(options);
  }
  if (
    isLensStateColumnOfType<AvgIndexPatternColumn>('average', options) ||
    isLensStateColumnOfType<MedianIndexPatternColumn>('median', options) ||
    isLensStateColumnOfType<MinIndexPatternColumn>('min', options) ||
    isLensStateColumnOfType<MaxIndexPatternColumn>('max', options) ||
    isLensStateColumnOfType<StandardDeviationIndexPatternColumn>('standard_deviation', options)
  ) {
    return fromBasicMetricLensStateToAPI(options);
  }
  if (isLensStateColumnOfType<SumIndexPatternColumn>('sum', options)) {
    return fromSumMetricLensStateToAPI(options);
  }
  if (isLensStateColumnOfType<StaticValueIndexPatternColumn>('static_value', options)) {
    return fromStaticValueLensStateToAPI(options);
  }
  if (isLensStateColumnOfType<FormulaIndexPatternColumn>('formula', options)) {
    return fromFormulaLensStateToAPI(options);
  }
  if (isLensStateColumnOfType<LastValueIndexPatternColumn>('last_value', options)) {
    return fromLastValueLensStateToAPI(options);
  }
  if (isLensStateColumnOfType<PercentileIndexPatternColumn>('percentile', options)) {
    return fromPercentileLensStateToAPI(options);
  }
  if (isLensStateColumnOfType<PercentileRanksIndexPatternColumn>('percentile_rank', options)) {
    return fromPercentileRankLensStateToAPI(options);
  }
  if (isLensStateColumnOfType<MovingAverageIndexPatternColumn>('moving_average', options)) {
    const refColumn = getMetricReferableApiColumnFromLensState(options, columns);
    return fromMovingAverageLensStateToAPI(options, refColumn);
  }
  if (isLensStateColumnOfType<CounterRateIndexPatternColumn>('counter_rate', options)) {
    const refColumn = getMetricReferableApiColumnFromLensState(options, columns);
    if (!isAPIColumnOfType<LensApiMetricOperation>('max', refColumn)) {
      throw new Error(`Unsupported referenced metric operation: ${options.operationType}`);
    }
    return fromCounterRateLensStateToAPI(options, refColumn);
  }
  if (isLensStateColumnOfType<CumulativeSumIndexPatternColumn>('cumulative_sum', options)) {
    const refColumn = getMetricReferableApiColumnFromLensState(options, columns);
    if (
      !isAPIColumnOfType<LensApiCountMetricOperation>('count', refColumn) &&
      !isAPIColumnOfType<LensApiSumMetricOperation>('sum', refColumn)
    ) {
      throw new Error(`Unsupported referenced metric operation: ${options.operationType}`);
    }
    return fromCumulativeSumLensStateToAPI(options, refColumn);
  }
  if (isLensStateColumnOfType<DerivativeIndexPatternColumn>('differences', options)) {
    const refColumn = getMetricReferableApiColumnFromLensState(options, columns);
    return fromDifferencesLensStateToAPI(options, refColumn);
  }
  throw new Error(`Unsupported metric operation`);
}
