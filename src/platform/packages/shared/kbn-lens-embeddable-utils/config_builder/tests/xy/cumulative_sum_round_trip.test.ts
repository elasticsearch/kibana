/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LENS_DOCUMENT_FIELD_NAME } from '@kbn/lens-common';
import type { FormBasedLayer, GenericIndexPatternColumn } from '@kbn/lens-common';
import { LensConfigBuilder } from '../../config_builder';
import type { XYConfig } from '../../schema';
import type { LensApiCumulativeSumOperation } from '../../schema/metric_ops';
import { isAPIDataLayer, isAPIesqlXYLayer } from '../../transforms/charts/xy/helpers';
import { isAPIColumnOfType } from '../../transforms/columns/utils';
import type { LensAttributes } from '../../types';
import { validator } from '../utils/validator';
import {
  xyWithCumulativeSumOfCountReference,
  xyWithCumulativeSumOfSumReference,
} from './cumulative_sum.mock';

function getCumulativeSumMetric(apiConfig: XYConfig): LensApiCumulativeSumOperation {
  const layer = apiConfig.layers[0];
  if (!isAPIDataLayer(layer) || isAPIesqlXYLayer(layer)) {
    fail('Expected a form-based data layer');
  }

  const cumsum = layer.y.find((metric) =>
    isAPIColumnOfType<LensApiCumulativeSumOperation>('cumulative_sum', metric)
  );
  if (!cumsum) {
    fail('Expected a cumulative_sum metric');
  }

  return cumsum;
}

function getCumulativeSumReferenceColumn(attributes: LensAttributes): GenericIndexPatternColumn {
  const layer = Object.values(attributes.state.datasourceStates.formBased?.layers ?? {})[0] as
    | FormBasedLayer
    | undefined;
  if (!layer) {
    fail('Expected a form-based layer');
  }

  const cumsumColumn = Object.values(layer.columns).find(
    (column) => column.operationType === 'cumulative_sum'
  );
  if (!cumsumColumn || !('references' in cumsumColumn) || cumsumColumn.references.length === 0) {
    fail('Expected a cumulative_sum column with a reference');
  }

  const refColumn = layer.columns[cumsumColumn.references[0]];
  if (!refColumn) {
    fail('Expected a referenced column');
  }

  return refColumn;
}

describe('Cumulative sum SO round-trip', () => {
  const builder = new LensConfigBuilder(undefined, true);

  it('round-trips cumulative_sum with a sum reference column', () => {
    const attributes = xyWithCumulativeSumOfSumReference;

    validator.xy.fromState(attributes);

    const apiConfig = builder.toAPIFormat(attributes) as XYConfig;
    const cumsumMetric = getCumulativeSumMetric(apiConfig);
    expect(cumsumMetric.field).toBe('bytes');

    const roundTrippedAttributes = builder.fromAPIFormat(apiConfig);
    const roundTrippedApiConfig = builder.toAPIFormat(roundTrippedAttributes) as XYConfig;

    expect(getCumulativeSumMetric(roundTrippedApiConfig)).toEqual(cumsumMetric);

    const refColumn = getCumulativeSumReferenceColumn(roundTrippedAttributes);
    expect(refColumn.operationType).toBe('sum');
    expect(refColumn).toHaveProperty('sourceField', 'bytes');
  });

  it('round-trips cumulative_sum with a count of records reference column', () => {
    const attributes = xyWithCumulativeSumOfCountReference;

    validator.xy.fromState(attributes);

    const apiConfig = builder.toAPIFormat(attributes) as XYConfig;
    const cumsumMetric = getCumulativeSumMetric(apiConfig);
    expect(cumsumMetric.field).toBeUndefined();

    const roundTrippedAttributes = builder.fromAPIFormat(apiConfig);
    const roundTrippedApiConfig = builder.toAPIFormat(roundTrippedAttributes) as XYConfig;

    expect(getCumulativeSumMetric(roundTrippedApiConfig)).toEqual(cumsumMetric);

    const refColumn = getCumulativeSumReferenceColumn(roundTrippedAttributes);
    expect(refColumn.operationType).toBe('count');
    expect(refColumn).toHaveProperty('sourceField', LENS_DOCUMENT_FIELD_NAME);
  });
});
