/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  ROWS_HEIGHT_OPTIONS,
  type UnifiedDataTableSettings,
  type UnifiedDataTableSettingsColumn,
} from '@kbn/unified-data-table';

export type ExecutionHistoryColumnSettings = Record<string, UnifiedDataTableSettingsColumn>;

export interface ExecutionHistoryTableConfigOptions {
  defaultVisibleColumns: string[];
  defaultColumnSettings?: ExecutionHistoryColumnSettings;
}

/**
 * In-memory display state (visible columns, per-column width, row height) for an execution-history
 * `UnifiedDataTable`.
 *
 * Sorting is intentionally not managed here — the tabs use server-side paging, so a
 * client-side sort over a single loaded page would be misleading.
 */
export const useExecutionHistoryTableConfig = ({
  defaultVisibleColumns,
  defaultColumnSettings = {},
}: ExecutionHistoryTableConfigOptions) => {
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
  const [columnSettings, setColumnSettings] =
    useState<ExecutionHistoryColumnSettings>(defaultColumnSettings);
  const [rowHeight, setRowHeight] = useState<number>(ROWS_HEIGHT_OPTIONS.default);

  const onColumnResize = useCallback(
    ({ columnId, width }: { columnId: string; width: number | undefined }) => {
      setColumnSettings((prev) => ({
        ...prev,
        [columnId]: { ...prev[columnId], width },
      }));
    },
    []
  );

  const settings = useMemo<UnifiedDataTableSettings>(
    () => ({ columns: columnSettings }),
    [columnSettings]
  );

  return {
    visibleColumns,
    setVisibleColumns,
    settings,
    onColumnResize,
    rowHeight,
    setRowHeight,
  };
};
