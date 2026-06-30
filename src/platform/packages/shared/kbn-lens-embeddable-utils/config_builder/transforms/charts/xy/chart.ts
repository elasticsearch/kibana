/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AxisExtentConfig, YScaleType } from '@kbn/expression-xy-plugin/common';
import type { SavedObjectReference } from '@kbn/core/server';
import type { XYPersistedState, XYDataLayerConfig } from '@kbn/lens-common';
import type { XYConfig, XYConfigNoESQL, XYConfigESQL, XYLayer } from '../../../schema';
import type { DataSourceStateLayer } from '../../utils';
import { convertLegendToAPIFormat, convertLegendToStateFormat } from './legend';
import { buildXYLayer } from './state_layers';
import { isAPIesqlXYLayer, isLensStateDataLayer } from './helpers';
import { nonNullable, isFormBasedLayer, isTextBasedLayer } from '../../utils';
import { getReversibleMappings, getScaleTypeFromColumnType } from '../utils';
import {
  buildAPIAnnotationsLayer,
  buildAPIDataLayer,
  buildAPIReferenceLinesLayer,
} from './api_layers';
import { stripUndefined } from '../utils';
import { axisLabelOrientationCompat } from '../common';
import type { YAxisSchemaType, XAxisSchemaType, YScaleSchemaType } from '../../../schema/charts/xy';
import {
  DEFAULT_AXIS_GRID_VISIBLE,
  DEFAULT_AXIS_LABELS_ORIENTATION,
  DEFAULT_AXIS_TICKS_VISIBLE,
  DEFAULT_AXIS_TITLE_VISIBLE,
  DEFAULT_X_AXIS_DOMAIN,
  DEFAULT_Y_AXIS_DOMAIN,
} from './constants';
import type { XScaleSchemaType } from '../../../schema/charts/shared';

import {
  convertStylingToAPIFormat,
  convertStylingToStateFormat,
  type LayerPresence,
} from './appearances';

type DomainType = XAxisSchemaType['domain'] | YAxisSchemaType['domain'];

function convertAPIDomainToStateFormat(
  domain: DomainType,
  defaultConfig: NonNullable<DomainType>
): AxisExtentConfig | undefined {
  if (!domain) return;
  const domainRounding = { niceValues: domain.rounding ?? defaultConfig.rounding };
  switch (domain.type) {
    case 'full':
      return {
        mode: 'full',
        ...domainRounding,
      };
    case 'custom':
      return {
        mode: 'custom',
        lowerBound: domain.min,
        upperBound: domain.max,
        ...domainRounding,
      };
    case 'fit':
      return {
        mode: 'dataBounds',
        ...domainRounding,
      };
    default:
      return;
  }
}

function convertAxisSettingsToStateFormat(
  axis: XYConfig['axis']
): Pick<
  XYPersistedState,
  | 'xTitle'
  | 'yTitle'
  | 'yRightTitle'
  | 'yLeftScale'
  | 'yRightScale'
  | 'axisTitlesVisibilitySettings'
  | 'tickLabelsVisibilitySettings'
  | 'gridlinesVisibilitySettings'
  | 'xExtent'
  | 'yLeftExtent'
  | 'yRightExtent'
  | 'labelsOrientation'
