/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  LENS_METRIC_BREAKDOWN_DEFAULT_MAX_COLUMNS,
  type FormBasedPersistedState,
  type MetricVisualizationState,
  type PersistedIndexPatternLayer,
  type TextBasedLayer,
  type TypedLensSerializedState,
} from '@kbn/lens-common';
import type { SavedObjectReference } from '@kbn/core/types';
import type { KbnPaletteId } from '@kbn/palettes';
import type { DataViewSpec } from '@kbn/data-views-plugin/common';
import { LENS_ITEM_LATEST_VERSION } from '@kbn/lens-common/content_management/constants';
import type { DeepWriteable, LensAttributes } from '../../types';
import {
  DEFAULT_PRIMARY_POSITION,
  DEFAULT_PRIMARY_LABELS_ALIGNMENT,
  DEFAULT_PRIMARY_VALUE_ALIGNMENT,
  DEFAULT_PRIMARY_ICON_ALIGNMENT,
  DEFAULT_SECONDARY_LABEL_VISIBLE,
  DEFAULT_SECONDARY_LABEL_PLACEMENT,
  DEFAULT_SECONDARY_VALUE_ALIGNMENT,
  DEFAULT_SECONDARY_COMPARE_TO_PALETTE,
} from './metric/defaults';
import { DEFAULT_LAYER_ID } from '../../constants';
import {
  addLayerColumn,
  buildDataSourceState,
  buildDatasourceStates,
  buildReferences,
  generateApiLayer,
  getAdhocDataviews,
  isTextBasedLayer,
  nonNullable,
  operationFromColumn,
} from '../utils';
import { fromBucketLensApiToLensState } from '../columns/buckets';
import { fromDateHistogramLensApiToLensState } from '../columns/date_histogram';
import { getValueApiColumn, getValueColumn } from '../columns/esql_column';
import type { MetricConfig } from '../../schema';
import { fromMetricAPItoLensState } from '../columns/metric';
import type { LensApiBucketOperations } from '../../schema/bucket_ops';
import { generateLayer } from '../utils';
import type {
  MetricConfigESQL,
  MetricConfigNoESQL,
  PrimaryMetricType,
  SecondaryMetricType,
} from '../../schema/charts/metric';
import {
  getSharedChartLensStateToAPI,
  getSharedChartAPIToLensState,
  getMetricAccessor,
  getDatasourceLayers,
  getLensStateLayer,
  getReversibleMappings,
  stripUndefined,
} from './utils';
import {
  AUTO_COLOR,
  fromColorByValueAPIToLensState,
  fromColorByValueLensStateToAPI,
  fromStaticColorAPIToLensState,
  fromStaticColorLensStateToAPI,
  isColorByValueColor,
  isNoColor,
  NO_COLOR,
} from '../coloring';
import { isAPIColumnOfBucketType, isAPIColumnOfMetricType } from '../columns/utils';

type MetricApiCompareType = Extract<Required<SecondaryMetricType>, { compare: any }>['compare'];

type WritableMetricConfigWithoutDataset = DeepWriteable<Omit<MetricConfig, 'data_source'>>;

const ACCESSOR = 'metric_accessor';
const HISTOGRAM_COLUMN_NAME = 'x_date_histogram';
const TRENDLINE_LAYER_ID = 'layer_0_trendline';
const LENS_METRIC_COMPARE_TO_REVERSED = false;

type MetricStyling = NonNullable<MetricConfig['styling']>;
type MetricIconName = NonNullable<NonNullable<MetricStyling['icon']>['name']>;

export const iconCompat = getReversibleMappings<MetricIconName, string>([
  ['alert', 'alert'],
  ['asterisk', 'asterisk'],
  ['bell', 'bell'],
  ['bolt', 'bolt'],
  ['bug', 'bug'],
  ['compute', 'compute'],
  ['editor_comment', 'editorComment'],
  ['flag', 'flag'],
  ['globe', 'globe'],
  ['heart', 'heart'],
  ['map_marker', 'mapMarker'],
  ['pin', 'pin'],
  ['sort_down', 'sortDown'],
  ['sort_up', 'sortUp'],
  ['star_empty', 'starEmpty'],
  ['tag', 'tag'],
  ['temperature', 'temperature'],
]);

function getAccessorName(type: 'metric' | 'max' | 'breakdown' | 'secondary') {
  return `${ACCESSOR}_${type}`;
}

