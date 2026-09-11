/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SeriesType } from '@kbn/lens-common';
import type { XYConfig } from '../../../schema/charts/xy';
import {
  convertStylingToAPIFormat,
  convertStylingToStateFormat,
  type XYLensAppearanceState,
} from './appearances';
import {
  DEFAULT_AREAS_FILL_OPACITY,
  DEFAULT_BARS_MINIMUM_HEIGHT,
  DEFAULT_CURRENT_TIME_MARKER_VISIBLE,
  DEFAULT_DATA_LABELS_VISIBLE,
  DEFAULT_LINES_INTERPOLATION,
  DEFAULT_PARTIAL_BUCKETS_VISIBLE,
  DEFAULT_POINTS_VISIBILITY,
} from './defaults';

const allLayersPresent: SeriesType[] = ['bar', 'area', 'line'];

describe('XY Appearances Transforms', () => {
  it('should return empty state when given empty API config', () => {
    const apiConfig: XYConfig['styling'] = {};
    const result = convertStylingToStateFormat(apiConfig, ['line']);
    expect(result).toEqual({});
  });

  it('should default areaFill when omitted to gradient', () => {
    expect(convertStylingToStateFormat({ areas: { fill_opacity: 0.5 } }, ['area'])).toEqual({
      fillOpacity: 0.5,
      areaFill: 'gradient' as const,
    });
  });

  it('should report a state without areaFill as solid rather than the new default', () => {
    const result = convertStylingToAPIFormat({ fillOpacity: 0.5 }, ['area']);
    expect(result.areas?.fill).toBe('solid');
  });

  it('should report an explicit areaFill unchanged', () => {
    expect(convertStylingToAPIFormat({ areaFill: 'solid' }, ['area']).areas?.fill).toBe('solid');
    expect(convertStylingToAPIFormat({ areaFill: 'gradient' }, ['area']).areas?.fill).toBe(
      'gradient'
    );
  });

  it('should fill styling defaults when converting empty state to API format', () => {
    const result = convertStylingToAPIFormat({}, allLayersPresent);
    expect(result.bars?.minimum_height).toBe(DEFAULT_BARS_MINIMUM_HEIGHT);
    expect(result.areas?.fill_opacity).toBe(DEFAULT_AREAS_FILL_OPACITY);
    expect(result.areas?.fill).toBe('solid'); // Legacy default
    expect(result.points?.visibility).toBe(DEFAULT_POINTS_VISIBILITY);
    expect(result.interpolation).toBe(DEFAULT_LINES_INTERPOLATION);
    expect(result.overlays?.partial_buckets?.visible).toBe(DEFAULT_PARTIAL_BUCKETS_VISIBLE);
    expect(result.overlays?.current_time_marker?.visible).toBe(DEFAULT_CURRENT_TIME_MARKER_VISIBLE);
    expect(result.bars?.data_labels?.visible).toBe(DEFAULT_DATA_LABELS_VISIBLE);
  });

  it('should omit bars styling when no bar layers exist', () => {
    const result = convertStylingToAPIFormat({}, ['line', 'area']);
    expect(result.bars).toBeUndefined();
    expect(result.areas).toBeDefined();
    expect(result.points).toBeDefined();
    expect(result.interpolation).toBeDefined();
  });

  it('should include interpolation when area layers exist without line layers', () => {
    const result = convertStylingToAPIFormat({}, ['area_stacked', 'bar']);
    expect(result.interpolation).toBeDefined();
    expect(result.bars).toBeDefined();
    expect(result.areas).toBeDefined();
    expect(result.points).toBeDefined();
  });

  it('should omit areas styling when no area layers exist', () => {
    const result = convertStylingToAPIFormat({}, ['bar_stacked', 'line']);
    expect(result.areas).toBeUndefined();
    expect(result.bars).toBeDefined();
    expect(result.interpolation).toBeDefined();
    expect(result.points).toBeDefined();
  });

  it('should omit points, interpolation, and fitting when no line or area layers exist', () => {
    const result = convertStylingToAPIFormat({}, ['bar']);
    expect(result.points).toBeUndefined();
    expect(result.interpolation).toBeUndefined();
    expect(result.fitting).toBeUndefined();
    expect(result.bars).toBeDefined();
  });

  it('should include fitting under styling when line layers exist', () => {
    const result = convertStylingToAPIFormat(
      { fittingFunction: 'Linear', emphasizeFitting: true, endValue: 'Zero' },
      ['line']
    );
    expect(result.fitting).toEqual({ type: 'linear', emphasize: true, extend: 'zero' });
  });

  it('should include fitting under styling when area layers exist', () => {
    const result = convertStylingToAPIFormat({ fittingFunction: 'Average' }, ['area']);
    expect(result.fitting).toEqual({ type: 'average' });
  });

  it('should include points styling when only area layers exist', () => {
    const result = convertStylingToAPIFormat({}, ['area_percentage_stacked']);
    expect(result.points).toBeDefined();
  });

  it('should negate hideEndzones when converting to partial_buckets.visible', () => {
    const hidden = convertStylingToAPIFormat({ hideEndzones: true }, ['line']);
    expect(hidden.overlays?.partial_buckets?.visible).toBe(false);

    const shown = convertStylingToAPIFormat({ hideEndzones: false }, ['line']);
    expect(shown.overlays?.partial_buckets?.visible).toBe(true);
  });

  it('should use DEFAULT_PARTIAL_BUCKETS_VISIBLE when hideEndzones is omitted', () => {
    const result = convertStylingToAPIFormat({}, ['line']);
    expect(result.overlays?.partial_buckets?.visible).toBe(DEFAULT_PARTIAL_BUCKETS_VISIBLE);
  });

  it('should negate partial_buckets.visible when converting to hideEndzones', () => {
    const hidden = convertStylingToStateFormat(
      {
        overlays: { partial_buckets: { visible: false } },
      },
      ['line']
    );
    expect(hidden.hideEndzones).toBe(true);

    const shown = convertStylingToStateFormat(
      {
        overlays: { partial_buckets: { visible: true } },
      },
      ['line']
    );
    expect(shown.hideEndzones).toBe(false);
  });

  it('should omit hideEndzones when partial_buckets is absent', () => {
    const result = convertStylingToStateFormat({}, ['line']);
    expect(result.hideEndzones).toBeUndefined();
  });

  it('should always include overlays regardless of layer types', () => {
    const result = convertStylingToAPIFormat({}, ['bar']);
    expect(result.overlays).toBeDefined();
    expect(result.overlays?.partial_buckets).toBeDefined();
    expect(result.overlays?.current_time_marker).toBeDefined();
  });

  it('should include data_labels under bars when bar layers exist', () => {
    const result = convertStylingToAPIFormat({}, ['bar']);
    expect(result.bars?.data_labels?.visible).toBe(DEFAULT_DATA_LABELS_VISIBLE);
  });

  it('should omit data_labels when no bar layers exist', () => {
    const result = convertStylingToAPIFormat({}, ['line']);
    expect(result.bars).toBeUndefined();
  });

  it('should preserve complex config through API -> State -> API', () => {
    const original: XYConfig['styling'] = {
      overlays: {
        partial_buckets: { visible: true },
        current_time_marker: { visible: true },
      },
      points: { visibility: 'auto' },
      interpolation: 'smooth',
      bars: { minimum_height: 3, data_labels: { visible: true } },
      areas: { fill_opacity: 0.5, fill: 'gradient' },
      fitting: { type: 'linear', emphasize: true, extend: 'zero' },
    };
    const state = convertStylingToStateFormat(original, allLayersPresent);
    const result = convertStylingToAPIFormat(state, allLayersPresent);

    expect(result.overlays?.partial_buckets).toEqual(original.overlays?.partial_buckets);
    expect(result.overlays?.current_time_marker).toEqual(original.overlays?.current_time_marker);
    expect(result.bars?.data_labels).toEqual(original.bars?.data_labels);
    expect(result.points?.visibility).toBe(original.points?.visibility);
    expect(result.interpolation).toBe(original.interpolation);
    expect(result.bars?.minimum_height).toBe(original.bars?.minimum_height);
    expect(result.areas?.fill_opacity).toBe(original.areas?.fill_opacity);
    expect(result.areas?.fill).toBe(original.areas?.fill);
    expect(result.fitting).toEqual(original.fitting);
  });

  it('should preserve complex config through State -> API -> State', () => {
    const original: Partial<XYLensAppearanceState> = {
      valueLabels: 'show' as const,
      curveType: 'CURVE_STEP_AFTER' as const,
      fillOpacity: 0.8,
      areaFill: 'gradient' as const,
      minBarHeight: 2,
      hideEndzones: false,
      showCurrentTimeMarker: true,
      pointVisibility: 'always' as const,
      fittingFunction: 'Linear' as const,
      emphasizeFitting: true,
      endValue: 'Zero' as const,
    };

    const api = convertStylingToAPIFormat(original, allLayersPresent);
    const result = convertStylingToStateFormat(api, allLayersPresent);

    expect(result.valueLabels).toBe(original.valueLabels);
    expect(result.curveType).toBe(original.curveType);
    expect(result.fillOpacity).toBe(original.fillOpacity);
    expect(result.areaFill).toBe(original.areaFill);
    expect(result.minBarHeight).toBe(original.minBarHeight);
    expect(result.hideEndzones).toBe(original.hideEndzones);
    expect(result.showCurrentTimeMarker).toBe(original.showCurrentTimeMarker);
    expect(result.pointVisibility).toBe(original.pointVisibility);
    expect(result.fittingFunction).toBe(original.fittingFunction);
    expect(result.emphasizeFitting).toBe(original.emphasizeFitting);
    expect(result.endValue).toBe(original.endValue);
  });
});
