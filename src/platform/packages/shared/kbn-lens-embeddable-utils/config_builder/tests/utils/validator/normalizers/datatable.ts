/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Test-only datatable (`lnsDatatable`) attribute normalizer for strict SO ↔ API round-trip checks.
 */

import type {
  DataType,
  DatatableVisualizationState,
  FormBasedLayer,
  TextBasedLayer,
} from '@kbn/lens-common';
import { parseTransposeId, getTransposeId, TRANSPOSE_SEPARATOR } from '@kbn/transpose-utils';
import { uniqBy } from 'lodash';
import {
  DEFAULT_ROW_HEIGHT_LINES,
  DEFAULT_HEADER_ROW_HEIGHT_LINES,
} from '@kbn/lens-common/visualizations/datatable/constants';

import type { LensAttributes } from '../../../../types';
import { mergeNormalizers } from './normalize';
import type { AttributesNormalizer, NormalizerConfig } from './normalize';
import type { IdRemapping } from './common';
import {
  DEFAULT_LAYER_ID,
  getColorMappingNormalizer,
  getCommonNormalizer,
  getFormBasedDatasourceState,
  getPaletteNormalizer,
  isReferenceBasedColumn,
} from './common';
import {
  getAccessorName,
  inferDatatypeFromColor,
  isMetricColumnNoESQL,
  isMetricColumnESQL,
} from '../../../../transforms/charts/datatable/helpers';
import { buildColorProps } from '../../../../transforms/charts/datatable/to_api/columns';

type DatatableAttributes = Extract<LensAttributes, { visualizationType: 'lnsDatatable' }>;

type DatatableColumn = DatatableVisualizationState['columns'][number];

/**
 * Semantic type assigned to a datatable column during classification.
 * `metric_ref` columns are internal datasource references (e.g. the `max`
 * column referenced by a `counter_rate`). They never appear in
 * `visualization.columns`.
 */
type DatatableColumnType = 'metric' | 'row' | 'split_metric_by' | 'metric_ref';

interface DatatableRemappingEntry {
  oldId: string;
  newId: string;
  type: DatatableColumnType;
}

type DatatableRemapping = DatatableRemappingEntry[];

/**
 * Adapt the typed datatable remapping to the IdRemapping shape
 */
const toIdRemapping = (remapping: DatatableRemapping): IdRemapping =>
  remapping.map(({ oldId, newId }) => [oldId, newId]);

/**
 * Ranks for sorting the `visualization.columns` array by semantic type.
 * Only rows, split_metrics_by, and metrics are valid here — refs are
 * datasource-only and never appear in `visualization.columns`.
 */
const VIZ_COLUMN_RANK = {
  row: 0,
  split_metric_by: 1,
  metric: 2,
} as const;

/**
 * Sort visualization columns by semantic type: rows first, then split_metrics_by, then metrics.
 * Within each group, sort by columnId for stable ordering.
 * This is the sorting logic used by the transform.
 */
function sortByColumnType(a: DatatableColumn, b: DatatableColumn): number {
  const rank = (col: DatatableColumn) => {
    if (col.isMetric) {
      return VIZ_COLUMN_RANK.metric;
    }
    if (col.isTransposed) {
      return VIZ_COLUMN_RANK.split_metric_by;
    }
    return VIZ_COLUMN_RANK.row;
  };
  const diff = rank(a) - rank(b);
  return diff !== 0 ? diff : a.columnId.localeCompare(b.columnId, undefined, { numeric: true });
}

const ROW_PREFIX = `${getAccessorName('row')}_`;
const SPLIT_PREFIX = `${getAccessorName('split_metric_by')}_`;
const METRIC_PREFIX = `${getAccessorName('metric')}_`;
const METRIC_REF_PREFIX = `${getAccessorName('metric_ref')}_`;

const isMetricColumnId = (id: string): boolean =>
  id.startsWith(METRIC_PREFIX) && !id.startsWith(METRIC_REF_PREFIX);
const isRowColumnId = (id: string): boolean => id.startsWith(ROW_PREFIX);
const isSplitMetricColumnId = (id: string): boolean => id.startsWith(SPLIT_PREFIX);

