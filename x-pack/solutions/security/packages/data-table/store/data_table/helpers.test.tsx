/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tableDefaults } from './defaults';
import {
  setInitializeDataTableSettings,
  updateDataTableColumnOrder,
  updateDataTableColumnWidth,
  updateTableAdditionalFilters,
} from './helpers';
import { mockGlobalState } from '../../mock/global_state';
import type { SortColumnTable } from '../../common/types';
import { TableId } from '../../common/types';
import type { DataTableModelSettings } from './model';
import type { TableById } from './types';

const id = 'foo';
const defaultTableById = {
  ...mockGlobalState.dataTable.tableById,
} as unknown as TableById;

describe('setInitializeDataTableSettings', () => {
  test('it returns the expected sort when dataTableSettingsProps has an override', () => {
    const sort: SortColumnTable[] = [
      { columnId: 'foozle', columnType: 'date', esTypes: ['date'], sortDirection: 'asc' },
    ];

    const dataTableSettingsProps: Partial<DataTableModelSettings> = {
      sort, // <-- override
    };

    expect(
      setInitializeDataTableSettings({ id, tableById: defaultTableById, dataTableSettingsProps })[
        id
      ].sort
    ).toEqual(sort);
  });

  test('it returns the default sort when dataTableSettingsProps does NOT contain an override', () => {
    const dataTableSettingsProps = {}; // <-- no `sort` override

    expect(
      setInitializeDataTableSettings({ id, tableById: defaultTableById, dataTableSettingsProps })[
        id
      ].sort
    ).toEqual(tableDefaults.sort);
  });

  test('it doesn`t overwrite the timeline if it is initialized', () => {
    const dataTableSettingsProps = { title: 'testTitle' };

    const tableById = {
      [id]: {
        ...defaultTableById[TableId.test],
        initialized: true,
      },
    };

    const result = setInitializeDataTableSettings({
      id,
      tableById: { ...defaultTableById, ...tableById },
      dataTableSettingsProps,
    });
    expect(result[id]).toBe(tableById[id]);
  });
});

describe('updateDataTableColumnOrder', () => {
  test('it returns the columns in the new expected order', () => {
    const originalIdOrder = defaultTableById[TableId.test].columns.map((x) => x.id); // ['@timestamp', 'event.severity', 'event.category', '...']

    // the new order swaps the positions of the first and second columns:
    const newIdOrder = [originalIdOrder[1], originalIdOrder[0], ...originalIdOrder.slice(2)]; // ['event.severity', '@timestamp', 'event.category', '...']

    expect(
      updateDataTableColumnOrder({
        columnIds: newIdOrder,
        id: TableId.test,
        tableById: defaultTableById,
      })
    ).toEqual({
      ...defaultTableById,
      [TableId.test]: {
        ...defaultTableById[TableId.test],
        columns: [
          defaultTableById[TableId.test].columns[1], // event.severity
          defaultTableById[TableId.test].columns[0], // @timestamp
          ...defaultTableById[TableId.test].columns.slice(2), // all remaining columns
        ],
      },
    });
  });

  test('it omits unknown column IDs when re-ordering columns', () => {
    const originalIdOrder = defaultTableById[TableId.test].columns.map((x) => x.id); // ['@timestamp', 'event.severity', 'event.category', '...']
    const unknownColumId = 'does.not.exist';
    const newIdOrder = [originalIdOrder[0], unknownColumId, ...originalIdOrder.slice(1)]; // ['@timestamp', 'does.not.exist', 'event.severity', 'event.category', '...']

    expect(
      updateDataTableColumnOrder({
        columnIds: newIdOrder,
        id: TableId.test,
        tableById: defaultTableById,
      })
    ).toEqual({
      ...defaultTableById,
      [TableId.test]: {
        ...defaultTableById[TableId.test],
      },
    });
  });

  test('it returns an empty collection of columns if none of the new column IDs are found', () => {
    const newIdOrder = ['this.id.does.NOT.exist', 'this.id.also.does.NOT.exist']; // all unknown IDs

    expect(
      updateDataTableColumnOrder({
        columnIds: newIdOrder,
        id: TableId.test,
        tableById: defaultTableById,
      })
    ).toEqual({
      ...defaultTableById,
      [TableId.test]: {
        ...defaultTableById[TableId.test],
        columns: [], // <-- empty, because none of the new column IDs match the old IDs
      },
    });
  });
});

describe('updateDataTableColumnWidth', () => {
  test("it updates (only) the specified column's width", () => {
    const columnId = '@timestamp';
    const width = 1234;

    const expectedUpdatedColumn = {
      ...defaultTableById[TableId.test].columns[0], // @timestamp
      initialWidth: width,
    };

    expect(
      updateDataTableColumnWidth({
        columnId,
        id: TableId.test,
        tableById: defaultTableById,
        width,
      })
    ).toEqual({
      ...defaultTableById,
      [TableId.test]: {
        ...defaultTableById[TableId.test],
        columns: [expectedUpdatedColumn, ...defaultTableById[TableId.test].columns.slice(1)],
      },
    });
  });

  test('it is a noop if the the specified column is unknown', () => {
    const unknownColumId = 'does.not.exist';

    expect(
      updateDataTableColumnWidth({
        columnId: unknownColumId,
        id: TableId.test,
        tableById: defaultTableById,
        width: 90210,
      })
    ).toEqual({
      ...defaultTableById,
      [TableId.test]: {
        ...defaultTableById[TableId.test],
      },
    });
  });
});

describe('updateTableAdditionalFilters', () => {
  const additionalFilters = {
    showBuildingBlockAlerts: false,
    showOnlyThreatIndicatorAlerts: false,
  };

  test('it is a noop when the table id is missing', () => {
    const tableById = {};

    expect(
      updateTableAdditionalFilters({
        id: 'does-not-exist',
        tableById,
        additionalFilters: { showBuildingBlockAlerts: true },
      })
    ).toBe(tableById);
  });

  test('it updates showBuildingBlockAlerts on an existing table', () => {
    const tableById = {
      [TableId.test]: {
        ...defaultTableById[TableId.test],
        additionalFilters,
      },
    };

    expect(
      updateTableAdditionalFilters({
        id: TableId.test,
        tableById,
        additionalFilters: { showBuildingBlockAlerts: true },
      })
    ).toEqual({
      [TableId.test]: {
        ...tableById[TableId.test],
        additionalFilters: {
          ...additionalFilters,
          showBuildingBlockAlerts: true,
        },
      },
    });
  });

  test('it updates showOnlyThreatIndicatorAlerts on an existing table', () => {
    const tableById = {
      [TableId.test]: {
        ...defaultTableById[TableId.test],
        additionalFilters,
      },
    };

    expect(
      updateTableAdditionalFilters({
        id: TableId.test,
        tableById,
        additionalFilters: { showOnlyThreatIndicatorAlerts: true },
      })
    ).toEqual({
      [TableId.test]: {
        ...tableById[TableId.test],
        additionalFilters: {
          ...additionalFilters,
          showOnlyThreatIndicatorAlerts: true,
        },
      },
    });
  });
});
