/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { groupBy, partition } from 'lodash';
import { i18n } from '@kbn/i18n';
import type { Datatable } from '@kbn/expressions-plugin/public';
import { IconChartBarReferenceLine } from '@kbn/chart-icons';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import type { AccessorConfig } from '@kbn/visualization-ui-components';
import type { DatasourceLayers, FramePublicAPI, Visualization } from '@kbn/lens-common';
import { groupAxesByType } from './axes_configuration';
import { isHorizontalChart, isPercentageSeries, isStackedChart } from './state_helpers';
import type {
  XYVisualizationState,
  XYDataLayerConfig,
  XYReferenceLineLayerConfig,
  YAxisMode,
  YConfig,
} from './types';
import {
  checkScaleOperation,
  getAxisName,
  getDataLayers,
  getReferenceLayers,
  isNumericMetric,
  isReferenceLayer,
} from './visualization_helpers';
import { generateId } from '../../id_generator';
import { defaultReferenceLineColor } from './color_assignment';
import { isEsqlChart } from '../../utils';

export interface ReferenceLineBase {
  label: 'x' | 'yRight' | 'yLeft';
}

/**
 * Return the reference layers groups to show based on multiple criteria:
 * * what groups are current defined in data layers
 * * what existing reference line are currently defined in reference layers
 */
export function getGroupsToShow<T extends ReferenceLineBase & { config?: YConfig[] }>(
  referenceLayers: T[],
  state: XYVisualizationState | undefined,
  datasourceLayers: DatasourceLayers,
  tables: Record<string, Datatable> | undefined
): Array<T & { valid: boolean }> {
  if (!state) {
    return [];
  }
  const dataLayers = getDataLayers(state.layers);
  const groupsAvailable = getGroupsAvailableInData(dataLayers, datasourceLayers, tables);

  return referenceLayers
    .filter(({ label, config }: T) => groupsAvailable[label] || config?.length)
    .map((layer) => ({ ...layer, valid: groupsAvailable[layer.label] }));
}

/**
 * Returns the reference layers groups to show based on what groups are current defined in data layers.
 */
export function getGroupsRelatedToData<T extends ReferenceLineBase>(
  referenceLayers: T[],
  state: XYVisualizationState | undefined,
  datasourceLayers: DatasourceLayers,
  tables: Record<string, Datatable> | undefined
): T[] {
  if (!state) {
    return [];
  }
  const dataLayers = getDataLayers(state.layers);
  const groupsAvailable = getGroupsAvailableInData(dataLayers, datasourceLayers, tables);
  return referenceLayers.filter(({ label }: T) => groupsAvailable[label]);
}
/**
 * Returns a dictionary with the groups filled in all the data layers
 */
export function getGroupsAvailableInData(
  dataLayers: XYDataLayerConfig[],
  datasourceLayers: DatasourceLayers,
  tables: Record<string, Datatable> | undefined
) {
  const hasNumberHistogram = dataLayers.some(
    checkScaleOperation('interval', 'number', datasourceLayers)
  );
  const { right, left } = groupAxesByType(dataLayers, tables);
  return {
    x: dataLayers.some(({ xAccessor }) => xAccessor != null) && hasNumberHistogram,
    yLeft: left.length > 0,
    yRight: right.length > 0,
  };
}

export function getStaticValue(
  dataLayers: XYDataLayerConfig[],
  groupId: 'x' | 'yLeft' | 'yRight',
  { activeData }: Pick<FramePublicAPI, 'activeData'>,
  layerHasNumberHistogram: (layer: XYDataLayerConfig) => boolean
) {
  const fallbackValue = 100;
  if (!activeData) {
    return fallbackValue;
  }

  // filter and organize data dimensions into reference layer groups
  // now pick the columnId in the active data
  const {
    dataLayers: filteredLayers,
    untouchedDataLayers,
    accessors,
  } = getAccessorCriteriaForGroup(groupId, dataLayers, activeData);

  if (
    groupId === 'x' &&
    filteredLayers.length &&
    !untouchedDataLayers.some(layerHasNumberHistogram)
  ) {
    return fallbackValue;
  }

  const computedValue = computeStaticValueForGroup(
    filteredLayers,
    accessors,
    activeData,
    groupId !== 'x', // histogram axis should compute the min based on the current data
    groupId !== 'x'
  );

  return computedValue ?? fallbackValue;
}