function getCompareVisualsState(compare: MetricApiCompareType) {
  if (compare.icon && compare.value) {
    return 'both';
  }
  if (compare.icon === true || (compare.icon == null && compare.value === false)) {
    return 'icon';
  }
  if (compare.value === true || (compare.value == null && compare.icon === false)) {
    return 'value';
  }
  return 'both';
}

function fromCompareAPIToLensState(compareToConfig: MetricApiCompareType): {
  secondaryTrend: Extract<MetricVisualizationState['secondaryTrend'], { type: 'dynamic' }>;
} {
  return {
    secondaryTrend: {
      type: 'dynamic',
      baselineValue:
        compareToConfig.to === 'primary' ? compareToConfig.to : compareToConfig.baseline,
      visuals: getCompareVisualsState(compareToConfig),
      reversed: compareToConfig.palette?.includes('reversed') ?? LENS_METRIC_COMPARE_TO_REVERSED,
      paletteId: (compareToConfig.palette as KbnPaletteId) ?? DEFAULT_SECONDARY_COMPARE_TO_PALETTE,
    },
  };
}

function isSecondaryMetric(metric: MetricConfig['metrics'][number]): metric is SecondaryMetricType {
  return metric.type === 'secondary';
}

function isPrimaryMetric(metric: MetricConfig['metrics'][number]): metric is PrimaryMetricType {
  return metric.type === 'primary';
}

function convertStylingToStateFormat(
  styling: MetricStyling | undefined,
  hasSecondary: boolean
): Partial<MetricVisualizationState> {
  if (!styling) {
    return {};
  }
  const primaryStyling = styling.primary;
  const secondaryStyling = styling.secondary;

  if (!primaryStyling && !secondaryStyling) {
    return {};
  }

  return stripUndefined({
    valueFontMode:
      primaryStyling?.value?.sizing != null
        ? primaryStyling.value.sizing === 'fill'
          ? 'fit'
          : 'default'
        : undefined,
    titlesTextAlign: primaryStyling?.labels?.alignment,
    primaryAlign: primaryStyling?.value?.alignment,
    primaryPosition: primaryStyling?.position,
    icon: iconCompat.toState(styling.icon?.name),
    iconAlign: styling.icon?.alignment,
    ...(hasSecondary
      ? stripUndefined({
          secondaryLabel: secondaryStyling?.label?.visible === false ? '' : undefined,
          secondaryLabelPosition: secondaryStyling?.label?.placement,
          secondaryAlign: secondaryStyling?.value?.alignment,
        })
      : {}),
  });
}

function convertStylingToAPIFormat(
  visualization: MetricVisualizationState,
  hasSecondary: boolean
): MetricStyling {
  const iconName = visualization.icon ? iconCompat.toAPI(visualization.icon) : undefined;

  return stripUndefined({
    icon: iconName
      ? {
          name: iconName,
          alignment: visualization.iconAlign ?? DEFAULT_PRIMARY_ICON_ALIGNMENT,
        }
      : undefined,
    primary: stripUndefined({
      position: visualization.primaryPosition ?? DEFAULT_PRIMARY_POSITION,
      labels: {
        alignment: visualization.titlesTextAlign ?? DEFAULT_PRIMARY_LABELS_ALIGNMENT,
      },
      value: {
        sizing: visualization.valueFontMode === 'fit' ? 'fill' : 'auto',
        alignment:
          visualization.primaryAlign ??
          visualization.valuesTextAlign ??
          DEFAULT_PRIMARY_VALUE_ALIGNMENT,
      },
    }),
    secondary: hasSecondary
      ? {
          ...(visualization.secondaryLabel === '' || visualization.secondaryPrefix === ''
            ? {
                label: {
                  visible: false,
                },
              }
            : {
                label: {
                  visible: DEFAULT_SECONDARY_LABEL_VISIBLE,
                  placement:
                    visualization.secondaryLabelPosition ?? DEFAULT_SECONDARY_LABEL_PLACEMENT,
                },
              }),
          value: {
            alignment: visualization.secondaryAlign ?? DEFAULT_SECONDARY_VALUE_ALIGNMENT,
          },
        }
      : undefined,
  });
}