> {
  const xAxis = axis?.x;
  const yLeftAxis = axis?.y;
  const yRightAxis = axis?.y2;

  const xExtent = convertAPIDomainToStateFormat(xAxis?.domain, DEFAULT_X_AXIS_DOMAIN);
  const yLeftExtent = convertAPIDomainToStateFormat(yLeftAxis?.domain, DEFAULT_Y_AXIS_DOMAIN);
  const yRightExtent = convertAPIDomainToStateFormat(yRightAxis?.domain, DEFAULT_Y_AXIS_DOMAIN);
  const axisTitlesVisibilitySettings =
    xAxis?.title?.visible == null &&
    yLeftAxis?.title?.visible == null &&
    yRightAxis?.title?.visible == null
      ? undefined
      : {
          x: xAxis?.title?.visible ?? true,
          yLeft: yLeftAxis?.title?.visible ?? true,
          yRight: yRightAxis?.title?.visible ?? true,
        };
  const tickLabelsVisibilitySettings =
    xAxis?.ticks?.visible == null &&
    yLeftAxis?.ticks?.visible == null &&
    yRightAxis?.ticks?.visible == null
      ? undefined
      : {
          x: xAxis?.ticks?.visible ?? true,
          yLeft: yLeftAxis?.ticks?.visible ?? true,
          yRight: yRightAxis?.ticks?.visible ?? true,
        };
  const gridlinesVisibilitySettings =
    xAxis?.grid?.visible == null &&
    yLeftAxis?.grid?.visible == null &&
    yRightAxis?.grid?.visible == null
      ? undefined
      : {
          x: xAxis?.grid?.visible ?? true,
          yLeft: yLeftAxis?.grid?.visible ?? true,
          yRight: yRightAxis?.grid?.visible ?? true,
        };
  const labelsOrientation =
    xAxis?.labels?.orientation == null &&
    yLeftAxis?.labels?.orientation == null &&
    yRightAxis?.labels?.orientation == null
      ? undefined
      : {
          x: axisLabelOrientationCompat.toState(xAxis?.labels?.orientation ?? 'horizontal'),
          yLeft: axisLabelOrientationCompat.toState(yLeftAxis?.labels?.orientation ?? 'horizontal'),
          yRight: axisLabelOrientationCompat.toState(
            yRightAxis?.labels?.orientation ?? 'horizontal'
          ),
        };
  const xTitle = xAxis?.title?.text;
  const yTitle = yLeftAxis?.title?.text;
  const yRightTitle = yRightAxis?.title?.text;
  const yLeftScale = yLeftAxis?.scale;
  const yRightScale = yRightAxis?.scale;
  return stripUndefined({
    xTitle: xTitle && xTitle !== '' ? xTitle : undefined,
    yTitle: yTitle && yTitle !== '' ? yTitle : undefined,
    yRightTitle: yRightTitle && yRightTitle !== '' ? yRightTitle : undefined,
    yLeftScale,
    yRightScale,
    axisTitlesVisibilitySettings,
    tickLabelsVisibilitySettings,
    gridlinesVisibilitySettings,
    xExtent,
    yLeftExtent,
    yRightExtent,
    labelsOrientation,
  });
}

function getLayerPresence(dataLayers: XYDataLayerConfig[]): LayerPresence {
  const seriesTypes = new Set(dataLayers.map((layer) => layer.seriesType));
  return {
    hasBars: [...seriesTypes].some((t) => t.startsWith('bar')),
    hasLines: seriesTypes.has('line'),
    hasAreas: [...seriesTypes].some((t) => t.startsWith('area')),
  };
}

export function buildVisualizationState(
  config: XYConfig,
  annotationGroupReferences: SavedObjectReference[]
): XYPersistedState {
  const layers = config.layers
    .map((layer, index) => buildXYLayer(config, layer, index, annotationGroupReferences))
    .filter(nonNullable);
  return {
    preferredSeriesType: layers.filter(isLensStateDataLayer)[0]?.seriesType ?? 'bar_stacked',
    ...convertLegendToStateFormat(config.legend),
    ...convertAxisSettingsToStateFormat(config.axis),
    ...(config.styling ? convertStylingToStateFormat(config.styling) : {}),
    layers,
  };
}

function areAllLayersEsql(apiLayers: XYLayer[]): apiLayers is XYConfigESQL['layers'] {
  return apiLayers.length > 0 && apiLayers.every(isAPIesqlXYLayer);
}

function areAllLayersNoEsql(apiLayers: XYLayer[]): apiLayers is XYConfigNoESQL['layers'] {
  return apiLayers.length > 0 && apiLayers.every((l) => !isAPIesqlXYLayer(l));
}

export function buildVisualizationAPI(
  config: XYPersistedState,
  layers: Record<string, DataSourceStateLayer>,
  adHocDataViews: Record<string, unknown>,
  references: SavedObjectReference[],
  internalReferences: SavedObjectReference[]
): XYConfig {
  const dataLayers = config.layers.filter(isLensStateDataLayer);
  if (!dataLayers.length) {
    throw new Error('At least one data layer is required to build the XY API state');
  }
  if (dataLayers.every((layer) => layer.accessors.length === 0)) {
    throw new Error(
      'Data layers must have at least one accessor defined to build the XY API state'
    );
  }
  const layerPresence = getLayerPresence(dataLayers);
  const { resolveAxisId, usedModes } = resolveAxisLayout(config);
  const apiLayers = buildXYLayerAPI(
    config,
    layers,
    adHocDataViews,
    references,
    internalReferences,
    resolveAxisId
  );
  if (apiLayers.length === 0) {
    throw new Error(
      'No layers could be built: datasource layers may be missing or have incompatible types'
    );
  }

  const axis = convertAxisSettingsToAPIFormat(config, layers, usedModes);
  const styling = convertStylingToAPIFormat(config, layerPresence);
  const legend = convertLegendToAPIFormat(config.legend);

  if (areAllLayersEsql(apiLayers)) {
    return {
      type: 'xy',
      layers: apiLayers,
      axis,
      styling,
      ...legend,
    };
  }
  if (areAllLayersNoEsql(apiLayers)) {
    return {
      type: 'xy',
      layers: apiLayers,
      axis,
      styling,
      ...legend,
    };
  }
  throw new Error('Mixed ESQL and non-ESQL layers are not supported');
}