function getAccessorCriteriaForGroup(
  groupId: 'x' | 'yLeft' | 'yRight',
  dataLayers: XYDataLayerConfig[],
  activeData: FramePublicAPI['activeData']
) {
  switch (groupId) {
    case 'x': {
      const filteredDataLayers = dataLayers.filter(({ xAccessor }) => xAccessor);
      // need to reshape the dataLayers to match the other accessors format
      return {
        dataLayers: filteredDataLayers.map(({ accessors, xAccessor, ...rest }) => ({
          ...rest,
          accessors: [xAccessor] as string[],
        })),
        // need the untouched ones to check if there are invalid layers from the filtered ones
        // to perform the checks the original accessor structure needs to be accessed
        untouchedDataLayers: filteredDataLayers,
        accessors: filteredDataLayers.map(({ xAccessor }) => xAccessor) as string[],
      };
    }
    case 'yLeft':
    case 'yRight': {
      const prop = groupId === 'yLeft' ? 'left' : 'right';
      const { [prop]: axis } = groupAxesByType(dataLayers, activeData);
      const rightIds = new Set(axis.map(({ layer }) => layer));
      const filteredDataLayers = dataLayers.filter(({ layerId }) => rightIds.has(layerId));
      return {
        dataLayers: filteredDataLayers,
        untouchedDataLayers: filteredDataLayers,
        accessors: axis.map(({ accessor }) => accessor),
      };
    }
  }
}

export function computeOverallDataDomain(
  dataLayers: XYDataLayerConfig[],
  accessorIds: string[],
  activeData: NonNullable<FramePublicAPI['activeData']>,
  allowStacking: boolean = true
) {
  const accessorMap = new Set(accessorIds);
  let min: number | undefined;
  let max: number | undefined;

  const [stacked, unstacked] = partition(
    dataLayers,
    ({ seriesType }) => isStackedChart(seriesType) && allowStacking
  );
  for (const { layerId, accessors } of unstacked) {
    const table = activeData[layerId];
    if (table) {
      for (const accessor of accessors) {
        if (accessorMap.has(accessor)) {
          for (const row of table.rows) {
            const value = row[accessor];
            if (typeof value === 'number') {
              // when not stacked, do not keep the 0
              max = max != null ? Math.max(value, max) : value;
              min = min != null ? Math.min(value, min) : value;
            }
          }
        }
      }
    }
  }
  // stacked can span multiple layers, so compute an overall max/min by bucket
  const stackedResults: Record<string, number> = {};
  for (const { layerId, accessors, xAccessor } of stacked) {
    const table = activeData[layerId];
    if (table) {
      for (const accessor of accessors) {
        if (accessorMap.has(accessor)) {
          for (const row of table.rows) {
            const value = row[accessor];
            // start with a shared bucket
            let bucket = 'shared';
            // but if there's an xAccessor use it as new bucket system
            if (xAccessor) {
              bucket = row[xAccessor];
            }
            if (typeof value === 'number') {
              stackedResults[bucket] = stackedResults[bucket] ?? 0;
              stackedResults[bucket] += value;
            }
          }
        }
      }
    }
  }

  for (const value of Object.values(stackedResults)) {
    // for stacked extents keep 0 in view
    max = Math.max(value, max || 0, 0);
    min = Math.min(value, min || 0, 0);
  }

  return { min, max };
}

function computeStaticValueForGroup(
  dataLayers: XYDataLayerConfig[],
  accessorIds: string[],
  activeData: NonNullable<FramePublicAPI['activeData']>,
  minZeroOrNegativeBase: boolean = true,
  allowStacking: boolean = true
) {
  const defaultReferenceLineFactor = 3 / 4;

  if (dataLayers.length && accessorIds.length) {
    if (dataLayers.some(({ seriesType }) => isPercentageSeries(seriesType))) {
      return defaultReferenceLineFactor;
    }

    const { min, max } = computeOverallDataDomain(
      dataLayers,
      accessorIds,
      activeData,
      allowStacking
    );

    if (min != null && max != null && isFinite(min) && isFinite(max)) {
      // Custom axis bounds can go below 0, so consider also lower values than 0
      const finalMinValue = minZeroOrNegativeBase ? Math.min(0, min) : min;
      const interval = max - finalMinValue;
      return Number((finalMinValue + interval * defaultReferenceLineFactor).toFixed(2));
    }
  }
}

