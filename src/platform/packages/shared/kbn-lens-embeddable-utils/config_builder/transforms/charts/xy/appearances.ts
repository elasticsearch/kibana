/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SeriesType, XYVisualizationState as XYVisualizationState } from '@kbn/lens-common';
import type { XYCurveType, FittingFunction, EndValue } from '@kbn/expression-xy-plugin/common';
import type { $Values } from 'utility-types';
import type { XYConfig } from '../../../schema/charts/xy';
import type { XYApiLineInterpolation } from '../../../schema/charts/xy';
import { getReversibleMappings, stripUndefined } from '../utils';
import {
  DEFAULT_AREAS_FILL,
  DEFAULT_AREAS_FILL_OPACITY,
  DEFAULT_BARS_MINIMUM_HEIGHT,
  DEFAULT_CURRENT_TIME_MARKER_VISIBLE,
  DEFAULT_DATA_LABELS_VISIBLE,
  DEFAULT_LINES_INTERPOLATION,
  DEFAULT_PARTIAL_BUCKETS_VISIBLE,
  DEFAULT_POINTS_VISIBILITY,
} from './defaults';

type XYStyling = NonNullable<XYConfig['styling']>;
export type XYLensAppearanceState = Pick<
  XYVisualizationState,
  | 'valueLabels'
  | 'curveType'
  | 'fillOpacity'
  | 'areaFill'
  | 'minBarHeight'
  | 'hideEndzones'
  | 'showCurrentTimeMarker'
  | 'pointVisibility'
  | 'fittingFunction'
  | 'emphasizeFitting'
  | 'endValue'
>;

const curveTypeCompat = getReversibleMappings<$Values<XYApiLineInterpolation>, XYCurveType>([
  ['linear', 'LINEAR'],
  ['smooth', 'CURVE_MONOTONE_X'],
  ['stepped', 'CURVE_STEP_AFTER'],
]);

const pointVisibilityCompat = getReversibleMappings([
  ['auto', 'auto'],
  ['visible', 'always'],
  ['hidden', 'never'],
]);

const fittingFunctionCompat = getReversibleMappings<
  NonNullable<XYStyling['fitting']>['type'],
  FittingFunction
>([
  ['none', 'None'],
  ['zero', 'Zero'],
  ['linear', 'Linear'],
  ['carry', 'Carry'],
  ['lookahead', 'Lookahead'],
  ['average', 'Average'],
  ['nearest', 'Nearest'],
]);

const extendCompat = getReversibleMappings<
  NonNullable<NonNullable<XYStyling['fitting']>['extend']>,
  EndValue
>([
  ['none', 'None'],
  ['zero', 'Zero'],
  ['nearest', 'Nearest'],
]);

function getLayerPresence(seriesTypes: SeriesType[]) {
  return seriesTypes.reduce(
    (acc, type) => {
      if (type.startsWith('bar')) {
        acc.hasBars = true;
      } else if (type.startsWith('area')) {
        acc.hasAreas = true;
      } else if (type === 'line') {
        acc.hasLines = true;
      }
      return acc;
    },
    { hasBars: false, hasLines: false, hasAreas: false }
  );
}

export function convertStylingToAPIFormat(
  config: XYLensAppearanceState,
  seriesTypes: SeriesType[]
): XYStyling {
  const layerPresence = getLayerPresence(seriesTypes);
  const hasLinesOrAreas = layerPresence.hasLines || layerPresence.hasAreas;

  return stripUndefined<XYStyling>({
    // Chart-level (always present)
    overlays: {
      partial_buckets: {
        visible:
          config.hideEndzones != null ? !config.hideEndzones : DEFAULT_PARTIAL_BUCKETS_VISIBLE,
      },
      current_time_marker: {
        visible: config.showCurrentTimeMarker ?? DEFAULT_CURRENT_TIME_MARKER_VISIBLE,
      },
    },
    // Lines + areas shared (alphabetical)
    fitting: hasLinesOrAreas ? convertFittingToAPIFormat(config) : undefined,
    interpolation: hasLinesOrAreas
      ? curveTypeCompat.toAPI(config.curveType) ?? DEFAULT_LINES_INTERPOLATION
      : undefined,
    points: hasLinesOrAreas
      ? {
          visibility:
            pointVisibilityCompat.toAPI(config.pointVisibility) ?? DEFAULT_POINTS_VISIBILITY,
        }
      : undefined,
    // Series-type specific (alphabetical)
    areas: layerPresence.hasAreas
      ? {
          fill: config.areaFill ?? ('solid' as const), // Preserve legacy default when no area fill is provided
          fill_opacity: config.fillOpacity ?? DEFAULT_AREAS_FILL_OPACITY,
        }
      : undefined,
    bars: layerPresence.hasBars
      ? {
          minimum_height: config.minBarHeight ?? DEFAULT_BARS_MINIMUM_HEIGHT,
          data_labels: {
            visible:
              config.valueLabels != null
                ? config.valueLabels !== 'hide'
                : DEFAULT_DATA_LABELS_VISIBLE,
          },
        }
      : undefined,
  });
}

function convertFittingToAPIFormat(
  config: Pick<XYLensAppearanceState, 'fittingFunction' | 'emphasizeFitting' | 'endValue'>
): XYStyling['fitting'] {
  const type = fittingFunctionCompat.toAPI(config.fittingFunction);
  if (!type) {
    return undefined;
  }
  return {
    type,
    ...stripUndefined({
      emphasize: config.emphasizeFitting,
      extend: extendCompat.toAPI(config.endValue),
    }),
  };
}

export function convertStylingToStateFormat(
  config: XYStyling,
  seriesTypes: SeriesType[]
): XYLensAppearanceState {
  const layerPresence = getLayerPresence(seriesTypes);

  return stripUndefined<XYLensAppearanceState>({
    hideEndzones:
      config.overlays?.partial_buckets?.visible != null
        ? !config.overlays.partial_buckets.visible
        : undefined,
    showCurrentTimeMarker: config.overlays?.current_time_marker?.visible,
    valueLabels:
      config.bars?.data_labels != null
        ? config.bars.data_labels.visible
          ? 'show'
          : 'hide'
        : undefined,
    pointVisibility: pointVisibilityCompat.toState(config.points?.visibility),
    curveType: curveTypeCompat.toState(config.interpolation),
    minBarHeight: config.bars?.minimum_height,
    ...(layerPresence.hasAreas
      ? {
          fillOpacity: config.areas?.fill_opacity ?? DEFAULT_AREAS_FILL_OPACITY,
          areaFill: config.areas?.fill ?? DEFAULT_AREAS_FILL,
        }
      : {}),
    fittingFunction: fittingFunctionCompat.toState(config.fitting?.type),
    emphasizeFitting: config.fitting?.emphasize,
    endValue: extendCompat.toState(config.fitting?.extend),
  });
}
