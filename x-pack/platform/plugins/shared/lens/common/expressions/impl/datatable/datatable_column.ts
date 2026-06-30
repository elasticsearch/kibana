/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Direction } from '@elastic/eui';
import type { PaletteOutput, CustomPaletteParams, ColorMapping } from '@kbn/coloring';
import type { CustomPaletteState } from '@kbn/charts-plugin/common';
import type { ExpressionFunctionDefinition, DatatableColumn } from '@kbn/expressions-plugin/common';
import type {
  SortingHint,
  ColumnCellDecorationMode,
  CellDecorationFillConfig,
} from '@kbn/lens-common';
import type { CollapseFunction } from '../../defs/collapse';

const LENS_DATATABLE_COLUMN = 'lens_datatable_column';

export type LensGridDirection = 'none' | Direction;

export interface DatatableColumnConfig {
  columns: DatatableColumnResult[];
  sortingColumnId: string | undefined;
  sortingDirection: LensGridDirection;
}

export type DatatableColumnArgs = Omit<ColumnState, 'palette' | 'colorMapping' | 'fillStyle'> & {
  palette?: PaletteOutput<CustomPaletteState>;
  colorMapping?: string;
  /** JSON-serialized {@link CellDecorationFillConfig}, mirroring how `colorMapping` is passed. */
  fillStyle?: string;
  summaryRowValue?: unknown;
  sortingHint?: SortingHint;
};

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
  palette?: PaletteOutput<CustomPaletteParams>;
  colorMapping?: ColorMapping.Config;
  colorMode?: ColumnCellDecorationMode;
  fillStyle?: CellDecorationFillConfig;
  summaryRow?: 'none' | 'sum' | 'avg' | 'count' | 'min' | 'max';
  summaryLabel?: string;
  collapseFn?: CollapseFunction;
  isMetric?: boolean;
}

export type DatatableColumnResult = DatatableColumnArgs & {
  type: typeof LENS_DATATABLE_COLUMN;
};

export type DatatableColumnFn = ExpressionFunctionDefinition<
  typeof LENS_DATATABLE_COLUMN,
  null,
  DatatableColumnArgs,
  DatatableColumnResult
>;

export const datatableColumn: DatatableColumnFn = {
  name: LENS_DATATABLE_COLUMN,
  aliases: [],
  type: LENS_DATATABLE_COLUMN,
  help: '',
  inputTypes: ['null'],
  args: {
    columnId: { types: ['string'], help: '' },
    alignment: { types: ['string'], help: '' },
    sortingHint: { types: ['string'], help: '' },
    hidden: { types: ['boolean'], help: '' },
    oneClickFilter: { types: ['boolean'], help: '' },
    width: { types: ['number'], help: '' },
    isTransposed: { types: ['boolean'], help: '' },
    transposable: { types: ['boolean'], help: '' },
    colorMode: { types: ['string'], help: '' },
    palette: {
      types: ['palette'],
      help: '',
    },
    colorMapping: {
      types: ['string'],
      help: '',
    },
    fillStyle: {
      types: ['string'],
      help: '',
    },
    summaryRow: { types: ['string'], help: '' },
    summaryLabel: { types: ['string'], help: '' },
  },
  fn: function fn(input, args) {
    return {
      type: LENS_DATATABLE_COLUMN,
      ...args,
    };
  },
};