export const getReferenceSupportedLayer = (
  state?: XYVisualizationState,
  frame?: Pick<FramePublicAPI, 'datasourceLayers' | 'activeData'>
) => {
  const referenceLineGroupIds = [
    {
      id: 'yReferenceLineLeft',
      label: 'yLeft' as const,
    },
    {
      id: 'yReferenceLineRight',
      label: 'yRight' as const,
    },
    {
      id: 'xReferenceLine',
      label: 'x' as const,
    },
  ];

  const referenceLineGroups = getGroupsRelatedToData(
    referenceLineGroupIds,
    state,
    frame?.datasourceLayers || {},
    frame?.activeData
  );

  const layers = state?.layers || [];
  const dataLayers = getDataLayers(layers);

  const filledDataLayers = dataLayers.filter(
    ({ accessors, xAccessor }) => accessors.length || xAccessor
  );
  const layerHasNumberHistogram = checkScaleOperation(
    'interval',
    'number',
    frame?.datasourceLayers || {}
  );

  const initialDimensions = state
    ? referenceLineGroups.map(({ id, label }) => ({
        groupId: id,
        columnId: generateId(),
        dataType: 'number',
        label: getAxisName(label, { isHorizontal: isHorizontalChart(layers) }),
        staticValue: getStaticValue(
          dataLayers,
          label,
          { activeData: frame?.activeData },
          layerHasNumberHistogram
        ),
      }))
    : undefined;

  return {
    type: LayerTypes.REFERENCELINE,
    label: i18n.translate('xpack.lens.xyChart.addReferenceLineLayerLabel', {
      defaultMessage: 'Reference lines',
    }),
    icon: IconChartBarReferenceLine,
    disabled:
      !filledDataLayers.length ||
      (!dataLayers.some(layerHasNumberHistogram) &&
        dataLayers.every(({ accessors }) => !accessors.length)),
    toolTipContent: filledDataLayers.length
      ? undefined
      : i18n.translate('xpack.lens.xyChart.addReferenceLineLayerLabelDisabledHelp', {
          defaultMessage: 'Add some data to enable reference layer',
        }),
    initialDimensions,
  };
};

export const setReferenceDimension: Visualization<XYVisualizationState>['setDimension'] = ({
  prevState,
  layerId,
  columnId,
  groupId,
  previousColumn,
}) => {
  const foundLayer = prevState.layers.find((l) => l.layerId === layerId);
  if (!foundLayer || !isReferenceLayer(foundLayer)) {
    return prevState;
  }
  const newLayer = { ...foundLayer };

  newLayer.accessors = [...newLayer.accessors.filter((a) => a !== columnId), columnId];
  const hasYConfig = newLayer.yConfig?.some(({ forAccessor }) => forAccessor === columnId);
  const previousYConfig = previousColumn
    ? getReferenceLayers(prevState.layers)
        .map(({ yConfig }) => yConfig)
        .flat()
        ?.find((yConfig) => yConfig?.forAccessor === previousColumn)
    : false;
  if (!hasYConfig) {
    const axisMode: YAxisMode =
      groupId === 'xReferenceLine'
        ? 'bottom'
        : groupId === 'yReferenceLineRight'
        ? 'right'
        : 'left';

    newLayer.yConfig = [
      ...(newLayer.yConfig || []),
      {
        // override with previous styling,
        ...previousYConfig,
        // but keep the new group & id config
        forAccessor: columnId,
        axisMode,
      },
    ];
  }

  return {
    ...prevState,
    layers: prevState.layers.map((l) => (l.layerId === layerId ? newLayer : l)),
  };
};

export const getSingleColorConfig = (
  id: string,
  color = defaultReferenceLineColor,
  icon?: string
): AccessorConfig => ({
  columnId: id,
  triggerIconType: icon && icon !== 'empty' ? 'custom' : 'color',
  color,
  customIcon: icon,
});