function buildVisualizationState(config: MetricConfig): MetricVisualizationState {
  const layer = config;

  const [primaryMetric, secondaryMetric] = layer.metrics;

  if (isSecondaryMetric(primaryMetric)) {
    throw new Error('The first metric must be the primary metric.');
  }

  if (secondaryMetric && isPrimaryMetric(secondaryMetric)) {
    throw new Error('The second metric must be the secondary metric.');
  }

  return {
    layerId: DEFAULT_LAYER_ID,
    layerType: 'data',
    metricAccessor: getAccessorName('metric'),
    ...(primaryMetric.color?.type === 'static'
      ? fromStaticColorAPIToLensState(primaryMetric.color)
      : {}),
    ...(isColorByValueColor(primaryMetric.color)
      ? { palette: fromColorByValueAPIToLensState(primaryMetric.color) }
      : {}),
    ...(primaryMetric.apply_color_to ? { applyColorTo: primaryMetric.apply_color_to } : {}),
    ...(primaryMetric.subtitle ? { subtitle: primaryMetric.subtitle } : {}),
    showBar: false,
    ...convertStylingToStateFormat(layer.styling, !!secondaryMetric),
    ...(secondaryMetric
      ? {
          secondaryMetricAccessor: getAccessorName('secondary'),
          ...('compare' in secondaryMetric && secondaryMetric.compare
            ? fromCompareAPIToLensState(secondaryMetric.compare)
            : {}),
          ...(secondaryMetric.color && !isNoColor(secondaryMetric.color)
            ? { secondaryTrend: { type: 'static', color: secondaryMetric.color?.color } }
            : {}),
        }
      : {}),
    ...(layer.breakdown_by
      ? {
          breakdownByAccessor: getAccessorName('breakdown'),
          maxCols: layer.breakdown_by.columns,
        }
      : {}),
    ...(layer.breakdown_by?.collapse_by ? { collapseFn: layer.breakdown_by.collapse_by } : {}),
    ...(primaryMetric?.background_chart?.type === 'bar'
      ? {
          maxAccessor: getAccessorName('max'),
          showBar: true,
          ...(primaryMetric.background_chart.orientation != null
            ? { progressDirection: primaryMetric.background_chart.orientation }
            : {}),
        }
      : {}),

    ...(primaryMetric.background_chart?.type === 'trend'
      ? {
          trendlineLayerId: `${DEFAULT_LAYER_ID}_trendline`,
          trendlineLayerType: 'metricTrendline',
          trendlineMetricAccessor: `${ACCESSOR}_trendline`,
          trendlineTimeAccessor: HISTOGRAM_COLUMN_NAME,
          ...(secondaryMetric
            ? {
                trendlineSecondaryMetricAccessor: `${ACCESSOR}_secondary_trendline`,
              }
            : {}),

          ...(layer.breakdown_by
            ? {
                trendlineBreakdownByAccessor: `${ACCESSOR}_breakdown_trendline`,
              }
            : {}),
        }
      : {}),
  };
}

function fromCompareLensStateToAPI(
  compare: Extract<MetricVisualizationState['secondaryTrend'], { type: 'dynamic' }>
): MetricApiCompareType {
  const sharedProps = {
    palette: `${compare.paletteId}${compare.reversed ? '_reversed' : ''}`,
    icon: compare.visuals === 'icon' || compare.visuals === 'both',
    value: compare.visuals === 'value' || compare.visuals === 'both',
  };
  if (compare.baselineValue === 'primary') {
    return {
      to: 'primary',
      ...sharedProps,
    };
  }
  return {
    to: 'baseline',
    baseline: compare.baselineValue,
    ...sharedProps,
  };
}

function buildFromTextBasedLayer(
  layer: TextBasedLayer,
  metricAccessor: string,
  visualization: MetricVisualizationState
): WritableMetricConfigWithoutDataset {
  return enrichConfigurationWithVisualizationProperties(
    {
      type: 'metric',
      ...generateApiLayer(layer),
      metrics: [
        {
          type: 'primary',
          ...getValueApiColumn(metricAccessor, layer),
          ...(visualization.maxAccessor
            ? {
                background_chart: {
                  type: 'bar',
                  max_value: getValueApiColumn(visualization.maxAccessor, layer),
                  ...(visualization.progressDirection
                    ? { orientation: visualization.progressDirection }
                    : {}),
                },
              }
            : {}),
        },
        visualization.secondaryMetricAccessor
          ? {
              type: 'secondary',
              ...getValueApiColumn(visualization.secondaryMetricAccessor, layer),
            }
          : undefined,
      ].filter(nonNullable) as MetricConfig['metrics'],
      ...(visualization.breakdownByAccessor
        ? {
            breakdown_by: {
              ...getValueApiColumn(visualization.breakdownByAccessor, layer),
              columns: visualization.maxCols ?? LENS_METRIC_BREAKDOWN_DEFAULT_MAX_COLUMNS,
            },
          }
        : {}),
    },
    visualization
  );
}

