/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Position } from '@elastic/charts';
import type { SeriesType, XYDataLayerConfig, XYVisualizationState } from '@kbn/lens-common';
import { convertAreaFill } from './area_fill';

const dataLayer = (seriesType: SeriesType): XYDataLayerConfig => ({
  layerId: `layer-${seriesType}`,
  layerType: 'data',
  seriesType,
  accessors: ['a'],
});

const stateWith = (
  seriesTypes: SeriesType[],
  areaFill?: XYVisualizationState['areaFill']
): XYVisualizationState => ({
  legend: { isVisible: true, position: Position.Bottom },
  preferredSeriesType: seriesTypes[0],
  layers: seriesTypes.map(dataLayer),
  ...(areaFill ? { areaFill } : {}),
});

describe('convertAreaFill', () => {
  it.each(['area', 'area_stacked', 'area_percentage_stacked'] as SeriesType[])(
    'should set areaFill to solid for legacy %s states where it is undefined',
    (seriesType) => {
      const state = stateWith([seriesType]);
      expect(convertAreaFill(state)).toEqual({ ...state, areaFill: 'solid' });
    }
  );

  it('should set areaFill to solid when it has layers that are areas', () => {
    const state = stateWith(['bar', 'area']);
    expect(convertAreaFill(state).areaFill).toBe('solid');
  });

  it('should not set areaFill when no area layer exists', () => {
    const state = stateWith(['bar_stacked', 'line']);
    expect(convertAreaFill(state)).toBe(state);
  });

  it.each(['solid', 'gradient'] as const)('should preserve an explicit %s areaFill', (areaFill) => {
    const state = stateWith(['area'], areaFill);
    expect(convertAreaFill(state)).toBe(state);
  });
});
