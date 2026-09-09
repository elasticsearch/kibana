/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiBasicTableColumn, EuiDataGridColumn } from '@elastic/eui';
import { useDataGridColumnSelector } from '@elastic/eui';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { usePersistedColumnIds } from './use_persisted_column_ids';

export interface ColumnSelectorItem {
  id: string;
  name: string;
}

export type SelectableTableColumn<T extends object> = EuiBasicTableColumn<T> & {
  id?: string;
  selectorName?: string;
};

export const MANAGEMENT_TABLE_COLUMNS_STORAGE_KEY = 'synthetics.management.monitorList.columns.v1.';
export const OVERVIEW_TABLE_COLUMNS_STORAGE_KEY = 'synthetics.overview.compactTable.columns.v1.';

function selectorItemsKey(columns: ColumnSelectorItem[]): string {
  return columns.map((col) => `${col.id}\0${col.name}`).join('\n');
}

function parseSelectorItems(key: string): ColumnSelectorItem[] {
  if (!key) {
    return [];
  }
  return key.split('\n').map((row) => {
    const sep = row.indexOf('\0');
    return {
      id: sep === -1 ? row : row.slice(0, sep),
      name: sep === -1 ? row : row.slice(sep + 1),
    };
  });
}

export function useColumnSelectorButton({
  columns,
  defaultVisibleColumnIds,
  storageKeyPrefix,
}: {
  columns: ColumnSelectorItem[];
  defaultVisibleColumnIds: string[];
  storageKeyPrefix: string;
}): ReactNode {
  const { ColumnSelector } = useColumnSelectorState({
    columns,
    defaultVisibleColumnIds,
    storageKeyPrefix,
  });
  return ColumnSelector;
}

export function useTableColumnSelector<T extends object>({
  columns,
  defaultVisibleColumnIds,
  storageKeyPrefix,
}: {
  columns: Array<SelectableTableColumn<T>>;
  defaultVisibleColumnIds: string[];
  storageKeyPrefix: string;
}): {
  columns: Array<EuiBasicTableColumn<T>>;
  ColumnSelector: ReactNode;
} {
  // Parent table hooks often return a new `columns` array each render. Derive a
  // content key so the EUI column-selector hook does not see a new
  // `availableColumns` identity and infinite-loop via `useDependentState`.
  const itemsKey = columns
    .flatMap((col) => {
      if (col.id == null) {
        return [];
      }
      const name = col.selectorName ?? (typeof col.name === 'string' ? col.name : col.id);
      return [`${col.id}\0${name}`];
    })
    .join('\n');
  const selectorItems = useMemo(() => parseSelectorItems(itemsKey), [itemsKey]);

  const { resolvedVisibleIds, ColumnSelector } = useColumnSelectorState({
    columns: selectorItems,
    defaultVisibleColumnIds,
    storageKeyPrefix,
  });

  const visibleColumns = useMemo(() => {
    const visibleSet = new Set(resolvedVisibleIds);
    return columns
      .filter((col) => col.id == null || visibleSet.has(col.id))
      .map(({ id: _id, selectorName: _selectorName, ...col }) => col as EuiBasicTableColumn<T>);
  }, [columns, resolvedVisibleIds]);

  return { columns: visibleColumns, ColumnSelector };
}

function useColumnSelectorState({
  columns,
  defaultVisibleColumnIds,
  storageKeyPrefix,
}: {
  columns: ColumnSelectorItem[];
  defaultVisibleColumnIds: string[];
  storageKeyPrefix: string;
}): {
  resolvedVisibleIds: string[];
  ColumnSelector: ReactNode;
} {
  const itemsKey = selectorItemsKey(columns);
  const stableColumns = useMemo(() => parseSelectorItems(itemsKey), [itemsKey]);
  const selectableIds = useMemo(() => new Set(stableColumns.map((col) => col.id)), [stableColumns]);

  const { visibleColumnIds, setVisibleColumnIds } = usePersistedColumnIds(
    storageKeyPrefix,
    defaultVisibleColumnIds
  );

  const resolvedVisibleIds = useMemo(() => {
    const knownVisibleIds = visibleColumnIds.filter((id) => selectableIds.has(id));
    // Stored ids that none match the current table (schema change / stale
    // key) fall back to defaults. An empty saved list is a deliberate
    // "hide every optional column" and must be preserved.
    const storedOnlyUnknownIds = visibleColumnIds.length > 0 && knownVisibleIds.length === 0;
    if (storedOnlyUnknownIds) {
      return defaultVisibleColumnIds.filter((id) => selectableIds.has(id));
    }
    return knownVisibleIds;
  }, [defaultVisibleColumnIds, selectableIds, visibleColumnIds]);

  const gridColumns = useMemo(
    () => stableColumns.map((col) => ({ id: col.id })) as EuiDataGridColumn[],
    [stableColumns]
  );

  const columnVisibility = useMemo(
    () => ({
      visibleColumns: resolvedVisibleIds,
      setVisibleColumns: (ids: string[]) => {
        setVisibleColumnIds(ids.filter((id) => selectableIds.has(id)));
      },
    }),
    [resolvedVisibleIds, selectableIds, setVisibleColumnIds]
  );

  const displayValues = useMemo(
    () =>
      stableColumns.reduce<Record<string, string>>((acc, col) => {
        acc[col.id] = col.name;
        return acc;
      }, {}),
    [stableColumns]
  );

  const [ColumnSelector] = useDataGridColumnSelector(
    gridColumns,
    columnVisibility,
    { allowHide: true, allowReorder: false },
    displayValues
  );

  return { resolvedVisibleIds, ColumnSelector };
}
