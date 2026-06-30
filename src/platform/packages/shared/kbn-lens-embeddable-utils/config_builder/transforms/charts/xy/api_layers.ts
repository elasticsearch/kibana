/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObjectReference } from '@kbn/core/server';
import { isQueryAnnotationConfig, isRangeAnnotationConfig } from '@kbn/event-annotation-common';
import type { AvailableReferenceLineIcon } from '@kbn/expression-xy-plugin/common';
import type {
  FormBasedLayer,
  SeriesType,
  TextBasedLayer,
  XYAnnotationLayerConfig,
  XYByValueAnnotationLayerConfig,
  XYDataLayerConfig,
  XYPersistedAnnotationLayerConfig,
  XYReferenceLineLayerConfig,
  YConfig,
} from '@kbn/lens-common';
import {
  AvailableReferenceLineIcons,
  isPersistedByReferenceAnnotationsLayer,
  isPersistedLinkedByValueAnnotationsLayer,
} from '@kbn/lens-common';
import { AS_CODE_DATA_VIEW_SPEC_TYPE } from '@kbn/as-code-data-views-schema';
import { AS_CODE_DATA_VIEW_REFERENCE_TYPE } from '@kbn/as-code-data-views-schema';
import type {
  AnnotationLayerByValueType,
  AnnotationLayerType,
  DataLayerType,
  DataLayerTypeESQL,
  DataLayerTypeNoESQL,
  ReferenceLineLayerType,
  ReferenceLineLayerTypeESQL,
  ReferenceLineLayerTypeNoESQL,
} from '../../../schema/charts/xy';
import { LENS_IGNORE_GLOBAL_FILTERS_DEFAULT_VALUE } from '../../../schema/constants';
import type { DataSourceType } from '../../../schema/data_source';
import type { LensApiStaticValueOperation } from '../../../schema/metric_ops';
import { isEsqlTableTypeDataSource } from '../../../utils';
import {
  AUTO_COLOR,
  DEFAULT_CATEGORICAL_COLOR_MAPPING,
  fromColorMappingLensStateToAPI,
  fromStaticColorLensStateToAPI,
} from '../../coloring';
import { DEFAULT_LINE_CATEGORICAL_COLOR_MAPPING } from './defaults';
import { getValueApiColumn } from '../../columns/esql_column';
import { toApiFilterLanguage } from '../../columns/filter';
import {
  isAPIColumnOfBucketType,
  isAPIColumnOfReferenceType,
  isAPIColumnOfType,
} from '../../columns/utils';
import {
  buildDataSourceState,
  generateApiLayer,
  isDataViewSpec,
  isFormBasedLayer,
  isTextBasedLayer,
  nonNullable,
  operationFromColumn,
} from '../../utils';
import { stripUndefined } from '../utils';
import { getYAccessorAxisModeMap, type ResolveAxisId } from './chart';
import { xyIconCompat } from './helpers';

