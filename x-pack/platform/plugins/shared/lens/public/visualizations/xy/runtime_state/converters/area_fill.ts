/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AreaFillOptions, type AreaFillOption } from '@kbn/expression-xy-plugin/common';
import type { XYVisualizationState } from '@kbn/lens-common';
import { hasAreaSeries } from '../../state_helpers';

const LEGACY_AREA_FILL: AreaFillOption = AreaFillOptions.SOLID;

/**
 * Normalizes legacy saved states where `areaFill` was not yet persisted.
 *
 * New charts default to "gradient", but charts saved before the option existed
 * always rendered as "solid", so old saved objects must get it explicitly to
 * keep their appearance unchanged.
 */
export const convertAreaFill = (state: XYVisualizationState): XYVisualizationState => {
  if (state.areaFill === undefined && hasAreaSeries(state.layers)) {
    return { ...state, areaFill: LEGACY_AREA_FILL };
  }
  return state;
};