/**
 * A column id belongs to the visualization state (i.e. is rendered) when it
 * is a row, a split_metric_by, or a top-level metric.
 * References (`metric_ref_*`) and any unknowns are non-visualization-state: they exist
 * only in the datasource layer and are hidden at render time.
 */
const isVisualizationStateColumnId = (id: string): boolean =>
  isRowColumnId(id) || isSplitMetricColumnId(id) || isMetricColumnId(id);

/**
 * Canonical order for datasource columnOrder: split_metrics_by → rows → metrics
 * → everything else (refs and any unknowns).
 *
 * Matches Lens datatable editor nesting (split outer, rows inner, metrics last).
 */
const sortDatasourceColumnsToCanonicalOrder = (ids: string[]): string[] => [
  ...ids.filter((id) => isSplitMetricColumnId(id)),
  ...ids.filter((id) => isRowColumnId(id)),
  ...ids.filter((id) => isMetricColumnId(id)),
  ...ids.filter((id) => !isVisualizationStateColumnId(id)),
];

/**
 * Classify a visualization column as a metric, split_metric_by, or row.
 */
function classifyVisualizationColumn(
  isMetric: boolean,
  isTransposed: boolean | undefined
): Exclude<DatatableColumnType, 'metric_ref'> {
  if (isMetric) {
    return 'metric';
  }
  if (isTransposed) {
    return 'split_metric_by';
  }
  return 'row';
}

/**
 * Push a remapping entry to the remapping array.
 */
function pushRemappingEntry(
  remapping: DatatableRemapping,
  oldId: string,
  type: DatatableColumnType,
  indices: Record<DatatableColumnType, number>
): void {
  remapping.push({ oldId, type, newId: getAccessorName(type, indices[type]++) });
}

/**
 * Create a map of column types to their index.
 */
const createTypeIndices = (): Record<DatatableColumnType, number> => ({
  metric: 0,
  row: 0,
  split_metric_by: 0,
  metric_ref: 0,
});

/**
 * Remap column IDs for form-based datasource layers.
 */
function getColumnRemappingFormBased(
  visualization: DatatableVisualizationState,
  layer: Omit<FormBasedLayer, 'indexPatternId'>
): DatatableRemapping {
  const columnStateMap = new Map(visualization.columns.map((col) => [col.columnId, col]));
  const indices = createTypeIndices();
  const remapping: DatatableRemapping = [];

  for (const columnId of layer.columnOrder) {
    const column = columnStateMap.get(columnId);
    if (!column) {
      continue;
    }
    const type = classifyVisualizationColumn(
      isMetricColumnNoESQL(column, layer.columns[columnId]),
      column.isTransposed
    );
    pushRemappingEntry(remapping, columnId, type, indices);
  }

  // Remap internal reference columns (e.g., max referenced by counter_rate)
  // These are not in visualization.columns but exist in the datasource layer.
  for (const { oldId } of [...remapping]) {
    const dsCol = layer.columns[oldId];
    // Exclude formula columns — their internal math references are cleared separately.
    // Only ReferenceBasedIndexPatternColumn have references array.
    if (!dsCol || dsCol.operationType === 'formula' || !isReferenceBasedColumn(dsCol)) {
      continue;
    }

    for (const refId of dsCol.references) {
      if (layer.columns[refId]) {
        pushRemappingEntry(remapping, refId, 'metric_ref', indices);
      }
    }
  }

  return remapping;
}

/**
 * Remap column IDs for text-based datasource layers.
 */
function getColumnRemappingTextBased(
  visualization: DatatableVisualizationState,
  layer: TextBasedLayer
): DatatableRemapping {
  const columnStateMap = new Map(visualization.columns.map((col) => [col.columnId, col]));
  const indices = createTypeIndices();
  const remapping: DatatableRemapping = [];

  for (const { columnId } of layer.columns) {
    const column = columnStateMap.get(columnId);
    if (!column) continue;

    const type = classifyVisualizationColumn(
      isMetricColumnESQL(column, layer.columns),
      column.isTransposed
    );
    pushRemappingEntry(remapping, columnId, type, indices);
  }

  return remapping;
}

/**
 * Remap column IDs
 */
