/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CumulativeSumIndexPatternColumn } from '@kbn/lens-common';
import type {
  LensApiCountMetricOperation,
  LensApiCumulativeSumOperation,
  LensApiSumMetricOperation,
} from '../../schema/metric_ops';
import { fromFormatAPIToLensState, fromFormatLensStateToAPI } from './format';
import { getLensAPIMetricSharedProps, getLensStateMetricSharedProps } from './utils';

export const fromCumulativeSumAPItoLensState = (
  options: LensApiCumulativeSumOperation
): CumulativeSumIndexPatternColumn => {
  const { format } = options;

  return {
    operationType: 'cumulative_sum',
    references: [], // populated later when we have the ID of the referenced column
    ...getLensStateMetricSharedProps(options),
    params: {
      ...(format ? { format: fromFormatAPIToLensState(format) } : {}),
    },
  };
};

export const fromCumulativeSumLensStateToAPI = (
  options: CumulativeSumIndexPatternColumn,
  ref: LensApiCountMetricOperation | LensApiSumMetricOperation
): LensApiCumulativeSumOperation => {
  return {
    operation: 'cumulative_sum',
    ...(ref.operation === 'sum' ? { field: ref.field } : {}),
    ...getLensAPIMetricSharedProps(options),
    ...(options.params?.format ? { format: fromFormatLensStateToAPI(options.params.format) } : {}),
  };
};
