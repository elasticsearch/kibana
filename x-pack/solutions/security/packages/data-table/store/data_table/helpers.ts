/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { omit, union } from 'lodash/fp';

import { isEmpty } from 'lodash';
import type { EuiDataGridColumn } from '@elastic/eui';
import type { ColumnHeaderOptions, SortColumnTable } from '../../common/types';
import type { DataTablePersistInput, TableById } from './types';
import type { DataTableModel, DataTableModelSettings } from './model';

import { getDataTableManageDefaults, tableDefaults } from './defaults';
import { DEFAULT_TABLE_COLUMN_MIN_WIDTH } from '../../components/data_table/constants';

export type Maybe<T> = T | null;

/** The minimum width of a resized column */
export const RESIZED_COLUMN_MIN_WITH = 70; // px

interface AddTableColumnParams {
  column: ColumnHeaderOptions;
  id: string;
  index: number;
  tableById: TableById;
}

interface TableNonEcsData {
  field: string;
  value?: Maybe<string[]>;
}

interface CreateDataTableParams extends DataTablePersistInput {
  tableById: TableById;
}

/** Adds a new `Table` to the provided collection of `TableById` */
export const createInitDataTable = ({
  id,
  tableById,
  ...dataTableProps
}: CreateDataTableParams): TableById => {
  const dataTable = tableById[id];
  return {
    ...tableById,
    [id]: {
      ...dataTable,
      ...tableDefaults,
      ...dataTableProps,
      isLoading: false,
    },
  };
};

/**
 * Adds or updates a column. When updating a column, it will be moved to the
 * new index
 */
export const upsertTableColumn = ({
  column,
  id,
  index,
  tableById,
}: AddTableColumnParams): TableById => {
  const dataTable = tableById[id];
  const alreadyExistsAtIndex = dataTable.columns.findIndex((c) => c.id === column.id);

  if (alreadyExistsAtIndex !== -1) {
    // remove the existing entry and add the new one at the specified index
    const reordered = dataTable.columns.filter((c) => c.id !== column.id);
    reordered.splice(index, 0, column); // ⚠️ mutation

    return {
      ...tableById,
      [id]: {
        ...dataTable,
        columns: reordered,
      },
    };
  }

  // add the new entry at the specified index
  const columns = [...dataTable.columns];
  columns.splice(index, 0, column); // ⚠️ mutation

  return {
    ...tableById,
    [id]: {
      ...dataTable,
      columns,
    },
  };
};

interface RemoveTableColumnParams {
  id: string;
  columnId: string;
  tableById: TableById;
}

export const removeTableColumn = ({
  id,
  columnId,
  tableById,
}: RemoveTableColumnParams): TableById => {
  const dataTable = tableById[id];

  const columns = dataTable.columns.filter((c) => c.id !== columnId);

  return {
    ...tableById,
    [id]: {
      ...dataTable,
      columns,
    },
  };
};

interface InitializeDataTableParams {
  id: string;
  tableById: TableById;
  dataTableSettingsProps: Partial<DataTableModelSettings>;
}

export const setInitializeDataTableSettings = ({
  id,
  tableById,
  dataTableSettingsProps,
}: InitializeDataTableParams): TableById => {
  const dataTable = tableById[id];
  return !dataTable?.initialized
    ? {
        ...tableById,
        [id]: {
          ...tableDefaults,
          ...getDataTableManageDefaults(id),
          ...dataTable,
          ...dataTableSettingsProps,
          ...(!dataTable ||
          (isEmpty(dataTable.columns) && !isEmpty(dataTableSettingsProps.defaultColumns))
            ? { columns: dataTableSettingsProps.defaultColumns }
            : {}),
          sort: dataTableSettingsProps.sort ?? tableDefaults.sort,
          loadingEventIds: tableDefaults.loadingEventIds,
          initialized: true,
        },
      }
    : tableById;
};

interface ApplyDeltaToTableColumnWidth {
  id: string;
  columnId: string;
  delta: number;
  tableById: TableById;
}

export const applyDeltaToTableColumnWidth = ({
  id,
  columnId,
  delta,
  tableById,
}: ApplyDeltaToTableColumnWidth): TableById => {
  const dataTable = tableById[id];

  const columnIndex = dataTable.columns.findIndex((c) => c.id === columnId);
  if (columnIndex === -1) {
    // the column was not found
    return {
      ...tableById,
      [id]: {
        ...dataTable,
      },
    };
  }

  const requestedWidth =
    (dataTable.columns[columnIndex].initialWidth ?? DEFAULT_TABLE_COLUMN_MIN_WIDTH) + delta; // raw change in width
  const initialWidth = Math.max(RESIZED_COLUMN_MIN_WITH, requestedWidth); // if the requested width is smaller than the min, use the min

  const columnWithNewWidth = {
    ...dataTable.columns[columnIndex],
    initialWidth,
  };

  const columns = [
    ...dataTable.columns.slice(0, columnIndex),
    columnWithNewWidth,
    ...dataTable.columns.slice(columnIndex + 1),
  ];

  return {
    ...tableById,
    [id]: {
      ...dataTable,
      columns,
    },
  };
};

type Columns = Array<
  Pick<EuiDataGridColumn, 'display' | 'displayAsText' | 'id' | 'initialWidth'> & ColumnHeaderOptions
>;