function getColumnRemapping(
  visualization: DatatableVisualizationState,
  datasourceStates: LensAttributes['state']['datasourceStates']
): DatatableRemapping {
  const formBasedLayer = Object.values(
    getFormBasedDatasourceState(datasourceStates)?.layers ?? {}
  )[0];
  if (formBasedLayer) {
    return getColumnRemappingFormBased(visualization, formBasedLayer);
  }

  const textBasedLayer = Object.values(datasourceStates.textBased?.layers ?? {})[0];
  if (textBasedLayer) {
    return getColumnRemappingTextBased(visualization, textBasedLayer);
  }

  return [];
}

/**
 * Filter out visualization columns that exist in the visualization state
 * but have no corresponding column in the datasource layer.
 * Must run before alignId since it matches on original column UUIDs.
 */
function getFilterOrphanColumns(
  datasourceStates: LensAttributes['state']['datasourceStates']
): NormalizerConfig<DatatableAttributes> {
  const formBasedColumns = Object.values(
    getFormBasedDatasourceState(datasourceStates)?.layers ?? {}
  )[0]?.columnOrder;
  const textBasedColumns = Object.values(datasourceStates.textBased?.layers ?? {})[0]?.columns;

  const datasourceColumnIds = new Set(
    formBasedColumns ?? textBasedColumns?.map(({ columnId }) => columnId) ?? []
  );

  return {
    original: (attrs) => {
      attrs.state.visualization.columns = attrs.state.visualization.columns.filter((col) =>
        datasourceColumnIds.has(col.columnId)
      );
      return attrs;
    },
  };
}

/**
 * Precompute the remapping from the original (unmutated) state,
 * then pass it to both the common normalizer and the visualization ID normalizer.
 * This avoids the ordering issue where getCommonNormalizer (order: -1) mutates
 * datasource column IDs before alignId tries to read them.
 */
