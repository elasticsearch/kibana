/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiDataGridStyle } from '@elastic/eui';
export { DataGridDensity } from '@kbn/discover-session-constants';

export const DEFAULT_CONTROL_COLUMN_WIDTH = 24;

export const SCORE_COLUMN_NAME = '_score';

export const DEFAULT_ROWS_PER_PAGE = 100;
export const MAX_LOADED_GRID_ROWS = 10000;
export const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, DEFAULT_ROWS_PER_PAGE, 250, 500];

export const DEFAULT_PAGINATION_MODE = 'multiPage';
/**
 * Row height might be a value from -1 to 20
 * A value of -1 automatically adjusts the row height to fit the contents.
 * A value from 1 to 20 represents number of lines of Document explorer row to display.
 */
export const ROWS_HEIGHT_OPTIONS = {
  auto: -1,
  single: 1,
  default: 3,
} as const;
export const defaultRowLineHeight = '1.6em';
export const defaultMonacoEditorWidth = 370;
export const defaultTimeColumnWidth = 212;
export const kibanaJSON = 'kibana-json';

export const DATA_GRID_STYLE_COMPACT: EuiDataGridStyle = {
  cellPadding: 's',
  fontSize: 's',
};

export const DATA_GRID_STYLE_NORMAL: EuiDataGridStyle = {
  cellPadding: 'm',
  fontSize: 'm',
};

export const DATA_GRID_STYLE_EXPANDED: EuiDataGridStyle = {
  cellPadding: 'l',
  fontSize: 'l',
};

export const DATA_GRID_STYLE_DEFAULT: EuiDataGridStyle = {
  ...DATA_GRID_STYLE_COMPACT,
  border: 'horizontal',
  stripes: true,
  rowHover: 'highlight',
  header: 'underline',
};

export const toolbarVisibility = {
  showColumnSelector: {
    allowHide: false,
    allowReorder: true,
  },
};

// EUI does not expose react-window's outerRef, so query its wrapper directly.
export const VIRTUALIZED_SELECTOR = '.euiDataGrid__virtualized';