export const updateDataTableColumnOrder = ({
  columnIds,
  id,
  tableById,
}: {
  columnIds: string[];
  id: string;
  tableById: TableById;
}): TableById => {
  const dataTable = tableById[id];

  const columns = columnIds.reduce<Columns>((acc, cid) => {
    const columnIndex = dataTable.columns.findIndex((c) => c.id === cid);

    return columnIndex !== -1 ? [...acc, dataTable.columns[columnIndex]] : acc;
  }, []);

  return {
    ...tableById,
    [id]: {
      ...dataTable,
      columns,
    },
  };
};

export const updateDataTableColumnWidth = ({
  columnId,
  id,
  tableById,
  width,
}: {
  columnId: string;
  id: string;
  tableById: TableById;
  width: number;
}): TableById => {
  const dataTable = tableById[id];

  const columns = dataTable.columns.map((x) => ({
    ...x,
    initialWidth: x.id === columnId ? width : x.initialWidth,
  }));

  return {
    ...tableById,
    [id]: {
      ...dataTable,
      columns,
    },
  };
};

interface UpdateTableColumnsParams {
  id: string;
  columns: ColumnHeaderOptions[];
  tableById: TableById;
}

export const updateTableColumns = ({
  id,
  columns,
  tableById,
}: UpdateTableColumnsParams): TableById => {
  const dataTable = tableById[id];
  return {
    ...tableById,
    [id]: {
      ...dataTable,
      columns,
    },
  };
};

interface UpdateTableSortParams {
  id: string;
  sort: SortColumnTable[];
  tableById: TableById;
}

export const updateTableSort = ({ id, sort, tableById }: UpdateTableSortParams): TableById => {
  const dataTable = tableById[id];
  return {
    ...tableById,
    [id]: {
      ...dataTable,
      sort,
    },
  };
};

interface UpdateTableItemsPerPageParams {
  id: string;
  itemsPerPage: number;
  tableById: TableById;
}

export const updateTableItemsPerPage = ({
  id,
  itemsPerPage,
  tableById,
}: UpdateTableItemsPerPageParams) => {
  const dataTable = tableById[id];
  return {
    ...tableById,
    [id]: {
      ...dataTable,
      itemsPerPage,
    },
  };
};

interface UpdateTablePerPageOptionsParams {
  id: string;
  itemsPerPageOptions: number[];
  tableById: TableById;
}

export const updateTablePerPageOptions = ({
  id,
  itemsPerPageOptions,
  tableById,
}: UpdateTablePerPageOptionsParams) => {
  const dataTable = tableById[id];
  return {
    ...tableById,
    [id]: {
      ...dataTable,
      itemsPerPageOptions,
    },
  };
};

interface SetDeletedTableEventsParams {
  id: string;
  eventIds: string[];
  isDeleted: boolean;
  tableById: TableById;
}

export const setDeletedTableEvents = ({
  id,
  eventIds,
  isDeleted,
  tableById,
}: SetDeletedTableEventsParams): TableById => {
  const dataTable = tableById[id];

  const deletedEventIds = isDeleted
    ? union(dataTable.deletedEventIds, eventIds)
    : dataTable.deletedEventIds.filter((currentEventId) => !eventIds.includes(currentEventId));

  const selectedEventIds = Object.fromEntries(
    Object.entries(dataTable.selectedEventIds).filter(
      ([selectedEventId]) => !deletedEventIds.includes(selectedEventId)
    )
  );

  const isSelectAllChecked =
    Object.keys(selectedEventIds).length > 0 ? dataTable.isSelectAllChecked : false;

  return {
    ...tableById,
    [id]: {
      ...dataTable,
      deletedEventIds,
      selectedEventIds,
      isSelectAllChecked,
    },
  };
};

interface SetLoadingTableEventsParams {
  id: string;
  eventIds: string[];
  isLoading: boolean;
  tableById: TableById;
}

export const setLoadingTableEvents = ({
  id,
  eventIds,
  isLoading,
  tableById,
}: SetLoadingTableEventsParams): TableById => {
  const dataTable = tableById[id];

  const loadingEventIds = isLoading
    ? union(dataTable.loadingEventIds, eventIds)
    : dataTable.loadingEventIds.filter((currentEventId) => !eventIds.includes(currentEventId));

  return {
    ...tableById,
    [id]: {
      ...dataTable,
      loadingEventIds,
    },
  };
};

interface SetSelectedTableEventsParams {
  id: string;
  eventIds: Record<string, TableNonEcsData[]>;
  isSelectAllChecked: boolean;
  isSelected: boolean;
  tableById: TableById;
}

export const setSelectedTableEvents = ({
  id,
  eventIds,
  isSelectAllChecked = false,
  isSelected,
  tableById,
}: SetSelectedTableEventsParams): TableById => {
  const dataTable = tableById[id];

  const selectedEventIds = isSelected
    ? { ...dataTable.selectedEventIds, ...eventIds }
    : omit(Object.keys(eventIds), dataTable.selectedEventIds);
  return {
    ...tableById,
    [id]: {
      ...dataTable,
      selectedEventIds,
      isSelectAllChecked,
    },
  };
};

interface UpdateTableAdditionalFiltersParams {
  id: string;
  tableById: TableById;
  additionalFilters: Partial<DataTableModel['additionalFilters']>;
}

/** Merges alert-page filter flags, or returns `tableById` unchanged when the table is missing. */
export const updateTableAdditionalFilters = ({
  id,
  tableById,
  additionalFilters,
}: UpdateTableAdditionalFiltersParams): TableById => {
  const dataTable = tableById[id];
  if (dataTable == null) {
    return tableById;
  }

  return {
    ...tableById,
    [id]: {
      ...dataTable,
      additionalFilters: {
        ...dataTable.additionalFilters,
        ...additionalFilters,
      },
    },
  };
};