export const normalizeDatatable: AttributesNormalizer<DatatableAttributes> = (attributes) => {
  const { visualization, datasourceStates } = attributes.original.state;
  const columnRemapping = getColumnRemapping(visualization, datasourceStates);
  const layerRemapping: IdRemapping = [[visualization.layerId, DEFAULT_LAYER_ID]];

  // Map original column ID → new column ID
  const idMap = new Map(toIdRemapping(columnRemapping));

  // Map post-remap column ID → visualization column state.
  const visColumnByNewId = new Map<string, DatatableColumn>(
    columnRemapping.flatMap(({ oldId, newId }) => {
      const visCol = visualization.columns.find((c) => c.columnId === oldId);
      return visCol ? [[newId, visCol]] : [];
    })
  );

  // Form-based: only last_value metrics need color to pick number vs string; other ops
  // have a fixed dataType and fall through to `normalizeDataTypes`.
  // Text-based: `getValueColumn` uses the same color hint for metrics/rows, and splits
  // are always string. Bucket dates must not be forced to string on the form-based path.
  const inferColumnDataType = (
    newColumnId: string,
    { isTextBased }: { isTextBased: boolean }
  ): DataType | undefined => {
    if (isTextBased) {
      if (isSplitMetricColumnId(newColumnId)) {
        return;
      }
      const visCol = visColumnByNewId.get(newColumnId);
      const color = visCol ? buildColorProps(visCol).color : undefined;
      if (isMetricColumnId(newColumnId)) {
        return inferDatatypeFromColor(color, 'number');
      }
      if (isRowColumnId(newColumnId)) {
        return inferDatatypeFromColor(color, 'string');
      }
      return;
    }

    if (!isMetricColumnId(newColumnId)) {
      return;
    }

    const visCol = visColumnByNewId.get(newColumnId);
    if (!visCol) {
      return;
    }

    return inferDatatypeFromColor(buildColorProps(visCol).color, 'number');
  };

  // Filter out visualization columns that only exist in the visualization state
  const filterOrphanColumns = getFilterOrphanColumns(datasourceStates);

  // Align IDs
  const alignId: NormalizerConfig<DatatableAttributes> = {
    original: (attrs) => {
      const viz = attrs.state.visualization;
      viz.layerId = DEFAULT_LAYER_ID;

      for (const col of viz.columns) {
        col.columnId = idMap.get(col.columnId) ?? col.columnId;
      }

      if (viz.sorting?.columnId) {
        const parsed = parseTransposeId(viz.sorting.columnId);
        if (parsed) {
          const mapped = idMap.get(parsed.id);
          if (mapped) {
            viz.sorting.columnId = getTransposeId(parsed.values.join(TRANSPOSE_SEPARATOR), mapped);
          }
        } else {
          viz.sorting.columnId = idMap.get(viz.sorting.columnId) ?? viz.sorting.columnId;
        }
      }
      return attrs;
    },
  };

  // Map original column ID → { isMetric, isTransposed } using the type assigned
  // during classification.
  // Original SOs may omit these flags. The transform always sets them explicitly.
  const columnTypeMap = new Map(
    columnRemapping
      .filter(({ type }) => type !== 'metric_ref')
      .map(({ oldId, type }) => [
        oldId,
        { isMetric: type === 'metric', isTransposed: type === 'split_metric_by' },
      ])
  );

  // Map original column ID → { isMetric, isTransposed } using the type assigned
  const alignColumnTypes: NormalizerConfig<DatatableAttributes> = {
    original: (attrs) => {
      for (const col of attrs.state.visualization.columns) {
        const types = columnTypeMap.get(col.columnId);
        if (types) {
          col.isMetric = types.isMetric;
          col.isTransposed = types.isTransposed;
        }
      }
      return attrs;
    },
  };

  // Align legacy types
  const alignLegacyTypes: NormalizerConfig<DatatableAttributes> = {
    original: (attrs) => {
      const vis = attrs.state.visualization;
      // 'single' is a legacy rowHeight value that maps to 'custom' with rowHeightLines: 1
      if ((vis.rowHeight as string) === 'single') {
        vis.rowHeight = 'custom';
      }
      // 'single' is a legacy headerRowHeight value that maps to 'custom' with headerRowHeightLines: 1
      if ((vis.headerRowHeight as string) === 'single') {
        vis.headerRowHeight = 'custom';
      }
      // When rowHeight is absent but lines are set, should fallback to 'custom'
      if (!vis.rowHeight && vis.rowHeightLines) {
        vis.rowHeight = 'custom';
      }
      // When headerRowHeight is absent but lines are set, should fallback to 'custom'
      if (!vis.headerRowHeight && vis.headerRowHeightLines) {
        vis.headerRowHeight = 'custom';
      }
      // rowHeightLines is meaningless when rowHeight is 'auto'; the transform does not set it
      if (vis.rowHeight === 'auto' && vis.rowHeightLines) {
        delete vis.rowHeightLines;
      }
      // headerRowHeightLines is meaningless when headerRowHeight is 'auto'; the transform does not set it
      if (vis.headerRowHeight === 'auto' && vis.headerRowHeightLines) {
        delete vis.headerRowHeightLines;
      }
      // when rowHeight is 'custom' and rowHeightLines is not set, Lens defaults to DEFAULT_ROW_HEIGHT_LINES (1)
      if (vis.rowHeight === 'custom' && vis.rowHeightLines === undefined) {
        vis.rowHeightLines = DEFAULT_ROW_HEIGHT_LINES;
      }
      // when headerRowHeight is 'custom' and headerRowHeightLines is not set, Lens defaults to DEFAULT_HEADER_ROW_HEIGHT_LINES (3)
      if (vis.headerRowHeight === 'custom' && vis.headerRowHeightLines === undefined) {
        vis.headerRowHeightLines = DEFAULT_HEADER_ROW_HEIGHT_LINES;
      }
      // paging with enabled: false is the default; the transform does not produce it
      if (vis.paging && !vis.paging.enabled) {
        delete vis.paging;
      }
      // The API schema only supports paging sizes [10, 20, 30, 50, 100] -> non-standard sizes are normalized to 10
      if (vis.paging?.enabled && ![10, 20, 30, 50, 100].includes(vis.paging.size)) {
        vis.paging.size = 10;
      }
      // If the sorting direction is not set, set it to 'asc'
      if (vis.sorting && vis.sorting.columnId && !vis.sorting.direction) {
        vis.sorting.direction = 'asc';
      }
      // if sorting is null, delete it
      if (vis.sorting === null || (vis.sorting && vis.sorting.columnId === undefined)) {
        delete vis.sorting;
      }
      // fitRowToContent is a runtime-only expression arg derived from rowHeight === 'auto' -> should not be persisted
      if ((vis as any).fitRowToContent) {
        delete (vis as any).fitRowToContent;
      }
      for (const col of vis.columns) {
        // colorMode 'none' is the default and equivalent to not setting it (the majority of the columns do not have a colorMode set at all - meaning no coloring)
        if (col.colorMode === 'none') {
          delete col.colorMode;
        }
        // summaryRow on non-metric columns is a legacy artifact -> the API only supports summary on metrics
        if (!col.isMetric && col.summaryRow) {
          delete col.summaryRow;
          delete col.summaryLabel;
        }
        // summaryRow 'none' is the default, equivalent to not setting it
        if (col.summaryRow === 'none') {
          delete col.summaryRow;
          delete col.summaryLabel;
        }
        // When colorMapping is present, palette is redundant (legacy) and dropped by the transform
        if (col.colorMapping && col.palette) {
          delete col.palette;
        }
        // When colorMapping is null, delete it
        if (col.colorMapping === null) {
          delete col.colorMapping;
        }

        // When palette is null, delete it
        if (col.palette === null) {
          delete col.palette;
        }
        // collapseFn '', equivalent to not setting it
        if ((col.collapseFn as string) === '') {
          delete col.collapseFn;
        }
      }
      return attrs;
    },
  };

  // Remove duplicate visualization columns by columnId.
  const deduplicateColumns: NormalizerConfig<DatatableAttributes> = {
    original: (attrs) => {
      attrs.state.visualization.columns = uniqBy(attrs.state.visualization.columns, 'columnId');
      return attrs;
    },
  };

  // Sort visualization columns by semantic type: rows first, then split_metrics_by, then metrics.
  const sortColumns: NormalizerConfig<DatatableAttributes> = {
    original: (attrs) => {
      attrs.state.visualization.columns.sort(sortByColumnType);
      return attrs;
    },
  };

  // The transform always sets `inMetricDimension: true` on metric columns.
  // there are integration panels that have `isMetric: true` on the viz column
  // but were never tagged by the suggestion engine, so the layer column lacks
  // the flag. Fill it in when the remapped column ID confirms it's a metric.
  const alignEsqlInMetricDimension: NormalizerConfig<DatatableAttributes> = {
    original: (attrs) => {
      const textBasedLayer = Object.values(attrs.state.datasourceStates.textBased?.layers ?? {})[0];
      if (!textBasedLayer) {
        return attrs;
      }

      for (const column of textBasedLayer.columns) {
        if (isMetricColumnId(column.columnId) && column.inMetricDimension === undefined) {
          column.inMetricDimension = true;
        }
      }

      return attrs;
    },
  };

  // ES|QL text-based layers keep columns in editor order (often metrics first).
  // fromAPIFormat emits split → rows → metrics for nesting; normalize originals only.
  const sortEsqlDatasourceColumns: NormalizerConfig<DatatableAttributes> = {
    original: (attrs) => {
      const textBasedLayer = Object.values(attrs.state.datasourceStates.textBased?.layers ?? {})[0];
      if (textBasedLayer) {
        const byId = new Map(textBasedLayer.columns.map((c) => [c.columnId, c]));
        const orderedIds = sortDatasourceColumnsToCanonicalOrder(
          textBasedLayer.columns.map((c) => c.columnId)
        );
        textBasedLayer.columns = orderedIds.map((id) => byId.get(id)!);
      }

      return attrs;
    },
  };

  return mergeNormalizers<DatatableAttributes>([
    getCommonNormalizer<DatatableAttributes>(() => ({
      layerRemapping,
      columnRemapping: toIdRemapping(columnRemapping),
      inferColumnDataType,
    })),
    filterOrphanColumns,
    alignColumnTypes,
    alignId,
    alignEsqlInMetricDimension,
    deduplicateColumns,
    sortColumns,
    sortEsqlDatasourceColumns,
    alignLegacyTypes,
    getColorMappingNormalizer<DatatableAttributes>('state.visualization.columns.*.colorMapping'),
    getPaletteNormalizer<DatatableAttributes>('state.visualization.columns.*.palette'),
  ])(attributes);
};
