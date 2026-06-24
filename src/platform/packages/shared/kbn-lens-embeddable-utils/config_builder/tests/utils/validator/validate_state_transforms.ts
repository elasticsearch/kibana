/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LensConfigBuilder } from '../../../config_builder';
import type { LensApiConfigByType, LensApiConfigChartType } from '../../../schema';
import { lensApiConfigSchema } from '../../../schema';
import type { ValidateTransform } from './types';
import { getChartSchema } from './schema';
import { getChartNormalizer } from './normalizers';

const strictChartTypes = new Set([
  'heatmap',
  'data_table',
  'pie',
  'mosaic',
  'treemap',
  'waffle',
  'tag_cloud',
  'region_map',
  'metric',
]);

/**
 * Test harness to validate LensConfigBuilder conversions
 *
 * - Starts with LensAttributes
 * - Converts to API format
 * - Validates against the provided schema
 * - Validates against the general lensApiConfigSchema
 * - Converts back to LensAttributes
 * - Converts new LensAttributes to API format
 * - Validates against the provided schema
 * - Validates against the general lensApiConfigSchema
 */
export function validateStateTransformsFn(
  chartType: LensApiConfigChartType
): ValidateTransform<LensApiConfigByType[typeof chartType]>['fromState'] {
  const schema = getChartSchema(chartType);
  const builder = new LensConfigBuilder(undefined, true);
  const strict = strictChartTypes.has(chartType);

  return function validateStateTransforms(attributes) {
    const newApiConfig = builder.toAPIFormat(attributes);

    expect(() => {
      schema.validate(newApiConfig);
    }).not.toThrow();

    expect(() => {
      lensApiConfigSchema.validate(newApiConfig);
    }).not.toThrow();

    // Temporary strict mode, all checks should eventually be strict
    if (strict) {
      const normalizer = getChartNormalizer(chartType);
      const newAttributes = builder.fromAPIFormat(newApiConfig);
      const normalizedAttributes = normalizer?.({
        original: structuredClone(attributes),
        transformed: newAttributes,
      }) ?? {
        original: attributes,
        transformed: newAttributes,
      };

      expect(normalizedAttributes.transformed).toEqual(normalizedAttributes.original);
    }
  };
}
