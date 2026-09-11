/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const XY_VIS = 'xyVis';
export const LAYERED_XY_VIS = 'layeredXyVis';
export const DATA_DECORATION_CONFIG = 'dataDecorationConfig';
export const REFERENCE_LINE_DECORATION_CONFIG = 'referenceLineDecorationConfig';
export const EXTENDED_REFERENCE_LINE_DECORATION_CONFIG = 'extendedReferenceLineDecorationConfig';
export const X_AXIS_CONFIG = 'xAxisConfig';
export const Y_AXIS_CONFIG = 'yAxisConfig';
export const DATA_LAYER = 'dataLayer';
export const EXTENDED_DATA_LAYER = 'extendedDataLayer';
export const LEGEND_CONFIG = 'legendConfig';
export const XY_VIS_RENDERER = 'xyVis';
export const ANNOTATION_LAYER = 'annotationLayer';
export const EXTENDED_ANNOTATION_LAYER = 'extendedAnnotationLayer';
export const AXIS_EXTENT_CONFIG = 'axisExtentConfig';
export const REFERENCE_LINE = 'referenceLine';
export const REFERENCE_LINE_LAYER = 'referenceLineLayer';
export const POINTS_LAYER = 'pointsLayer';

export const LayerTypes = {
  DATA: 'data',
  REFERENCELINE: 'referenceLine',
  ANNOTATIONS: 'annotations',
  POINTS: 'points',
} as const;

export const FittingFunctions = {
  NONE: 'None',
  ZERO: 'Zero',
  LINEAR: 'Linear',
  CARRY: 'Carry',
  LOOKAHEAD: 'Lookahead',
  AVERAGE: 'Average',
  NEAREST: 'Nearest',
} as const;

export const EndValues = {
  NONE: 'None',
  ZERO: 'Zero',
  NEAREST: 'Nearest',
} as const;

export const YAxisModes = {
  AUTO: 'auto',
  LEFT: 'left',
  RIGHT: 'right',
  BOTTOM: 'bottom',
} as const;

export const AxisExtentModes = {
  FULL: 'full',
  CUSTOM: 'custom',
  DATA_BOUNDS: 'dataBounds',
} as const;

export const LineStyles = {
  SOLID: 'solid',
  DASHED: 'dashed',
  DOTTED: 'dotted',
  DOT_DASHED: 'dot-dashed',
} as const;

export const FillStyles = {
  NONE: 'none',
  ABOVE: 'above',
  BELOW: 'below',
} as const;

export const IconPositions = {
  AUTO: 'auto',
  LEFT: 'left',
  RIGHT: 'right',
  ABOVE: 'above',
  BELOW: 'below',
} as const;

export const SeriesTypes = {
  BAR: 'bar',
  LINE: 'line',
  AREA: 'area',
} as const;

export const YScaleTypes = {
  TIME: 'time',
  LINEAR: 'linear',
  LOG: 'log',
  SQRT: 'sqrt',
} as const;

export const XScaleTypes = {
  TIME: 'time',
  LINEAR: 'linear',
  ORDINAL: 'ordinal',
} as const;

export const XYCurveTypes = {
  LINEAR: 'LINEAR',
  CURVE_MONOTONE_X: 'CURVE_MONOTONE_X',
  CURVE_STEP_AFTER: 'CURVE_STEP_AFTER',
} as const;

export const ValueLabelModes = {
  HIDE: 'hide',
  SHOW: 'show',
} as const;

export const AvailableReferenceLineIcons = {
  EMPTY: 'empty',
  ASTERISK: 'asterisk',
  ALERT: 'alert',
  BELL: 'bell',
  BOLT: 'bolt',
  BUG: 'bug',
  CIRCLE: 'circle',
  EDITOR_COMMENT: 'editorComment',
  FLAG: 'flag',
  HEART: 'heart',
  MAP_MARKER: 'mapMarker',
  PIN_FILLED: 'pinFilled',
  STAR_EMPTY: 'starEmpty',
  STAR_FILLED: 'starFilled',
  TAG: 'tag',
  TRIANGLE: 'triangle',
} as const;

export const AxisModes = {
  NORMAL: 'normal',
  PERCENTAGE: 'percentage',
  WIGGLE: 'wiggle',
  SILHOUETTE: 'silhouette',
} as const;

export const PointVisibilityOptions = {
  ALWAYS: 'always',
  NEVER: 'never',
  AUTO: 'auto',
} as const;

export const AreaFillOptions = {
  SOLID: 'solid',
  GRADIENT: 'gradient',
} as const;