function convertDomainStateToAPIFormat(
  domain: AxisExtentConfig | undefined,
  defaultConfig: NonNullable<DomainType>
): NonNullable<DomainType> {
  if (domain) {
    const rounding = domain.niceValues ?? defaultConfig.rounding;
    if (domain.mode === 'full') {
      return {
        type: 'full',
        rounding,
      };
    }
    if (domain.mode === 'custom') {
      if (domain.lowerBound == null || domain.upperBound == null) {
        return defaultConfig;
      }
      return {
        type: 'custom',
        min: domain.lowerBound,
        max: domain.upperBound,
        rounding,
      };
    }
    if (domain.mode === 'dataBounds') {
      return {
        type: 'fit',
        rounding,
      };
    }
  }
  return defaultConfig;
}

function convertXDomainStateToAPIFormat(
  axisExtent: AxisExtentConfig | undefined
): XAxisSchemaType['domain'] {
  const domain = convertDomainStateToAPIFormat(axisExtent, DEFAULT_X_AXIS_DOMAIN);
  // full domain is incompatible with X axis, only fit and custom are available
  return domain.type === 'full' ? DEFAULT_X_AXIS_DOMAIN : domain;
}

function convertYDomainStateToAPIFormat(
  axisExtent: AxisExtentConfig | undefined
): YAxisSchemaType['domain'] {
  return convertDomainStateToAPIFormat(axisExtent, DEFAULT_Y_AXIS_DOMAIN);
}

type YAxisMode = 'left' | 'right';
type YAccessorAxisModeMap = Map<string, YAxisMode>;
export type ResolveAxisId = (mode: YAxisMode) => 'y' | 'y2';

export function getYAccessorAxisModeMap(
  layer: XYDataLayerConfig,
  accessorKey: (accessor: string) => string
): YAccessorAxisModeMap {
  const modePerAccessor: YAccessorAxisModeMap = new Map();
  layer.accessors.forEach((accessor) => {
    modePerAccessor.set(accessorKey(accessor), 'left');
  });
  layer.yConfig?.forEach((yConfig) => {
    if (yConfig.axisMode === 'right') {
      modePerAccessor.set(accessorKey(yConfig.forAccessor), 'right');
    }
  });
  return modePerAccessor;
}

/**
 * Determines which axis modes (left/right from Lens internal state) are used
 * across all data layers and builds a resolver to map them to API axis IDs.
 *
 * Left always maps to `y`, right always maps to `y2`.
 * When only one mode is used, the resolver returns the matching axis ID
 * (`y` for left-only, `y2` for right-only).
 * When both modes are used, left maps to `y` and right to `y2`.
 */
function resolveAxisLayout(config: XYPersistedState): {
  resolveAxisId: ResolveAxisId;
  usedModes: Set<YAxisMode>;
} {
  const usedModes = new Set<YAxisMode>();
  for (const layer of config.layers) {
    if (isLensStateDataLayer(layer)) {
      for (const mode of getYAccessorAxisModeMap(layer, (a) => a).values()) {
        usedModes.add(mode);
      }
    }
  }
  const resolveAxisId: ResolveAxisId = (mode) => (mode === 'left' ? 'y' : 'y2');
  return { resolveAxisId, usedModes };
}

const yAxisScaleCompat = getReversibleMappings<YScaleSchemaType, YScaleType>([
  ['linear', 'linear'],
  ['log', 'log'],
  ['sqrt', 'sqrt'],
]);