function convertDataLayerToAPI(
  visualization: XYDataLayerConfig,
  layer: Omit<FormBasedLayer, 'indexPatternId'>,
  resolveAxisId: ResolveAxisId
): Omit<DataLayerTypeNoESQL, 'type' | 'data_source'>;
function convertDataLayerToAPI(
  visualization: XYDataLayerConfig,
  layer: TextBasedLayer,
  resolveAxisId: ResolveAxisId
): Omit<DataLayerTypeESQL, 'type' | 'data_source'>;
function convertDataLayerToAPI(
  visualization: XYDataLayerConfig,
  layer: Omit<FormBasedLayer, 'indexPatternId'> | TextBasedLayer,
  resolveAxisId: ResolveAxisId
):
  | Omit<DataLayerTypeNoESQL, 'type' | 'data_source'>
  | Omit<DataLayerTypeESQL, 'type' | 'data_source'> {
  const yConfigMap = new Map(visualization.yConfig?.map((y) => [y.forAccessor, y]));
  const yAccessorModesMap = getYAccessorAxisModeMap(visualization, (accessor) => accessor);
  const defaultColorMapping =
    visualization.seriesType === 'line'
      ? DEFAULT_LINE_CATEGORICAL_COLOR_MAPPING
      : DEFAULT_CATEGORICAL_COLOR_MAPPING;

  if (isFormBasedLayer(layer)) {
    const x = visualization.xAccessor
      ? operationFromColumn(visualization.xAccessor, layer)
      : undefined;

    if (x && !isAPIColumnOfBucketType(x)) {
      throw new Error('X axis must be a bucket operation');
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const breakdown_by =
      visualization.splitAccessors && visualization.splitAccessors.length > 0
        ? operationFromColumn(visualization.splitAccessors[0], layer) // TODO temp fix for this PR until XY API will be upgraded to support multiple splits
        : undefined;

    if (breakdown_by && !isAPIColumnOfBucketType(breakdown_by)) {
      throw new Error('Breakdown by axis must be a bucket operation');
    }

    const y =
      visualization.accessors
        ?.map((accessor) => {
          const apiOperation = operationFromColumn(accessor, layer);
          if (
            !apiOperation ||
            isAPIColumnOfBucketType(apiOperation) ||
            isAPIColumnOfType<LensApiStaticValueOperation>('static_value', apiOperation)
          ) {
            return undefined;
          }
          const yConfig = yConfigMap.get(accessor);

          const onAxis = resolveAxisId(yAccessorModesMap.get(accessor) ?? 'left');
          return {
            ...apiOperation,
            ...(breakdown_by
              ? {}
              : { color: fromStaticColorLensStateToAPI(yConfig?.color) ?? AUTO_COLOR }),
            ...(onAxis !== 'y' ? { axis: onAxis } : {}),
          };
        })
        .filter(nonNullable) ?? [];
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const aggregate_first =
      visualization.splitAccessors &&
      visualization.splitAccessors.length > 0 &&
      visualization.xAccessor &&
      layer.columnOrder[0] === visualization.splitAccessors[0]; // TODO temp fix for this PR until XY API will be upgraded to support multiple splits

    const color =
      fromColorMappingLensStateToAPI(visualization.colorMapping, visualization.palette) ??
      defaultColorMapping;
    return {
      ...generateApiLayer(layer),
      ...(x ? { x } : {}),
      y,
      ...(breakdown_by
        ? {
            breakdown_by: {
              ...breakdown_by,
              ...(visualization.collapseFn ? { collapse_by: visualization.collapseFn } : {}),
              ...(aggregate_first ? { aggregate_first: true } : {}),
              color,
            },
          }
        : {}),
    };
  }

  const x = visualization.xAccessor ? getValueApiColumn(visualization.xAccessor, layer) : undefined;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const breakdown_by =
    visualization.splitAccessors && visualization.splitAccessors.length > 0
      ? getValueApiColumn(visualization.splitAccessors[0], layer) // TODO temp fix for this PR until XY API will be upgraded to support multiple splits
      : undefined;
  const y = visualization.accessors?.map((accessor) => {
    const { color: yColor } = yConfigMap.get(accessor) || {};
    const axis = resolveAxisId(yAccessorModesMap.get(accessor) ?? 'left');
    return {
      ...getValueApiColumn(accessor, layer),
      ...(breakdown_by ? {} : { color: fromStaticColorLensStateToAPI(yColor) ?? AUTO_COLOR }),
      ...(axis !== 'y' ? { axis } : {}),
    };
  });

  const color =
    fromColorMappingLensStateToAPI(visualization.colorMapping, visualization.palette) ??
    defaultColorMapping;
  return {
    ...generateApiLayer(layer),
    ...(x ? { x } : {}),
    y: y || [],
    ...(breakdown_by
      ? {
          breakdown_by: {
            ...breakdown_by,
            color,
            ...(visualization.collapseFn ? { collapse_by: visualization.collapseFn } : {}),
          },
        }
      : {}),
  };
}

const seriesTypeFromStateToAPIMap: Record<SeriesType, DataLayerType['type']> = {
  bar: 'bar',
  bar_stacked: 'bar_stacked',
  bar_percentage_stacked: 'bar_percentage',
  bar_horizontal: 'bar_horizontal',
  bar_horizontal_stacked: 'bar_horizontal_stacked',
  bar_horizontal_percentage_stacked: 'bar_horizontal_percentage',
  line: 'line',
  area: 'area',
  area_stacked: 'area_stacked',
  area_percentage_stacked: 'area_percentage',
};

function convertSeriesTypeToAPIFormat(seriesType: SeriesType): DataLayerType['type'] {
  return seriesTypeFromStateToAPIMap[seriesType];
}

export function buildAPIDataLayer(
  visualization: XYDataLayerConfig,
  layer: Omit<FormBasedLayer, 'indexPatternId'> | TextBasedLayer,
  adHocDataViews: Record<string, unknown>,
  references: SavedObjectReference[],
  adhocReferences: SavedObjectReference[] | undefined,
  resolveAxisId: ResolveAxisId
): DataLayerType {
  const type = convertSeriesTypeToAPIFormat(visualization.seriesType);
  if (isTextBasedLayer(layer)) {
    const dataSource = buildDataSourceState(
      layer,
      visualization.layerId,
      adHocDataViews,
      references,
      adhocReferences
    );
    const baseLayer = convertDataLayerToAPI(visualization, layer, resolveAxisId);
    if (isEsqlTableTypeDataSource(dataSource)) {
      return {
        type,
        data_source: dataSource,
        ...baseLayer,
      };
    }
    // this should be a never as schema should ensure this scenario never happens
    throw new Error('Text based layers can only be used with ESQL or Table datasets');
  }
  const dataSource = buildDataSourceState(
    layer,
    visualization.layerId,
    adHocDataViews,
    references,
    adhocReferences
  );

  if (isEsqlTableTypeDataSource(dataSource)) {
    // this should be a never as schema should ensure this scenario never happens
    throw new Error('Form based layers cannot be used with ESQL or Table datasets');
  }
  const baseLayer = convertDataLayerToAPI(visualization, layer, resolveAxisId);

  return {
    type,
    data_source: dataSource,
    ...baseLayer,
  };
}

type ReferenceLineDef = ReferenceLineLayerType['thresholds'][number];

const referenceLinesAvailableIconsSet = new Set(Object.values(AvailableReferenceLineIcons));

function isReferenceLineValidIcon(icon: string | undefined): icon is AvailableReferenceLineIcon {
  return Boolean(icon && referenceLinesAvailableIconsSet.has(icon as AvailableReferenceLineIcon));
}

function convertReferenceLinesDecorationsToAPIFormat(
  yConfig: Omit<YConfig, 'forAccessor'>,
  resolveAxisId: ResolveAxisId
): Pick<
  ReferenceLineDef,
  'color' | 'stroke_dash' | 'stroke_width' | 'icon' | 'position' | 'fill' | 'axis' | 'text'
> {
  const resolvedOnAxis = (): ReferenceLineDef['axis'] | undefined => {
    if (!yConfig.axisMode || yConfig.axisMode === 'auto') return undefined;
    if (yConfig.axisMode === 'bottom') return 'x';
    const axisId = resolveAxisId(yConfig.axisMode);
    return axisId !== 'y' ? axisId : undefined;
  };
  return stripUndefined({
    color: fromStaticColorLensStateToAPI(yConfig.color) ?? AUTO_COLOR,
    stroke_dash: yConfig.lineStyle,
    stroke_width: yConfig.lineWidth,
    icon:
      isReferenceLineValidIcon(yConfig.icon) && yConfig.icon !== 'empty'
        ? xyIconCompat.toAPI(yConfig.icon)
        : undefined,
    position: yConfig.iconPosition,
    fill: yConfig.fill && yConfig.fill !== 'none' ? yConfig.fill : undefined,
    axis: resolvedOnAxis(),
    text: yConfig.textVisibility != null ? { visible: yConfig.textVisibility } : undefined,
  });
}

function getLabelFromLayer(
  forAccessor: string,
  layer: Omit<FormBasedLayer, 'indexPatternId'> | TextBasedLayer
): string | undefined {
  if (isFormBasedLayer(layer)) {
    return layer.columns[forAccessor]?.label;
  }
  return layer.columns.find((col) => col.columnId === forAccessor)?.label;
}

function convertReferenceLineLayerToAPI(
  visualization: XYReferenceLineLayerConfig,
  layer: Omit<FormBasedLayer, 'indexPatternId'>,
  resolveAxisId: ResolveAxisId
): Omit<ReferenceLineLayerTypeNoESQL, 'type' | 'data_source'>;
function convertReferenceLineLayerToAPI(
  visualization: XYReferenceLineLayerConfig,
  layer: TextBasedLayer,
  resolveAxisId: ResolveAxisId
): Omit<ReferenceLineLayerTypeESQL, 'type' | 'data_source'>;
function convertReferenceLineLayerToAPI(
  visualization: XYReferenceLineLayerConfig,
  layer: Omit<FormBasedLayer, 'indexPatternId'> | TextBasedLayer,
  resolveAxisId: ResolveAxisId
): Omit<ReferenceLineLayerType, 'type' | 'data_source'> {
  const yConfigMap = new Map(visualization.yConfig?.map((y) => [y.forAccessor, y]));
  const thresholds = (visualization.accessors
    ?.map((accessor): ReferenceLineDef | undefined => {
      const label = getLabelFromLayer(accessor, layer);
      const { forAccessor, ...yConfigRest } = yConfigMap.get(accessor) || {};
      const decorationConfig = convertReferenceLinesDecorationsToAPIFormat(
        yConfigRest,
        resolveAxisId
      );

      // this is very annoying as TS cannot seem to narrow the type correctly here
      // if we move this check outside the loop
      if (isFormBasedLayer(layer)) {
        const op = operationFromColumn(accessor, layer);
        if (op == null || isAPIColumnOfBucketType(op) || isAPIColumnOfReferenceType(op)) {
          return undefined;
        }
        return {
          ...op,
          ...(label != null ? { label } : {}),
          ...decorationConfig,
        };
      }
      const op = getValueApiColumn(accessor, layer);
      if (!op) {
        return undefined;
      }
      return {
        ...op,
        ...(label != null ? { label } : {}),
        ...decorationConfig,
      };
    })
    .filter(nonNullable) ?? []) satisfies ReferenceLineDef[];

  return {
    ...generateApiLayer(layer),
    // cannot really workout why satisfies works above and not here
    thresholds: thresholds as ReferenceLineLayerType['thresholds'],
  };
}

export function buildAPIReferenceLinesLayer(
  visualization: XYReferenceLineLayerConfig,
  layer: Omit<FormBasedLayer, 'indexPatternId'>,
  adHocDataViews: Record<string, unknown>,
  resolveAxisId: ResolveAxisId,
  references: SavedObjectReference[],
  adhocReferences?: SavedObjectReference[]
): ReferenceLineLayerTypeNoESQL;
/**
 * @deprecated ES|QL reference lines are not yet supported
 */
export function buildAPIReferenceLinesLayer(
  visualization: XYReferenceLineLayerConfig,
  layer: TextBasedLayer,
  adHocDataViews: Record<string, unknown>,
  resolveAxisId: ResolveAxisId,
  references: SavedObjectReference[],
  adhocReferences?: SavedObjectReference[]
): ReferenceLineLayerTypeESQL;
export function buildAPIReferenceLinesLayer(
  visualization: XYReferenceLineLayerConfig,
  layer: Omit<FormBasedLayer, 'indexPatternId'> | TextBasedLayer,
  adHocDataViews: Record<string, unknown>,
  resolveAxisId: ResolveAxisId,
  references: SavedObjectReference[],
  adhocReferences?: SavedObjectReference[]
): ReferenceLineLayerType {
  const dataSource = buildDataSourceState(
    layer,
    visualization.layerId,
    adHocDataViews,
    references,
    adhocReferences
  );
  if (isTextBasedLayer(layer)) {
    if (isEsqlTableTypeDataSource(dataSource)) {
      return {
        type: 'reference_lines',
        data_source: dataSource,
        ...convertReferenceLineLayerToAPI(visualization, layer, resolveAxisId),
      };
    }
    throw new Error('Text based layers can only be used with ESQL or Table datasets');
  }
  if (isEsqlTableTypeDataSource(dataSource)) {
    throw new Error('Form based layers cannot be used with ESQL or Table datasets');
  }
  return {
    type: 'reference_lines',
    data_source: dataSource,
    ...convertReferenceLineLayerToAPI(visualization, layer, resolveAxisId),
  };
}

function findAnnotationDataView(layerId: string, references: SavedObjectReference[]) {
  const ref = references.find((r) => r.name === `xy-visualization-layer-${layerId}`);
  return ref?.id;
}

function getTextConfigurationForQueryAnnotation(
  annotation: XYByValueAnnotationLayerConfig['annotations'][number]
): Pick<
  Extract<AnnotationLayerByValueType['events'][number], { type: 'query' }>,
  'text' | 'label'
> {
  const textConfig = {
    ...('label' in annotation && annotation.label ? { label: annotation.label } : {}),
  };
  if ('textVisibility' in annotation && annotation.textVisibility != null) {
    if ('textField' in annotation && annotation.textField) {
      return {
        ...textConfig,
        text: {
          visible: annotation.textVisibility,
          field: annotation.textField,
        },
      };
    }
    return {
      ...textConfig,
      text: { visible: annotation.textVisibility },
    };
  }
  return textConfig;
}

export function buildAPIAnnotationsLayer(
  layer: XYPersistedAnnotationLayerConfig | XYAnnotationLayerConfig,
  adHocDataViews: Record<string, unknown>,
  references: SavedObjectReference[],
  adhocReferences?: SavedObjectReference[]
): AnnotationLayerType {
  if (
    isPersistedByReferenceAnnotationsLayer(layer) ||
    isPersistedLinkedByValueAnnotationsLayer(layer)
  ) {
    const annotationGroupId = references?.find(({ name }) => name === layer.annotationGroupRef)?.id;
    if (!annotationGroupId) {
      throw new Error('XY visualization: library annotation group ID reference is missing');
    }

    return {
      type: 'annotation_group',
      group_id: annotationGroupId,
    };
  }

  const indexPatternId =
    'indexPatternId' in layer
      ? layer.indexPatternId
      : findAnnotationDataView(layer.layerId, references);

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const ignore_global_filters =
    layer.ignoreGlobalFilters ?? LENS_IGNORE_GLOBAL_FILTERS_DEFAULT_VALUE;
  const adHocDataView = adHocDataViews[layer.layerId];
  const referencedDataView = findAnnotationDataView(layer.layerId, references);

  // Only query annotations actually query an index, so the data view is only
  // meaningful for them. Manual point/range annotations are positioned purely by
  // timestamp and don't need a data view: we omit `data_source` for those layers
  // so the API output isn't polluted with an unused data view, and the data view
  // is re-derived from the chart's data layers when converting back to state.
  const hasQueryAnnotation = layer.annotations.some(isQueryAnnotationConfig);

  if (hasQueryAnnotation && !indexPatternId) {
    // A query annotation without a resolvable data view cannot be represented.
    throw new Error('XY visualization: cannot find data view ID for annotation layer.');
  }

  const dataSource: Extract<
    DataSourceType,
    { type: typeof AS_CODE_DATA_VIEW_REFERENCE_TYPE | typeof AS_CODE_DATA_VIEW_SPEC_TYPE }
  > | null =
    !hasQueryAnnotation || !indexPatternId
      ? null
      : isDataViewSpec(adHocDataView) && adHocDataView?.id === indexPatternId
      ? {
          type: AS_CODE_DATA_VIEW_SPEC_TYPE,
          index_pattern: indexPatternId,
          time_field: adHocDataView.timeFieldName,
        }
      : {
          type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
          ref_id: referencedDataView ?? indexPatternId,
        };
  return {
    type: 'annotations',
    ...(dataSource ? { data_source: dataSource } : {}),
    ignore_global_filters,
    events: layer.annotations.map((annotation) => {
      if (isQueryAnnotationConfig(annotation)) {
        return {
          type: 'query',
          label: annotation.label,
          query: annotation.filter
            ? {
                language: toApiFilterLanguage(annotation.filter.language),
                // it should never be a non-string here as schema ensures that
                expression:
                  typeof annotation.filter.query === 'string' ? annotation.filter.query : '',
              }
            : { language: 'kql', expression: '' },

          time_field: annotation.timeField!,
          ...(annotation.extraFields ? { extra_fields: annotation.extraFields } : {}),
          color: fromStaticColorLensStateToAPI(annotation.color) ?? AUTO_COLOR,
          ...(annotation.isHidden != null ? { visible: !annotation.isHidden } : {}),
          ...getTextConfigurationForQueryAnnotation(annotation),
          ...(annotation.icon ? { icon: xyIconCompat.toAPI(annotation.icon) } : {}),
          // lineWidth isn't allowed to be zero, so the truthy check is valid here
          ...(annotation.lineWidth || annotation.lineStyle
            ? {
                line: {
                  stroke_width: annotation.lineWidth ? annotation.lineWidth : 1,
                  stroke_dash: annotation.lineStyle ? annotation.lineStyle : 'solid',
                },
              }
            : {}),
        };
      }
      if (isRangeAnnotationConfig(annotation)) {
        return {
          type: 'range',
          interval: {
            from: annotation.key.timestamp,
            to: annotation.key.endTimestamp,
          },
          color: fromStaticColorLensStateToAPI(annotation.color) ?? AUTO_COLOR,
          fill: annotation.outside ? 'outside' : 'inside',
          ...(annotation.isHidden != null ? { visible: !annotation.isHidden } : {}),
          ...(annotation.label ? { label: annotation.label } : {}),
        };
      }

      return {
        type: 'point',
        timestamp: annotation.key.timestamp,
        color: fromStaticColorLensStateToAPI(annotation.color) ?? AUTO_COLOR,
        ...(annotation.isHidden != null ? { visible: !annotation.isHidden } : {}),
        ...(annotation.textVisibility != null
          ? {
              text: { visible: annotation.textVisibility },
            }
          : {}),
        ...(annotation.label ? { label: annotation.label } : {}),
        ...(annotation.icon ? { icon: xyIconCompat.toAPI(annotation.icon) } : {}),
        ...(annotation.lineWidth || annotation.lineStyle
          ? {
              line: {
                stroke_width: annotation.lineWidth ? annotation.lineWidth : 1,
                stroke_dash: annotation.lineStyle ? annotation.lineStyle : 'solid',
              },
            }
          : {}),
      };
    }),
  };
}