export const getReferenceLineAccessorColorConfig = (layer: XYReferenceLineLayerConfig) => {
  return layer.accessors.map((accessor) => {
    const currentYConfig = layer.yConfig?.find((yConfig) => yConfig.forAccessor === accessor);
    return getSingleColorConfig(accessor, currentYConfig?.color);
  });
};

export const getReferenceConfiguration = ({
  state,
  frame,
  layer,
  sortedAccessors,
}: {
  state: XYVisualizationState;
  frame: Pick<FramePublicAPI, 'activeData' | 'datasourceLayers'>;
  layer: XYReferenceLineLayerConfig;
  sortedAccessors: string[];
}) => {
  const idToIndex = sortedAccessors.reduce<Record<string, number>>((memo, id, index) => {
    memo[id] = index;
    return memo;
  }, {});
  const { bottom, left, right } = groupBy(
    [...(layer.yConfig || [])].sort(
      ({ forAccessor: forA }, { forAccessor: forB }) => idToIndex[forA] - idToIndex[forB]
    ),
    ({ axisMode }) => {
      return axisMode;
    }
  );

  const groupsToShow = getGroupsToShow(
    [
      // When a reference layer panel is added, a static reference line should automatically be included by default
      // in the first available axis, in the following order: vertical left, vertical right, horizontal.
      {
        config: left,
        id: 'yReferenceLineLeft',
        label: 'yLeft',
        dataTestSubj: 'lnsXY_yReferenceLineLeftPanel',
      },
      {
        config: right,
        id: 'yReferenceLineRight',
        label: 'yRight',
        dataTestSubj: 'lnsXY_yReferenceLineRightPanel',
      },
      {
        config: bottom,
        id: 'xReferenceLine',
        label: 'x',
        dataTestSubj: 'lnsXY_xReferenceLinePanel',
      },
    ],
    state,
    frame.datasourceLayers,
    frame.activeData
  );
  const isHorizontal = isHorizontalChart(state.layers);
  // ES|QL charts do not expose data views: only static values are supported for reference lines
  const staticValueOnly = isEsqlChart(frame.datasourceLayers);
  return {
    // Each reference lines layer panel will have sections for each available axis
    // (horizontal axis, vertical axis left, vertical axis right).
    // Only axes that support numeric reference lines should be shown
    groups: groupsToShow.map(({ config = [], id, label, dataTestSubj, valid }) => ({
      groupId: id,
      groupLabel: getAxisName(label, { isHorizontal }),
      dimensionEditorGroupLabel: i18n.translate(
        'xpack.lens.indexPattern.referenceLineDimensionEditorLabel',
        {
          defaultMessage: '{groupLabel} reference line',
          values: { groupLabel: getAxisName(label, { isHorizontal }) },
        }
      ),
      accessors: config.map(({ forAccessor, color, icon }) =>
        getSingleColorConfig(forAccessor, color, icon)
      ),
      filterOperations: isNumericMetric,
      supportsMoreColumns: true,
      requiredMinDimensionCount: 0,
      enableDimensionEditor: true,
      supportStaticValue: true,
      staticValueOnly,
      paramEditorCustomProps: {
        labels: [
          i18n.translate('xpack.lens.indexPattern.staticValue.label', {
            defaultMessage: 'Reference line value',
          }),
        ],
        headingLabel: i18n.translate('xpack.lens.staticValue.headingLabel', {
          defaultMessage: 'Placement',
        }),
      },
      supportFieldFormat: false,
      dataTestSubj,
      invalid: !valid,
      invalidMessage:
        label === 'x'
          ? i18n.translate('xpack.lens.configure.invalidBottomReferenceLineDimension', {
              defaultMessage:
                'This reference line is assigned to an axis that no longer exists or is no longer valid. You may move this reference line to another available axis or remove it.',
            })
          : i18n.translate('xpack.lens.configure.invalidReferenceLineDimension', {
              defaultMessage:
                'This reference line is assigned to an axis that no longer exists. You may move this reference line to another available axis or remove it.',
            }),
      requiresPreviousColumnOnDuplicate: true,
    })),
  };
};