function buildFromFormBasedLayer(
  layer: PersistedIndexPatternLayer,
  metricAccessor: string,
  visualization: MetricVisualizationState
): WritableMetricConfigWithoutDataset {
  const metric = operationFromColumn(metricAccessor, layer);
  if (!metric || !isAPIColumnOfMetricType(metric)) {
    throw Error('The primary metric must refer to a metric operation.');
  }

  const maxValue = visualization.maxAccessor
    ? operationFromColumn(visualization.maxAccessor, layer)
    : undefined;

  if (maxValue && isAPIColumnOfBucketType(maxValue)) {
    throw Error('The max value must refer to a metric operation.');
  }

  const primaryMetric = {
    type: 'primary',
    ...metric,
    ...(maxValue
      ? {
          background_chart: {
            type: 'bar',
            max_value: maxValue,
            ...(visualization.progressDirection
              ? { orientation: visualization.progressDirection }
              : {}),
          },
        }
      : {}),
  } as PrimaryMetricType;

  const metrics = [primaryMetric] as [PrimaryMetricType, SecondaryMetricType?];

  const secondaryMetricOperation = visualization.secondaryMetricAccessor
    ? operationFromColumn(visualization.secondaryMetricAccessor, layer)
    : undefined;

  if (secondaryMetricOperation) {
    if (!isAPIColumnOfMetricType(secondaryMetricOperation)) {
      throw Error('The secondary metric must refer to a metric operation.');
    }
    const secondaryMetric = {
      type: 'secondary',
      ...secondaryMetricOperation,
    } as SecondaryMetricType;
    metrics.push(secondaryMetric);
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const breakdown_by = visualization.breakdownByAccessor
    ? operationFromColumn(visualization.breakdownByAccessor, layer)
    : undefined;
  if (breakdown_by && !isAPIColumnOfBucketType(breakdown_by)) {
    throw Error('The breakdown by must refer to a bucket operation.');
  }

  return enrichConfigurationWithVisualizationProperties(
    {
      type: 'metric',
      ...generateApiLayer(layer),
      metrics: metrics as MetricConfig['metrics'],
      ...(breakdown_by
        ? {
            breakdown_by: {
              ...breakdown_by,
              columns: visualization.maxCols ?? LENS_METRIC_BREAKDOWN_DEFAULT_MAX_COLUMNS,
            },
          }
        : {}),
    },
    visualization
  );
}

function enrichConfigurationWithVisualizationProperties(
  state: WritableMetricConfigWithoutDataset,
  visualization: MetricVisualizationState
): WritableMetricConfigWithoutDataset {
  const [primaryMetric, secondaryMetric] = state.metrics;

  if (isSecondaryMetric(primaryMetric)) {
    throw new Error('The first metric must be the primary metric.');
  }
  if (secondaryMetric != null && isPrimaryMetric(secondaryMetric)) {
    throw new Error('The second metric must be the secondary metric.');
  }
  if (primaryMetric) {
    if (visualization.subtitle) {
      primaryMetric.subtitle = visualization.subtitle;
    }

    if (visualization.trendlineLayerType) {
      // Trend takes precedence; do not retain bar-only fields (e.g. max_value) on the API config.
      primaryMetric.background_chart = { type: 'trend' };
    }

    if (visualization.palette) {
      const colorByValue = fromColorByValueLensStateToAPI(visualization.palette);
      const isValidRange = state.breakdown_by || colorByValue?.range === 'absolute';
      primaryMetric.color = colorByValue && isValidRange ? colorByValue : AUTO_COLOR;
    } else if (visualization.color) {
      primaryMetric.color = fromStaticColorLensStateToAPI(visualization.color);
    } else {
      primaryMetric.color = AUTO_COLOR;
    }

    // Check for valid enum, some integration panels have applyColorTo === 'bar', which is not a valid API enum; treat unknown values as unselected.
    if (visualization.applyColorTo === 'value' || visualization.applyColorTo === 'background') {
      primaryMetric.apply_color_to = visualization.applyColorTo;
    }
  }

  if (secondaryMetric) {
    if (visualization.secondaryTrend?.type === 'dynamic') {
      secondaryMetric.compare = fromCompareLensStateToAPI(visualization.secondaryTrend);
    }

    const secondaryLabelOverride = visualization.secondaryLabel ?? visualization.secondaryPrefix;
    if (secondaryLabelOverride && secondaryLabelOverride.length > 0) {
      secondaryMetric.label = secondaryLabelOverride;
    }

    if (visualization.secondaryTrend?.type === 'static' && visualization.secondaryTrend?.color) {
      secondaryMetric.color = {
        type: 'static',
        color: visualization.secondaryTrend.color,
      };
    } else {
      secondaryMetric.color = NO_COLOR;
    }
  }

  state.styling = convertStylingToAPIFormat(visualization, !!secondaryMetric);

  if (state.breakdown_by) {
    if (visualization.maxCols) {
      state.breakdown_by.columns = visualization.maxCols;
    }
    if (visualization.collapseFn) {
      state.breakdown_by.collapse_by = visualization.collapseFn;
    }
  }
  return state;
}

function reverseBuildVisualizationState(
  visualization: MetricVisualizationState,
  layer: PersistedIndexPatternLayer | TextBasedLayer,
  layerId: string,
  adHocDataViews: Record<string, DataViewSpec>,
  references: SavedObjectReference[],
  adhocReferences?: SavedObjectReference[]
): MetricConfig {
  const metricAccessor = getMetricAccessor(visualization);
  if (metricAccessor == null) {
    throw new Error('Metric accessor is missing in the visualization state');
  }

  const dataSource = buildDataSourceState(
    layer,
    layerId,
    adHocDataViews,
    references,
    adhocReferences
  );

  if (!dataSource || dataSource.type == null) {
    throw new Error('Unsupported DataSource type');
  }

  return {
    data_source: dataSource satisfies MetricConfig['data_source'],
    ...(isTextBasedLayer(layer)
      ? buildFromTextBasedLayer(layer, metricAccessor, visualization)
      : buildFromFormBasedLayer(layer, metricAccessor, visualization)),
  } as MetricConfig;
}

function buildFormBasedLayer(layer: MetricConfigNoESQL): FormBasedPersistedState['layers'] {
  const [primaryMetric, secondaryMetric] = layer.metrics ?? [];
  if (!isAPIColumnOfMetricType(primaryMetric) || isSecondaryMetric(primaryMetric)) {
    throw Error('The primary metric must refer to a metric operation.');
  }
  const newPrimaryColumns = fromMetricAPItoLensState(primaryMetric);
  const newSecondaryColumns = secondaryMetric
    ? fromMetricAPItoLensState(secondaryMetric)
    : undefined;

  const layers: Record<string, PersistedIndexPatternLayer> = {
    ...generateLayer(DEFAULT_LAYER_ID, layer),
    ...(primaryMetric.background_chart?.type === 'trend'
      ? generateLayer(TRENDLINE_LAYER_ID, layer)
      : {}),
  };

  const defaultLayer = layers[DEFAULT_LAYER_ID];
  const trendLineLayer = layers[TRENDLINE_LAYER_ID];

  if (trendLineLayer) {
    trendLineLayer.linkToLayers = [DEFAULT_LAYER_ID];
  }

  addLayerColumn(defaultLayer, getAccessorName('metric'), newPrimaryColumns);
  if (trendLineLayer) {
    // Histogram first so columnOrder matches editor-built trendline layers and tabify agg order.
    addLayerColumn(
      trendLineLayer,
      HISTOGRAM_COLUMN_NAME,
      fromDateHistogramLensApiToLensState({
        operation: 'date_histogram',
        field: '',
        suggested_interval: 'auto',
        use_original_time_range: false,
        include_empty_rows: true,
        drop_partial_intervals: false,
      })
    );
    addLayerColumn(trendLineLayer, `${ACCESSOR}_trendline`, newPrimaryColumns);
  }

  if (layer.breakdown_by) {
    const columnName = getAccessorName('breakdown');
    const breakdownColumn = fromBucketLensApiToLensState(
      layer.breakdown_by as LensApiBucketOperations,
      [
        ...newPrimaryColumns.map((col) => ({ column: col, id: getAccessorName('metric') })),
        ...(newSecondaryColumns ?? []).map((col) => ({
          column: col,
          id: getAccessorName('secondary'),
        })),
      ]
    );
    addLayerColumn(defaultLayer, columnName, breakdownColumn, true);

    if (trendLineLayer) {
      addLayerColumn(trendLineLayer, `${columnName}_trendline`, breakdownColumn, true);
    }
  }

  if (newSecondaryColumns?.length) {
    const columnName = getAccessorName('secondary');
    addLayerColumn(defaultLayer, columnName, newSecondaryColumns);
    if (trendLineLayer) {
      addLayerColumn(trendLineLayer, `${columnName}_trendline`, newSecondaryColumns, false, 'X0');
    }
  }

  if (primaryMetric.background_chart?.type === 'bar') {
    const columnName = getAccessorName('max');
    const newColumn = fromMetricAPItoLensState(primaryMetric.background_chart.max_value);

    addLayerColumn(defaultLayer, columnName, newColumn);
    if (trendLineLayer) {
      addLayerColumn(trendLineLayer, `${columnName}_trendline`, newColumn, false, 'X0');
    }
  }

  return layers;
}

function getValueColumns(layer: MetricConfigESQL) {
  const [primaryMetric, secondaryMetric] = layer.metrics ?? [];
  if (isSecondaryMetric(primaryMetric)) {
    throw Error('The primary metric must refer to a metric operation.');
  }
  if (secondaryMetric && isPrimaryMetric(secondaryMetric)) {
    throw Error('The secondary metric must refer to a metric operation.');
  }
  return [
    ...(layer.breakdown_by
      ? [getValueColumn(getAccessorName('breakdown'), layer.breakdown_by)]
      : []),
    getValueColumn(getAccessorName('metric'), primaryMetric, 'number'),
    ...(primaryMetric.background_chart?.type === 'bar'
      ? [getValueColumn(getAccessorName('max'), primaryMetric.background_chart.max_value, 'number')]
      : []),
    ...(secondaryMetric
      ? [getValueColumn(getAccessorName('secondary'), secondaryMetric, 'number')]
      : []),
  ];
}

type MetricAttributes = Extract<
  TypedLensSerializedState['attributes'],
  { visualizationType: 'lnsMetric' }
>;

export type MetricAttributesWithoutFiltersAndQuery = Omit<MetricAttributes, 'state'> & {
  state: Omit<MetricAttributes['state'], 'filters' | 'query'>;
};

export function fromAPItoLensState(config: MetricConfig): MetricAttributesWithoutFiltersAndQuery {
  const _buildDataLayer = (cfg: unknown, i: number) =>
    buildFormBasedLayer(cfg as MetricConfigNoESQL);

  const { layers, usedDataviews } = buildDatasourceStates(config, _buildDataLayer, getValueColumns);

  const visualization = buildVisualizationState(config);

  const { adHocDataViews, internalReferences } = getAdhocDataviews(usedDataviews);

  const regularDataViewsByLayer: Record<string, string> = {};
  for (const [layerId, dv] of Object.entries(usedDataviews)) {
    if (dv.type === 'dataView') {
      regularDataViewsByLayer[layerId] = dv.id;
    }
  }
  const references = Object.keys(regularDataViewsByLayer).length
    ? buildReferences(regularDataViewsByLayer)
    : [];

  return {
    visualizationType: 'lnsMetric',
    ...getSharedChartAPIToLensState(config),
    references,
    version: LENS_ITEM_LATEST_VERSION,
    state: {
      datasourceStates: layers,
      internalReferences,
      visualization,
      adHocDataViews,
    },
  };
}

export function fromLensStateToAPI(config: LensAttributes): MetricConfig {
  const { state } = config;
  const visualization = state.visualization as MetricVisualizationState;
  const layers = getDatasourceLayers(state);
  const [layerId, layer] = getLensStateLayer(layers, visualization.layerId);

  const visualizationState = {
    ...getSharedChartLensStateToAPI(config),
    ...reverseBuildVisualizationState(
      visualization,
      layer,
      layerId ?? DEFAULT_LAYER_ID,
      config.state.adHocDataViews ?? {},
      config.references,
      config.state.internalReferences
    ),
  };

  return visualizationState;
}