function convertAxisSettingsToAPIFormat(
  config: XYPersistedState,
  layers: Record<string, DataSourceStateLayer>,
  usedModes: Set<YAxisMode>
): NonNullable<XYConfig['axis']> {
  let xAxisScale: XScaleSchemaType | undefined;
  const firstLayer = config.layers[0];
  const dataSourceLayer = layers[firstLayer.layerId];
  if (isTextBasedLayer(dataSourceLayer) && isLensStateDataLayer(firstLayer)) {
    const xColumn = dataSourceLayer.columns.find((c) => c.columnId === firstLayer.xAccessor);
    xAxisScale = getScaleTypeFromColumnType(xColumn?.meta?.type);
  }

  const xTitleVisible = config.axisTitlesVisibilitySettings?.x;
  const xAxis = stripUndefined({
    title: stripUndefined({
      text: xTitleVisible !== false && config.xTitle ? config.xTitle : undefined,
      visible: xTitleVisible ?? DEFAULT_AXIS_TITLE_VISIBLE,
    }),
    ticks: { visible: config.tickLabelsVisibilitySettings?.x ?? DEFAULT_AXIS_TICKS_VISIBLE },
    grid: { visible: config.gridlinesVisibilitySettings?.x ?? DEFAULT_AXIS_GRID_VISIBLE },
    domain: convertXDomainStateToAPIFormat(config.xExtent),
    labels: {
      orientation:
        config.labelsOrientation?.x != null
          ? axisLabelOrientationCompat.toAPI(config.labelsOrientation.x)
          : DEFAULT_AXIS_LABELS_ORIENTATION,
    },
    scale: xAxisScale,
  } satisfies XAxisSchemaType);

  const buildYAxisConfig = (side: 'left' | 'right'): YAxisSchemaType => {
    const title = side === 'left' ? config.yTitle : config.yRightTitle;
    const titleVisible =
      side === 'left'
        ? config.axisTitlesVisibilitySettings?.yLeft
        : config.axisTitlesVisibilitySettings?.yRight;
    const scale = side === 'left' ? config.yLeftScale : config.yRightScale;
    const ticksVisible =
      side === 'left'
        ? config.tickLabelsVisibilitySettings?.yLeft
        : config.tickLabelsVisibilitySettings?.yRight;
    const gridVisible =
      side === 'left'
        ? config.gridlinesVisibilitySettings?.yLeft
        : config.gridlinesVisibilitySettings?.yRight;
    const extent = side === 'left' ? config.yLeftExtent : config.yRightExtent;
    const labelOrientation =
      side === 'left' ? config.labelsOrientation?.yLeft : config.labelsOrientation?.yRight;

    return {
      title: stripUndefined({
        text: titleVisible !== false && title ? title : undefined,
        visible: titleVisible ?? DEFAULT_AXIS_TITLE_VISIBLE,
      }),
      scale:
        scale && scale !== 'time' ? yAxisScaleCompat.toAPI(scale) : ('linear' as YScaleSchemaType),
      ticks: { visible: ticksVisible ?? DEFAULT_AXIS_TICKS_VISIBLE },
      grid: { visible: gridVisible ?? DEFAULT_AXIS_GRID_VISIBLE },
      domain: convertYDomainStateToAPIFormat(extent),
      labels: {
        orientation:
          labelOrientation != null
            ? axisLabelOrientationCompat.toAPI(labelOrientation)
            : DEFAULT_AXIS_LABELS_ORIENTATION,
      },
    } satisfies YAxisSchemaType;
  };

  const hasLeft = usedModes.has('left');
  const hasRight = usedModes.has('right');

  if (hasLeft && hasRight) {
    return {
      x: xAxis,
      y: buildYAxisConfig('left'),
      y2: buildYAxisConfig('right'),
    };
  }
  if (hasRight) {
    return { x: xAxis, y2: buildYAxisConfig('right') };
  }
  if (hasLeft) {
    return { x: xAxis, y: buildYAxisConfig('left') };
  }
  return { x: xAxis };
}

function buildXYLayerAPI(
  visualization: XYPersistedState,
  layers: Record<string, DataSourceStateLayer>,
  adHocDataViews: Record<string, unknown>,
  references: SavedObjectReference[],
  adhocReferences: SavedObjectReference[] | undefined,
  resolveAxisId: ResolveAxisId
): XYLayer[] {
  const apiLayers: XYLayer[] = [];
  for (const visLayer of visualization.layers) {
    if (visLayer.layerType === 'referenceLine') {
      const datasourceLayer = layers[visLayer.layerId];
      if (isFormBasedLayer(datasourceLayer)) {
        apiLayers.push(
          buildAPIReferenceLinesLayer(
            visLayer,
            datasourceLayer,
            adHocDataViews,
            resolveAxisId,
            references,
            adhocReferences
          )
        );
      }
    }
    if (isLensStateDataLayer(visLayer)) {
      const datasourceLayer = layers[visLayer.layerId];
      if (
        datasourceLayer &&
        (isFormBasedLayer(datasourceLayer) || isTextBasedLayer(datasourceLayer))
      ) {
        apiLayers.push(
          buildAPIDataLayer(
            visLayer,
            datasourceLayer,
            adHocDataViews,
            references,
            adhocReferences,
            resolveAxisId
          )
        );
      }
    }
    if (visLayer.layerType === 'annotations') {
      apiLayers.push(
        buildAPIAnnotationsLayer(visLayer, adHocDataViews, references, adhocReferences)
      );
    }
  }
  return apiLayers;
}
