/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  LENS_DATASOURCE_ID,
  LENS_HEATMAP_CHART_SHAPES,
  LENS_METRIC_ID,
  LENS_TAGCLOUD_ID,
  PARTITION_CHART_TYPES,
  SeriesTypes,
  type DateHistogramIndexPatternColumn,
  type FormBasedPersistedState,
  type FormBasedPrivateState,
  type FormBasedLayer,
  type GenericIndexPatternColumn,
  type LensDocument,
  type RangeIndexPatternColumn,
} from '@kbn/lens-common';

/** Bucket columns whose `params.includeEmptyRows` this module reconciles. */
type EmptyRowsBucketColumn = DateHistogramIndexPatternColumn | RangeIndexPatternColumn;

const EMPTY_ROWS_OPERATION_TYPES = ['date_histogram', 'range'] as const;
const BUCKET_OPERATIONS_WITH_EMPTY_ROWS: ReadonlySet<string> = new Set(EMPTY_ROWS_OPERATION_TYPES);

const isEmptyRowsBucketColumn = (
  column: GenericIndexPatternColumn
): column is EmptyRowsBucketColumn => BUCKET_OPERATIONS_WITH_EMPTY_ROWS.has(column.operationType);

/** Default `buildColumn` applies when `includeEmptyRows` is omitted. */
const DEFAULT_INCLUDE_EMPTY_ROWS = true;

function normalizeIncludeEmptyRows(value: boolean | undefined): boolean {
  return value ?? DEFAULT_INCLUDE_EMPTY_ROWS;
}

function getIncludeEmptyRows(column: EmptyRowsBucketColumn): boolean | undefined {
  return column.params?.includeEmptyRows;
}

/**
 * Visualization type ids (per `Visualization#getVisualizationTypeId`) that
 * default `includeEmptyRows` to `false` for new bucket columns.
 */
const VIS_TYPES_WITH_EMPTY_ROWS_OFF_BY_DEFAULT: ReadonlySet<string> = new Set<string>([
  // XY bar collapses every orientation and stacking mode to this subtype id.
  SeriesTypes.BAR,
  LENS_HEATMAP_CHART_SHAPES.HEATMAP,
  PARTITION_CHART_TYPES.PIE,
  PARTITION_CHART_TYPES.TREEMAP,
  PARTITION_CHART_TYPES.MOSAIC,
  PARTITION_CHART_TYPES.WAFFLE,
  LENS_METRIC_ID,
  LENS_TAGCLOUD_ID,
]);

/**
 * Default `includeEmptyRows` for a new bucket column, given the active
 * visualization type id. Falls back to the historical `true` when the id is
 * unknown (e.g. a column created outside the Lens editor).
 */
export function getDefaultIncludeEmptyRows(visualizationTypeId?: string): boolean {
  if (!visualizationTypeId) {
    return true;
  }
  return !VIS_TYPES_WITH_EMPTY_ROWS_OFF_BY_DEFAULT.has(visualizationTypeId);
}

/** `buildColumn` param overrides owned by this module for a new bucket column. */
type NewBucketColumnParams = Required<
  Pick<DateHistogramIndexPatternColumn['params'], 'includeEmptyRows'>
>;

/**
 * Per-visualization `buildColumn` param overrides for a new column, or
 * `undefined` when the operation owns no opinionated default.
 */
export function getColumnParamsForNewBucket(
  operationType: string,
  activeVisualizationTypeId?: string
): NewBucketColumnParams | undefined {
  if (operationType !== 'date_histogram' && operationType !== 'range') {
    return undefined;
  }
  return { includeEmptyRows: getDefaultIncludeEmptyRows(activeVisualizationTypeId) };
}

function withIncludeEmptyRows<TColumn extends EmptyRowsBucketColumn>(
  column: TColumn,
  value: boolean
): TColumn {
  return {
    ...column,
    params: { ...column.params, includeEmptyRows: value },
  };
}

/**
 * Rewrites bucket columns via a per-column decision callback, returning the
 * same state reference when nothing changed.
 */
