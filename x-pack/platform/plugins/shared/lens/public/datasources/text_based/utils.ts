/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { DatatableColumn } from '@kbn/expressions-plugin/public';
import type {
  ValueFormatConfig,
  IndexPatternRef,
  TextBasedPrivateState,
  TextBasedLayerColumn,
  TextBasedLayer,
} from '@kbn/lens-common';

export const MAX_NUM_OF_COLUMNS = 10;

export async function loadIndexPatternRefs(
  indexPatternsService: DataViewsPublicPluginStart
): Promise<IndexPatternRef[]> {
  const indexPatterns = await indexPatternsService.getIdsWithTitle();

  const timefields = await Promise.all(
    indexPatterns.map((p) => indexPatternsService.get(p.id).then((pat) => pat.timeFieldName))
  );

  return indexPatterns
    .map((p, i) => ({ ...p, timeField: timefields[i] }))
    .sort((a, b) => {
      return a.title.localeCompare(b.title);
    });
}

export const getAllColumns = (
  existingColumns: TextBasedLayerColumn[],
  columnsFromQuery: DatatableColumn[]
) => {
  // filter out columns that do not exist on the query
  const columns = existingColumns.filter((c) => {
    const columnExists = columnsFromQuery?.some((f) => f.name === c?.fieldName);
    if (columnExists) return c;
  });
  const allCols = [
    ...columns,
    ...columnsFromQuery.map((c) => ({
      columnId: c.id,
      fieldName: c.id,
      label: c.name,
      meta: c.meta,
      ...(c.variable ? { variable: c.variable } : {}),
    })),
  ];
  const uniqueIds: string[] = [];

  return allCols.filter((col) => {
    const isDuplicate = uniqueIds.includes(col.columnId);

    if (!isDuplicate) {
      uniqueIds.push(col.columnId);

      return true;
    }

    return false;
  });
};

export const isNumeric = (column: TextBasedLayerColumn | DatatableColumn) =>
  column?.meta?.type === 'number';

export const isNotNumeric = (column: TextBasedLayerColumn | DatatableColumn) => !isNumeric(column);

export function canColumnBeDroppedInMetricDimension(
  columns: TextBasedLayerColumn[] | DatatableColumn[],
  selectedColumnType?: string
): boolean {
  // check if at least one numeric field exists
  const hasNumberTypeColumns = columns?.some(isNumeric);
  return !hasNumberTypeColumns || (hasNumberTypeColumns && selectedColumnType === 'number');
}

export function canColumnBeUsedBeInMetricDimension(
  columns: TextBasedLayerColumn[] | DatatableColumn[],
  selectedColumnType?: string
): boolean {
  // check if at least one numeric field exists
  const hasNumberTypeColumns = columns?.some(isNumeric);
  return (
    !hasNumberTypeColumns ||
    columns.length >= MAX_NUM_OF_COLUMNS ||
    (hasNumberTypeColumns && selectedColumnType === 'number')
  );
}

export function mergeLayer({
  state,
  layerId,
  newLayer,
}: {
  state: TextBasedPrivateState;
  layerId: string;
  newLayer: Partial<TextBasedLayer>;
}) {
  return {
    ...state,
    layers: {
      ...state.layers,
      [layerId]: { ...state.layers[layerId], ...newLayer },
    },
  };
}

export function updateColumnLabel({
  layer,
  columnId,
  value,
}: {
  layer: TextBasedLayer;
  columnId: string;
  value: string;
}): TextBasedLayer {
  const currentColumnIndex = layer.columns.findIndex((c) => c.columnId === columnId);
  const currentColumn = layer.columns[currentColumnIndex];
  return {
    ...layer,
    columns: [
      ...layer.columns.slice(0, currentColumnIndex),
      {
        ...currentColumn,
        label: value,
        customLabel: Boolean(value) && value !== currentColumn.fieldName,
      },
      ...layer.columns.slice(currentColumnIndex + 1),
    ],
  };
}

export function updateColumnFormat({
  layer,
  columnId,
  value,
}: {
  layer: TextBasedLayer;
  columnId: string;
  value: ValueFormatConfig | undefined;
}): TextBasedLayer {
  const currentColumnIndex = layer.columns.findIndex((c) => c.columnId === columnId);
  const currentColumn = layer.columns[currentColumnIndex];
  return {
    ...layer,
    columns: [
      ...layer.columns.slice(0, currentColumnIndex),
      {
        ...currentColumn,
        params: { ...currentColumn.params, format: value },
      },
      ...layer.columns.slice(currentColumnIndex + 1),
    ],
  };
}

export function updateColumnDropPartials({
  layer,
  columnId,
  value,
}: {
  layer: TextBasedLayer;
  columnId: string;
  value: boolean;
}): TextBasedLayer {
  const currentColumnIndex = layer.columns.findIndex((c) => c.columnId === columnId);
  const currentColumn = layer.columns[currentColumnIndex];
  return {
    ...layer,
    columns: [
      ...layer.columns.slice(0, currentColumnIndex),
      {
        ...currentColumn,
        params: { ...currentColumn.params, dropPartials: value },
      },
      ...layer.columns.slice(currentColumnIndex + 1),
    ],
  };
}
