/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Direction } from '@elastic/eui';
import type { ColorMapping, CustomPaletteParams, PaletteOutput } from '@kbn/coloring';
import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import type { CustomPaletteState } from '@kbn/charts-plugin/common';
import type { $Values } from '@kbn/utility-types';
import type { CollapseFunction, LensEditEvent, LensLayerType } from '../types';
import type { SortingHint } from '../../types';
import type {
  LENS_DATAGRID_DENSITY,
  LENS_DATATABLE_COLUMN,
  LENS_EDIT_PAGESIZE_ACTION,
  LENS_EDIT_RESIZE_ACTION,
  LENS_EDIT_SORT_ACTION,
  LENS_ROW_HEIGHT_MODE,
  LENS_TOGGLE_ACTION,
} from './constants';

export type RowHeightMode = $Values<typeof LENS_ROW_HEIGHT_MODE>;
export type DataGridDensity = $Values<typeof LENS_DATAGRID_DENSITY>;

export interface LensDatatableSortingState {
  columnId: string | undefined;
  direction: 'asc' | 'desc' | 'none';
}

export interface LensDatatablePagingState {
  size: number;
  enabled: boolean;
}

export interface LensDatatableArgs {
  title: string;
  description?: string;
  columns: DatatableColumnResult[];
  sortingColumnId: LensDatatableSortingState['columnId'];
  sortingDirection: LensDatatableSortingState['direction'];
  fitRowToContent?: boolean;
  rowHeightLines?: number;
  headerRowHeight?: RowHeightMode;
  headerRowHeightLines?: number;
  pageSize?: LensDatatablePagingState['size'];
  density?: DataGridDensity;
}

export type LensGridDirection = 'none' | Direction;

export interface DatatableColumnConfig {
  columns: DatatableColumnResult[];
  sortingColumnId: string | undefined;
  sortingDirection: LensGridDirection;
}

export type DatatableColumnArgs = Omit<ColumnState, 'palette' | 'colorMapping'> & {
  palette?: PaletteOutput<CustomPaletteState>;
  colorMapping?: string;
  summaryRowValue?: unknown;
  sortingHint?: SortingHint;
};

export type DatatableColumnResult = DatatableColumnArgs & {
  type: typeof LENS_DATATABLE_COLUMN;
};

/**
 * Cell decoration mode for a datatable column.
 * Formerly surfaced in the editor as "Color by value"; now "Cell decoration".
 *
 * The stored value `'cell'` is surfaced in the editor as "Background".
 */
export type ColumnCellDecorationMode = 'none' | 'cell' | 'text' | 'badge' | 'progress';

/**
 * Fill style for a value-driven cell decoration.
 *
 * Shared by the datatable cell decorations (the `progress` decoration today),
 * shaped so another cell decoration can adopt the same single/solid/gradient
 * model without a new type.
 * - `single`: one fixed color for the whole fill.
 * - `solid`: one palette-resolved color, derived from the cell value.
 * - `gradient`: the palette gradient revealed inside the filled extent.
 */
export type CellDecorationFillMode = 'single' | 'solid' | 'gradient';

/**
 * Value range that drives a cell decoration's domain.
 * - `auto`: derive the domain from the loaded column values.
 * - `custom`: use an explicit `[min, max]` domain (supports a negative `min`).
 *
 * For `single` fills this range is the source of truth. For `solid`/`gradient`
 * fills the active custom range is kept in sync with the palette color bounds
 * (`palette.params.rangeMin`/`rangeMax`).
 *
 * `min`/`max` may also be present while `mode` is `auto`: they hold the last
 * committed custom bounds so toggling `auto`<->`custom` restores them rather
 * than resetting to the data bounds. They are inert while `mode` is `auto`
 * (the domain falls back to the data bounds).
 */
export interface CellDecorationValueRange {
  mode: 'auto' | 'custom';
  min?: number;
  max?: number;
}

/**
 * Fill configuration for a value-driven cell decoration.
 *
 * Consumed today by the `progress` decoration; shaped so a future cell
 * decoration (e.g. a gradient cell background) can reuse it without a new type.
 */
export interface CellDecorationFillConfig {
  fillMode: CellDecorationFillMode;
  /** Fill color for the `single` style. Ignored for `solid`/`gradient`. */
  color?: string;
  /**
   * Value range driving the domain. For `solid`/`gradient` the custom bounds
   * mirror `palette.params.rangeMin`/`rangeMax`; for `single` they live here.
   */
  valueRange?: CellDecorationValueRange;
  /**
   * Anchor value at which the fill starts, expressed in the column's value units
   * (defaults to `0`). The fill grows from this baseline toward the value, so a
   * baseline inside the domain (e.g. the 25th percentile) leaves part of the
   * track empty before the fill begins.
   *
   * Not configurable from the editor yet; exposed for the as-code API and
   * agentic configuration, and consumed by the renderer when present.
   */
  baseline?: number;
}

export interface ColumnState {
  columnId: string;
  width?: number;
  hidden?: boolean;
  oneClickFilter?: boolean;
  isTransposed?: boolean;
  // These flags are necessary to transpose columns and map them back later
  // They are set automatically and are not user-editable
  transposable?: boolean;
  originalColumnId?: string;
  originalName?: string;
  bucketValues?: Array<{ originalBucketColumn: DatatableColumn; value: unknown }>;
  alignment?: 'left' | 'right' | 'center';
  // Color by value configuration for numeric data
  palette?: PaletteOutput<CustomPaletteParams>;
  // Categorical color mapping configuration
  colorMapping?: ColorMapping.Config;
  colorMode?: ColumnCellDecorationMode;
  // Fill configuration for value-driven cell decorations (currently the
  // "progress" cell decoration for numeric data). Shared so other cell
  // decorations can reuse it.
  fillStyle?: CellDecorationFillConfig;
  summaryRow?: 'none' | 'sum' | 'avg' | 'count' | 'min' | 'max';
  summaryLabel?: string;
  collapseFn?: CollapseFunction;
  isMetric?: boolean;
}

export interface LensSortActionData {
  columnId: string | undefined;
  direction: LensGridDirection;
}

export interface LensResizeActionData {
  columnId: string;
  width: number | undefined;
}

export interface LensToggleActionData {
  columnId: string;
}

export interface LensPagesizeActionData {
  size: number;
}

export type LensSortAction = LensEditEvent<typeof LENS_EDIT_SORT_ACTION>;
export type LensResizeAction = LensEditEvent<typeof LENS_EDIT_RESIZE_ACTION>;
export type LensToggleAction = LensEditEvent<typeof LENS_TOGGLE_ACTION>;
export type LensPagesizeAction = LensEditEvent<typeof LENS_EDIT_PAGESIZE_ACTION>;

export interface SortingState {
  columnId: string | undefined;
  direction: 'asc' | 'desc' | 'none';
}

export interface PagingState {
  size: number;
  enabled: boolean;
}

export interface DatatableVisualizationState {
  columns: ColumnState[];
  layerId: string;
  layerType: LensLayerType;
  sorting?: SortingState;
  rowHeight?: RowHeightMode;
  headerRowHeight?: RowHeightMode;
  rowHeightLines?: number;
  headerRowHeightLines?: number;
  paging?: PagingState;
  density?: DataGridDensity;
  showRowNumbers?: boolean;
}