function mapBucketColumns(
  state: FormBasedPrivateState,
  decide: (
    layerId: string,
    columnId: string,
    column: GenericIndexPatternColumn
  ) => boolean | undefined
): FormBasedPrivateState {
  if (!state?.layers) {
    return state;
  }

  let changed = false;
  const nextLayers: Record<string, FormBasedLayer> = {};

  for (const layerId of Object.keys(state.layers)) {
    const layer = state.layers[layerId];
    let layerChanged = false;
    const nextColumns: Record<string, GenericIndexPatternColumn> = {};

    for (const columnId of Object.keys(layer.columns)) {
      const column = layer.columns[columnId];
      const nextValue = isEmptyRowsBucketColumn(column)
        ? decide(layerId, columnId, column)
        : undefined;
      if (
        nextValue !== undefined &&
        isEmptyRowsBucketColumn(column) &&
        nextValue !== getIncludeEmptyRows(column)
      ) {
        nextColumns[columnId] = withIncludeEmptyRows(column, nextValue);
        layerChanged = true;
      } else {
        nextColumns[columnId] = column;
      }
    }

    if (layerChanged) {
      nextLayers[layerId] = { ...layer, columns: nextColumns };
      changed = true;
    } else {
      nextLayers[layerId] = layer;
    }
  }

  return changed ? { ...state, layers: nextLayers } : state;
}

/**
 * Applies the target visualization's `includeEmptyRows` default to columns that
 * are new in the suggestion (their id is absent from the previous state),
 * leaving already-configured columns untouched.
 *
 * Returns the suggestion state unchanged when nothing needs to be rewritten.
 */
export function applyEmptyRowsDefaultsToSuggestionState(
  suggestionState: FormBasedPrivateState,
  previousState: FormBasedPrivateState | undefined,
  targetVisualizationTypeId: string | undefined
): FormBasedPrivateState {
  if (getDefaultIncludeEmptyRows(targetVisualizationTypeId)) {
    return suggestionState;
  }

  return mapBucketColumns(suggestionState, (layerId, columnId) => {
    const isNew = !previousState?.layers?.[layerId]?.columns?.[columnId];
    return isNew ? false : undefined;
  });
}

/** Form-based layers from the saved object, or `undefined` when never saved. */
function getPersistedFormBasedLayers(
  persistedDoc: LensDocument | undefined
): FormBasedPersistedState['layers'] | undefined {
  // Intentional `as FormBasedPersistedState` type assertion as `LensDocument.state.datasourceStates`
  // is the persisted saved object payload typed `Record<string, unknown>`;
  const formBased = persistedDoc?.state?.datasourceStates?.[LENS_DATASOURCE_ID.FORM_BASED] as
    | FormBasedPersistedState
    | undefined;
  return formBased?.layers;
}

/**
 * Applies the target visualization type's `includeEmptyRows` default to bucket
 * columns when switching chart type (or XY series type).
 *
 * The opinionated default always wins, overriding any value carried over from
 * the previous type. The single exception is switching a layer back to its
 * saved type: a column whose layer's persisted visualization type id equals the
 * target type restores its saved value instead, so a round trip returns to the
 * configuration the user explicitly saved.
 *
 * `targetLayerId` scopes the reconciliation to a single layer, used by a
 * same-visualization subtype switch (e.g. XY series type) that only changes the
 * type of one layer. When omitted, every layer is reconciled, as a
 * cross-visualization switch collapses the whole chart to one type.
 *
 * Returns the state reference unchanged when nothing needs to be rewritten.
 */
export function applyEmptyRowsDefaultsOnTypeSwitch(
  suggestionState: FormBasedPrivateState,
  persistedDoc: LensDocument | undefined,
  targetVisualizationTypeId: string | undefined,
  getPersistedVisualizationTypeId?: (layerId: string) => string | undefined,
  targetLayerId?: string
): FormBasedPrivateState {
  const targetDefault = getDefaultIncludeEmptyRows(targetVisualizationTypeId);
  const persistedLayers = getPersistedFormBasedLayers(persistedDoc);

  return mapBucketColumns(suggestionState, (layerId, columnId) => {
    if (targetLayerId !== undefined && layerId !== targetLayerId) {
      return undefined;
    }

    const persistedColumn = persistedLayers?.[layerId]?.columns?.[columnId];
    const restoresSavedType =
      persistedColumn !== undefined &&
      targetVisualizationTypeId !== undefined &&
      getPersistedVisualizationTypeId?.(layerId) === targetVisualizationTypeId;

    if (
      persistedColumn !== undefined &&
      restoresSavedType &&
      isEmptyRowsBucketColumn(persistedColumn)
    ) {
      return normalizeIncludeEmptyRows(getIncludeEmptyRows(persistedColumn));
    }
    return targetDefault;
  });
}
