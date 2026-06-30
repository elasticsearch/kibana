/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DatatableColumnType } from '@kbn/expressions-plugin/common';
import type { DataTableRecord, EsHitRecord } from '@kbn/discover-utils/types';
import type {
  EuiDataGridCellValueElementProps,
  EuiDataGridCustomBodyProps,
  EuiDataGridProps,
} from '@elastic/eui';
import type { EuiDataGridRefProps } from '@elastic/eui';
import type { RestorableStateProviderApi } from '@kbn/restorable-state';
import type { Storage } from '@kbn/kibana-utils-plugin/public';
import type { UnifiedDataTableProps } from './data_table';
import React, { useCallback, useState } from 'react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { buildDataTableRecord, getDocId } from '@kbn/discover-utils';
import {
  buildDataViewMock,
  deepMockedFields,
  esHitsMock,
  generateEsHits,
} from '@kbn/discover-utils/src/__mocks__';
import {
  BUTTON_NEXT_TEST_SUBJ,
  BUTTON_TEST_SUBJ,
  COUNTER_TEST_SUBJ,
  HIGHLIGHT_CLASS_NAME,
  INPUT_TEST_SUBJ,
} from '@kbn/data-grid-in-table-search';
import { capabilitiesServiceMock } from '@kbn/core-capabilities-browser-mocks';
import { CELL_CLASS } from '../utils/get_render_cell_value';
import { DataLoadingState, UnifiedDataTable } from './data_table';
import { dataViewsMock } from '../../__mocks__/data_views';
import { defaultTimeColumnWidth } from '../constants';
import { EuiButton, EuiThemeProvider } from '@elastic/eui';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import {
  mockRowAdditionalLeadingControls,
  testLeadingControlColumn,
  testTrailingControlColumns,
} from '../../__mocks__/external_control_columns';
import { render, screen, waitFor } from '@testing-library/react';
import { servicesMock } from '../../__mocks__/services';
import { useColumns } from '../hooks/use_data_grid_columns';
import { waitForEuiPopoverClose, waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';

const mockUseDataGridColumnsCellActions = jest.fn((_prop: unknown) => []);

jest.mock('@kbn/cell-actions', () => ({
  ...jest.requireActual('@kbn/cell-actions'),
  useDataGridColumnsCellActions: (prop: unknown) => mockUseDataGridColumnsCellActions(prop),
}));

const mockEuiDataGrid = jest.fn();

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  const ReactActual = jest.requireActual('react');

  return {
    ...actual,
    EuiDataGrid: ReactActual.forwardRef((props: EuiDataGridProps, ref: React.Ref<unknown>) => {
      mockEuiDataGrid(props);
      return <actual.EuiDataGrid {...props} ref={ref} />;
    }),
  };
});

const EXTENDED_JEST_TIMEOUT = 10000;

const capabilities = capabilitiesServiceMock.createStartContract().capabilities;

const dataViewMock = buildDataViewMock({
  fields: deepMockedFields,
  name: 'the-data-view',
  timeFieldName: '@timestamp',
});

const getProps = (): UnifiedDataTableProps => {
  const services = servicesMock;
  services.dataViewFieldEditor.userPermissions.editIndexPattern = jest.fn().mockReturnValue(true);

  return {
    ariaLabelledBy: '',
    cellActionsMetadata: {
      someKey: 'someValue',
    },
    columns: [],
    dataView: dataViewMock,
    expandedDoc: undefined,
    loadingState: DataLoadingState.loaded,
    onFilter: jest.fn(),
    onResize: jest.fn(),
    onSetColumns: jest.fn(),
    onSort: jest.fn(),
    rows: esHitsMock.map((hit) => buildDataTableRecord(hit, dataViewMock)),
    sampleSizeState: 30,
    searchDescription: '',
    searchTitle: '',
    services: {
      fieldFormats: services.fieldFormats,
      uiSettings: services.uiSettings,
      dataViewFieldEditor: services.dataViewFieldEditor,
      toastNotifications: services.toastNotifications,
      storage: services.storage as unknown as Storage,
      data: services.data,
      theme: services.theme,
    },
    setExpandedDoc: jest.fn(),
    settings: {},
    showTimeCol: true,
    sort: [],
  };
};

const DataTable = (props: Partial<UnifiedDataTableProps>) => (
  <KibanaContextProvider services={servicesMock}>
    <UnifiedDataTable {...getProps()} {...props} />
  </KibanaContextProvider>
);

const DataTableWithI18n = (props: UnifiedDataTableProps) => (
  <IntlProvider locale="en">
    <DataTable {...props} />
  </IntlProvider>
);

const clickSelectedDocumentsMenuAction = async (testSubj: string) => {
  await userEvent.click(screen.getByTestId(testSubj), {
    pointerEventsCheck: PointerEventsCheckLevel.Never,
  });
  await waitForEuiPopoverClose();
};

const getDisplayedDocNr = () => {
  const gridSelectionBtn = screen.queryByTestId('discoverDocTable');

  if (!gridSelectionBtn) return 0;

  const selectedNr = gridSelectionBtn.getAttribute('data-document-number');

  return Number(selectedNr);
};

const getLastEuiDataGridProps = () => mockEuiDataGrid.mock.calls.at(-1)?.[0] as EuiDataGridProps;

const getSelectedDocNr = () => {
  const gridSelectionBtn = screen.queryByTestId('unifiedDataTableSelectionBtn');

  if (!gridSelectionBtn) return 0;

  const selectedNr = gridSelectionBtn.getAttribute('data-selected-documents');

  return Number(selectedNr);
};

const openSelectedDocumentsMenu = async () => {
  await userEvent.click(screen.getByTestId('unifiedDataTableSelectionBtn'));
  await waitForEuiPopoverOpen();
};

const renderComponent = async (props: UnifiedDataTableProps = getProps()) => {
  const renderResult = render(<DataTableWithI18n {...props} />);
  await waitForDataGridRender();
  return renderResult;
};

const renderDataTable = async (props: Partial<UnifiedDataTableProps>) => {
  const DataTableWrapped = () => {
    const [columns, setColumns] = useState(props.columns ?? []);
    const [settings, setSettings] = useState(props.settings);
    const [sort, setSort] = useState(props.sort ?? []);

    const { onSetColumns } = useColumns({
      capabilities,
      columns,
      dataView: dataViewMock,
      dataViews: dataViewsMock,
      setAppState: useCallback((state) => {
        if (state.columns) setColumns(state.columns);
        if (state.settings) setSettings(state.settings);
      }, []),
      settings,
    });

    return (
      <EuiThemeProvider>
        <IntlProvider locale="en">
          <DataTable
            {...props}
            columns={columns}
            onResize={({ columnId, width }) => {
              setSettings({
                ...settings,
                columns: {
                  ...settings?.columns,
                  [columnId]: {
                    width,
                  },
                },
              });
            }}
            onSetColumns={onSetColumns}
            onSort={setSort as UnifiedDataTableProps['onSort']}
            settings={settings}
            sort={sort}
          />
        </IntlProvider>
      </EuiThemeProvider>
    );
  };

  const renderResult = render(<DataTableWrapped />);
  await waitForDataGridRender();

  return renderResult;
};

const toggleDocSelection = async (document: EsHitRecord) => {
  await userEvent.click(screen.getByTestId(`dscGridSelectDoc-${getDocId(document)}`));
};

const waitForDataGridRender = async () => {
  await screen.findByTestId('discoverDocTable');
};

describe('UnifiedDataTable', () => {
  const originalClipboard = global.window.navigator.clipboard;

  beforeAll(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: jest.fn(),
      },
      writable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Document selection', () => {
    it(
      'no documents are selected initially',
      async () => {
        await renderComponent();

        expect(getSelectedDocNr()).toBe(0);
        expect(getDisplayedDocNr()).toBe(5);
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'Allows selection/deselection of multiple documents',
      async () => {
        await renderComponent();

        await toggleDocSelection(esHitsMock[0]);
        expect(getSelectedDocNr()).toBe(1);

        await toggleDocSelection(esHitsMock[1]);
        expect(getSelectedDocNr()).toBe(2);

        await toggleDocSelection(esHitsMock[1]);
        expect(getSelectedDocNr()).toBe(1);
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'deselection of all selected documents',
      async () => {
        await renderComponent();

        await toggleDocSelection(esHitsMock[0]);
        await toggleDocSelection(esHitsMock[1]);
        expect(getSelectedDocNr()).toBe(2);

        await openSelectedDocumentsMenu();
        await clickSelectedDocumentsMenuAction('dscGridClearSelectedDocuments');
        expect(getSelectedDocNr()).toBe(0);
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'showing only selected documents and undo selection',
      async () => {
        await renderComponent();

        await toggleDocSelection(esHitsMock[0]);
        await toggleDocSelection(esHitsMock[1]);
        expect(getSelectedDocNr()).toBe(2);

        await openSelectedDocumentsMenu();
        await clickSelectedDocumentsMenuAction('dscGridShowSelectedDocuments');
        expect(getDisplayedDocNr()).toBe(2);

        await openSelectedDocumentsMenu();
        await clickSelectedDocumentsMenuAction('dscGridShowAllDocuments');
        expect(getDisplayedDocNr()).toBe(5);
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'showing selected documents, underlying data changes, all documents are displayed, selection is gone',
      async () => {
        const { rerender } = await renderComponent();

        await toggleDocSelection(esHitsMock[0]);
        await toggleDocSelection(esHitsMock[1]);
        expect(getSelectedDocNr()).toBe(2);

        await openSelectedDocumentsMenu();
        await clickSelectedDocumentsMenuAction('dscGridShowSelectedDocuments');
        expect(getDisplayedDocNr()).toBe(2);

        rerender(
          <DataTableWithI18n
            {...getProps()}
            rows={[
              {
                _index: 'i',
                _id: '6',
                _score: 1,
                _source: {
                  date: '2020-20-02T12:12:12.128',
                  name: 'test6',
                  extension: 'doc',
                  bytes: 50,
                },
              },
            ].map((row) => buildDataTableRecord(row, dataViewMock))}
          />
        );

        expect(getDisplayedDocNr()).toBe(1);
        expect(getSelectedDocNr()).toBe(0);
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'showing only selected documents and remove filter deselecting each doc manually',
      async () => {
        await renderComponent();

        await toggleDocSelection(esHitsMock[0]);
        await openSelectedDocumentsMenu();
        await clickSelectedDocumentsMenuAction('dscGridShowSelectedDocuments');
        expect(getDisplayedDocNr()).toBe(1);

        await toggleDocSelection(esHitsMock[0]);
        expect(getDisplayedDocNr()).toBe(5);

        await toggleDocSelection(esHitsMock[0]);
        expect(getDisplayedDocNr()).toBe(5);
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'copying selected documents to clipboard as JSON',
      async () => {
        await renderComponent();

        await toggleDocSelection(esHitsMock[0]);
        await openSelectedDocumentsMenu();
        await clickSelectedDocumentsMenuAction('dscGridCopySelectedDocumentsJSON');

        await waitFor(() => {
          expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            '[{"_index":"i","_id":"1","_score":1,"_type":"_doc","_source":{"date":"2020-20-01T12:12:12.123","message":"test1","bytes":20}}]'
          );
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'copying selected documents to clipboard as text',
      async () => {
        await renderComponent();

        await toggleDocSelection(esHitsMock[2]);
        await toggleDocSelection(esHitsMock[1]);
        await openSelectedDocumentsMenu();
        await clickSelectedDocumentsMenuAction('unifiedDataTableCopyRowsAsText');

        await waitFor(() => {
          expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            '"\'@timestamp"\t"_index"\t"_score"\tbytesDisplayName\tdate\textension\tmessage\tname\n-\ti\t1\t-\t"2020-20-01T12:12:12.124"\tjpg\t-\ttest2\n-\ti\t1\t50\t"2020-20-01T12:12:12.124"\tgif\t-\ttest3'
          );
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'copying selected columns to clipboard as text',
      async () => {
        await renderComponent({ ...getProps(), columns: ['date', 'extension', 'name'] });

        await toggleDocSelection(esHitsMock[2]);
        await toggleDocSelection(esHitsMock[1]);
        await openSelectedDocumentsMenu();
        await clickSelectedDocumentsMenuAction('unifiedDataTableCopyRowsAsText');

        await waitFor(() => {
          expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            '"\'@timestamp"\tdate\textension\tname\n-\t"2020-20-01T12:12:12.124"\tjpg\ttest2\n-\t"2020-20-01T12:12:12.124"\tgif\ttest3'
          );
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'copying selected documents to clipboard as markdown',
      async () => {
        await renderComponent();

        await toggleDocSelection(esHitsMock[2]);
        await toggleDocSelection(esHitsMock[1]);
        await openSelectedDocumentsMenu();
        await clickSelectedDocumentsMenuAction('unifiedDataTableCopyRowsAsMarkdown');

        await waitFor(() => {
          expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            `| @timestamp | _index | _score | bytesDisplayName | date | extension | message | name |
| --- | --- | --- | --- | --- | --- | --- | --- |
| - | i | 1 | - | 2020-20-01T12:12:12.124 | jpg | - | test2 |
| - | i | 1 | 50 | 2020-20-01T12:12:12.124 | gif | - | test3 |`
          );
        });
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('edit field button', () => {
    it(
      'should render the edit field button if onFieldEdited is provided',
      async () => {
        await renderDataTable({ columns: ['message'], onFieldEdited: jest.fn() });

        expect(
          screen.queryByTestId('dataGridHeaderCellActionGroup-message')
        ).not.toBeInTheDocument();

        await userEvent.click(screen.getByTestId('dataGridHeaderCellActionButton-message'));

        expect(screen.getByTestId('dataGridHeaderCellActionGroup-message')).toBeVisible();
        expect(screen.getByTestId('gridEditFieldButton')).toBeVisible();
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should not render the edit field button if onFieldEdited is not provided',
      async () => {
        await renderDataTable({ columns: ['message'] });

        expect(
          screen.queryByTestId('dataGridHeaderCellActionGroup-message')
        ).not.toBeInTheDocument();

        await userEvent.click(screen.getByTestId('dataGridHeaderCellActionButton-message'));

        expect(screen.getByTestId('dataGridHeaderCellActionGroup-message')).toBeVisible();
        expect(screen.queryByTestId('gridEditFieldButton')).not.toBeInTheDocument();
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('cellActionsTriggerId', () => {
    it(
      'should call useDataGridColumnsCellActions with empty params when no cellActionsTriggerId is provided',
      async () => {
        await renderComponent({
          ...getProps(),
          columns: ['message'],
          onFieldEdited: jest.fn(),
        });

        expect(mockUseDataGridColumnsCellActions).toHaveBeenCalledWith({
          dataGridRef: expect.any(Object),
          disableCellActions: false,
          fields: undefined,
          getCellValue: expect.any(Function),
          metadata: {
            dataViewId: 'the-data-view-id',
            someKey: 'someValue',
          },
          triggerId: undefined,
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should call useDataGridColumnsCellActions properly when cellActionsTriggerId defined',
      async () => {
        await renderComponent({
          ...getProps(),
          cellActionsTriggerId: 'test',
          columns: ['message'],
          onFieldEdited: jest.fn(),
        });

        expect(mockUseDataGridColumnsCellActions).toHaveBeenCalledWith({
          dataGridRef: expect.any(Object),
          disableCellActions: false,
          fields: [
            dataViewMock.getFieldByName('@timestamp')?.toSpec(),
            dataViewMock.getFieldByName('message')?.toSpec(),
          ],
          getCellValue: expect.any(Function),
          metadata: {
            dataViewId: 'the-data-view-id',
            someKey: 'someValue',
          },
          triggerId: 'test',
        });
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('sorting', () => {
    const getColumnActions = (name: string) =>
      screen.getByTestId(`dataGridHeaderCellActionButton-${name}`);

    const getCellValuesByColumn = () => {
      const columns = screen
        .getAllByTestId(/^dataGridHeaderCell-/)
        .map((header) => header.dataset.gridcellColumnId!)
        .filter(Boolean);

      const values = screen
        .getAllByTestId('dataGridRowCell')
        .map((cell) => cell.querySelector('.unifiedDataTable__cellValue')?.textContent ?? '');

      return values.reduce<Record<string, string[]>>((acc, value, i) => {
        const column = columns[i % columns.length];

        acc[column] = acc[column] ?? [];
        acc[column].push(value);

        return acc;
      }, {});
    };

    const sortByColumn = async (name: string) => {
      await userEvent.click(getColumnActions(name));
      await waitForEuiPopoverOpen();
      await userEvent.click(screen.getByTitle(/Sort\s+Z-A/im).closest('button')!);
    };

    const copySelectedDocsAsText = async () => {
      await waitFor(() => {
        expect(
          screen.queryByTestId('dataGridHeaderCellActionGroup-message')
        ).not.toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId('unifiedDataTableSelectionBtn'));
      await waitForEuiPopoverOpen();
      await userEvent.click(screen.getByTestId('unifiedDataTableCopyRowsAsText'), {
        pointerEventsCheck: PointerEventsCheckLevel.Never,
      });
      await waitForEuiPopoverClose();

      return (navigator.clipboard.writeText as jest.Mock).mock.calls.at(-1)![0] as string;
    };

    it(
      'should apply client side sorting in ES|QL mode',
      async () => {
        await renderDataTable({
          columns: ['message'],
          isPlainRecord: true,
          rows: generateEsHits(dataViewMock, 10).map((hit) =>
            buildDataTableRecord(hit, dataViewMock)
          ),
        });

        let values = getCellValuesByColumn();

        expect(values.message).toEqual([
          'message_0',
          'message_1',
          'message_2',
          'message_3',
          'message_4',
          'message_5',
          'message_6',
          'message_7',
          'message_8',
          'message_9',
        ]);

        await sortByColumn('message');

        await waitFor(() => {
          values = getCellValuesByColumn();

          expect(values.message).toEqual([
            'message_9',
            'message_8',
            'message_7',
            'message_6',
            'message_5',
            'message_4',
            'message_3',
            'message_2',
            'message_1',
            'message_0',
          ]);
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should not apply client side sorting in ES|QL mode when isInMemorySortEnabled is false',
      async () => {
        await renderDataTable({
          columns: ['message'],
          isPlainRecord: true,
          isInMemorySortEnabled: false,
          rows: generateEsHits(dataViewMock, 10).map((hit) =>
            buildDataTableRecord(hit, dataViewMock)
          ),
        });

        let values = getCellValuesByColumn();

        const initialOrder = [
          'message_0',
          'message_1',
          'message_2',
          'message_3',
          'message_4',
          'message_5',
          'message_6',
          'message_7',
          'message_8',
          'message_9',
        ];

        expect(values.message).toEqual(initialOrder);

        await sortByColumn('message');

        // Rows keep their original (server) order; the table does not re-sort them in memory.
        await waitFor(() => {
          values = getCellValuesByColumn();

          expect(values.message).toEqual(initialOrder);
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should not apply client side sorting if not in ES|QL mode',
      async () => {
        await renderDataTable({
          columns: ['message'],
          rows: generateEsHits(dataViewMock, 10).map((hit) =>
            buildDataTableRecord(hit, dataViewMock)
          ),
        });

        let values = getCellValuesByColumn();

        expect(values.message).toEqual([
          'message_0',
          'message_1',
          'message_2',
          'message_3',
          'message_4',
          'message_5',
          'message_6',
          'message_7',
          'message_8',
          'message_9',
        ]);

        await sortByColumn('message');

        await waitFor(() => {
          values = getCellValuesByColumn();

          expect(values.message).toEqual([
            'message_0',
            'message_1',
            'message_2',
            'message_3',
            'message_4',
            'message_5',
            'message_6',
            'message_7',
            'message_8',
            'message_9',
          ]);
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should apply sorting',
      async () => {
        await renderComponent({
          ...getProps(),
          columns: ['message'],
          sort: [['message', 'desc']],
        });

        expect(getLastEuiDataGridProps().sorting).toEqual({
          onSort: expect.any(Function),
          columns: [{ direction: 'desc', id: 'message' }],
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should not apply unknown sorting',
      async () => {
        await renderComponent({
          ...getProps(),
          columns: ['bytes', 'message'],
          sort: [
            ['bytes', 'desc'],
            ['unknown', 'asc'],
            ['message', 'desc'],
          ],
        });

        expect(getLastEuiDataGridProps().sorting).toEqual({
          columns: [
            { direction: 'desc', id: 'bytes' },
            { direction: 'desc', id: 'message' },
          ],
          onSort: expect.any(Function),
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'sorting should preserve the selected documents when copying them to clipboard',
      async () => {
        const hits = generateEsHits(dataViewMock, 10);

        await renderDataTable({
          columns: ['message'],
          isPlainRecord: true,
          rows: hits.map((hit) => buildDataTableRecord(hit, dataViewMock)),
        });

        await waitFor(() => {
          expect(getCellValuesByColumn().message?.[0]).toBe('message_0');
        });

        await userEvent.click(screen.getByTestId(`dscGridSelectDoc-${getDocId(hits[0])}`));

        const clipboardTextBeforeSorting = await copySelectedDocsAsText();

        await sortByColumn('message');

        await waitFor(() => {
          expect(getCellValuesByColumn().message?.[0]).toBe('message_9');
        });

        const clipboardTextAfterSorting = await copySelectedDocsAsText();

        expect(clipboardTextAfterSorting).toBe(clipboardTextBeforeSorting);
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('display settings', () => {
    it(
      'should set allowRowHeight to true if onUpdateRowHeight is provided',
      async () => {
        await renderComponent({
          ...getProps(),
          onUpdateRowHeight: jest.fn(),
        });

        expect(getLastEuiDataGridProps().toolbarVisibility).toMatchObject({
          additionalControls: null,
          showColumnSelector: false,
          showDisplaySelector: {
            allowDensity: false,
            allowResetButton: false,
            allowRowHeight: true,
            customRender: expect.any(Function),
          },
          showFullScreenSelector: true,
          showKeyboardShortcuts: true,
          showSortSelector: true,
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should set allowRowHeight to false if onUpdateRowHeight is not provided',
      async () => {
        await renderComponent({
          ...getProps(),
          onUpdateRowHeight: undefined,
          onUpdateSampleSize: jest.fn(),
        });

        expect(getLastEuiDataGridProps().toolbarVisibility).toMatchObject({
          additionalControls: null,
          showColumnSelector: false,
          showDisplaySelector: {
            allowDensity: false,
            allowResetButton: false,
            allowRowHeight: false,
            customRender: expect.any(Function),
          },
          showFullScreenSelector: true,
          showKeyboardShortcuts: true,
          showSortSelector: true,
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should set allowDensity to true if onUpdateDataGridDensity is provided',
      async () => {
        await renderComponent({
          ...getProps(),
          onUpdateDataGridDensity: jest.fn(),
          onUpdateRowHeight: jest.fn(),
        });

        expect(getLastEuiDataGridProps().toolbarVisibility).toMatchObject({
          additionalControls: null,
          showColumnSelector: false,
          showDisplaySelector: {
            allowDensity: true,
            allowResetButton: false,
            allowRowHeight: true,
            customRender: expect.any(Function),
          },
          showFullScreenSelector: true,
          showKeyboardShortcuts: true,
          showSortSelector: true,
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should set allowDensity to false if onUpdateDataGridDensity is not provided',
      async () => {
        await renderComponent({
          ...getProps(),
          onUpdateDataGridDensity: undefined,
          onUpdateRowHeight: jest.fn(),
          onUpdateSampleSize: jest.fn(),
        });

        expect(getLastEuiDataGridProps().toolbarVisibility).toMatchObject({
          additionalControls: null,
          showColumnSelector: false,
          showDisplaySelector: {
            allowDensity: false,
            allowResetButton: false,
            allowRowHeight: true,
            customRender: expect.any(Function),
          },
          showFullScreenSelector: true,
          showKeyboardShortcuts: true,
          showSortSelector: true,
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should hide display settings if no handlers provided',
      async () => {
        await renderComponent({
          ...getProps(),
          onUpdateRowHeight: undefined,
          onUpdateSampleSize: undefined,
        });

        expect(getLastEuiDataGridProps().toolbarVisibility).toMatchObject({
          additionalControls: null,
          showColumnSelector: false,
          showDisplaySelector: undefined,
          showFullScreenSelector: true,
          showKeyboardShortcuts: true,
          showSortSelector: true,
        });
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('custom control columns', () => {
    it(
      'should be able to customise the leading controls',
      async () => {
        await renderComponent({
          ...getProps(),
          expandedDoc: {
            id: 'test',
            raw: {
              _index: 'test_i',
              _id: 'test',
            },
            flattened: { test: jest.fn() },
          },
          externalControlColumns: [testLeadingControlColumn],
          renderDocumentView: jest.fn(),
          rowAdditionalLeadingControls: mockRowAdditionalLeadingControls,
          setExpandedDoc: jest.fn(),
        });

        expect(screen.getAllByTestId('test-body-control-column-cell')[0]).toBeVisible();
        expect(screen.getAllByTestId('exampleRowControl-chartBarVerticalStack')[0]).toBeVisible();

        // The other actions are within the popover
        await userEvent.click(
          screen.getAllByTestId('unifiedDataTable_additionalRowControl_actionsMenu')[0]
        );
        await waitForEuiPopoverOpen();
        expect(screen.getByTestId('exampleRowControl-heart')).toBeVisible();
        expect(screen.getByTestId('exampleRowControl-inspect')).toBeVisible();
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should be able to customise the trailing controls',
      async () => {
        await renderComponent({
          ...getProps(),
          expandedDoc: {
            id: 'test',
            flattened: { test: jest.fn() },
            raw: {
              _index: 'test_i',
              _id: 'test',
            },
          },
          externalControlColumns: [testLeadingControlColumn],
          renderDocumentView: jest.fn(),
          setExpandedDoc: jest.fn(),
          trailingControlColumns: testTrailingControlColumns,
        });

        expect(screen.getAllByTestId('test-body-control-column-cell')[0]).toBeVisible();
        expect(screen.getAllByTestId('test-trailing-column-popover-button')[0]).toBeVisible();
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('externalControlColumns', () => {
    it(
      'should render external leading control columns',
      async () => {
        await renderComponent({
          ...getProps(),
          expandedDoc: {
            id: 'test',
            flattened: { test: jest.fn() },
            raw: {
              _index: 'test_i',
              _id: 'test',
            },
          },
          externalControlColumns: [testLeadingControlColumn],
          renderDocumentView: jest.fn(),
          setExpandedDoc: jest.fn(),
        });

        expect(screen.getAllByTestId('docTableExpandToggleColumn')[0]).toBeVisible();
        expect(screen.getAllByTestId('test-body-control-column-cell')[0]).toBeVisible();
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  it(
    'should render provided in renderDocumentView DocumentView on expand clicked',
    async () => {
      const expandedDoc = {
        id: 'test',
        flattened: { test: jest.fn() },
        raw: {
          _index: 'test_i',
          _id: 'test',
        },
      };

      const columnsMetaOverride = { testField: { type: 'number' as DatatableColumnType } };

      const renderDocumentViewMock = jest.fn((hit: DataTableRecord) => (
        <div data-test-subj="test-document-view">{hit.id}</div>
      ));

      const setExpandedDocMock = jest.fn();

      await renderComponent({
        ...getProps(),
        columnsMeta: columnsMetaOverride,
        expandedDoc,
        externalControlColumns: [testLeadingControlColumn],
        renderDocumentView: renderDocumentViewMock,
        setExpandedDoc: setExpandedDocMock,
      });

      await userEvent.click(screen.getAllByTestId('docTableExpandToggleColumn')[0]);

      expect(screen.getByTestId('test-document-view')).toBeVisible();
      expect(renderDocumentViewMock).toHaveBeenLastCalledWith(
        expandedDoc,
        getProps().rows,
        ['_source'],
        columnsMetaOverride
      );
    },
    EXTENDED_JEST_TIMEOUT
  );

  it(
    'should provide, clear, and re-provide document view metadata when rendered externally',
    async () => {
      const rows = esHitsMock.map((hit) => buildDataTableRecord(hit, dataViewMock));
      const [expandedDoc] = rows;
      const setRenderDocumentViewMeta = jest.fn();

      const props = {
        ...getProps(),
        expandedDoc,
        renderDocumentView: 'external',
        rows,
        setExpandedDoc: jest.fn(),
        setRenderDocumentViewMeta,
      } satisfies UnifiedDataTableProps;

      const { rerender } = await renderComponent(props);

      await waitFor(() => {
        expect(setRenderDocumentViewMeta).toHaveBeenLastCalledWith({
          displayedColumns: ['_source'],
          displayedRows: rows,
        });
      });

      setRenderDocumentViewMeta.mockClear();

      rerender(<DataTableWithI18n {...props} expandedDoc={undefined} />);

      await waitFor(() => {
        expect(setRenderDocumentViewMeta).toHaveBeenLastCalledWith(undefined);
      });

      setRenderDocumentViewMeta.mockClear();

      rerender(<DataTableWithI18n {...props} expandedDoc={expandedDoc} />);

      await waitFor(() => {
        expect(setRenderDocumentViewMeta).toHaveBeenLastCalledWith({
          displayedColumns: ['_source'],
          displayedRows: rows,
        });
      });
    },
    EXTENDED_JEST_TIMEOUT
  );

  describe('externalAdditionalControls', () => {
    it(
      'should render external additional toolbar controls',
      async () => {
        await renderComponent({
          ...getProps(),
          columns: ['message'],
          externalAdditionalControls: <EuiButton data-test-subj="test-additional-control" />,
        });

        expect(screen.getByTestId('test-additional-control')).toBeVisible();
        expect(screen.getByTestId('dataGridColumnSelectorButton')).toBeVisible();
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('externalCustomRenderers', () => {
    it(
      'should render only host column with the custom renderer, message should be rendered with the default cell renderer',
      async () => {
        await renderComponent({
          ...getProps(),
          columns: ['message', 'host'],
          externalCustomRenderers: {
            host: (props: EuiDataGridCellValueElementProps) => (
              <div data-test-subj={`test-renderer-${props.columnId}`}>{props.columnId}</div>
            ),
          },
        });

        expect(screen.getAllByTestId('test-renderer-host')[0]).toBeVisible();
        expect(screen.queryByTestId('test-renderer-message')).not.toBeInTheDocument();
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('renderCustomGridBody', () => {
    it(
      'should render custom grid body for each row',
      async () => {
        await renderComponent({
          ...getProps(),
          columns: ['message', 'host'],
          trailingControlColumns: [
            {
              id: 'row-details',

              // The header cell should be visually hidden, but available to screen readers
              width: 0,
              headerCellRender: () => <></>,
              headerCellProps: { className: 'euiScreenReaderOnly' },

              // The footer cell can be hidden to both visual & SR users, as it does not contain meaningful information
              footerCellProps: { style: { display: 'none' } },

              // When rendering this custom cell, we'll want to override
              // the automatic width/heights calculated by EuiDataGrid
              rowCellRender: jest.fn(),
            },
          ],
          renderCustomGridBody: (props: EuiDataGridCustomBodyProps) => (
            <div data-test-subj="test-renderer-custom-grid-body">
              <EuiButton />
            </div>
          ),
        });

        expect(screen.getByTestId('test-renderer-custom-grid-body')).toBeVisible();
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('componentsTourSteps', () => {
    it(
      'should render tour step for the first row of leading control column expandButton',
      async () => {
        await renderComponent({
          ...getProps(),
          componentsTourSteps: { expandButton: 'test-expand' },
          expandedDoc: {
            id: 'test',
            flattened: { test: jest.fn() },
            raw: {
              _index: 'test_i',
              _id: 'test',
            },
          },
          renderDocumentView: jest.fn(),
          setExpandedDoc: jest.fn(),
        });

        expect(screen.getAllByTestId('docTableExpandToggleColumn')[0]).toHaveAttribute(
          'id',
          'test-expand'
        );
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('renderCustomToolbar', () => {
    it(
      'should render a custom toolbar',
      async () => {
        let toolbarParams: Record<string, unknown> = {};
        let gridParams: Record<string, unknown> = {};

        const renderCustomToolbarMock = jest.fn((props) => {
          toolbarParams = props.toolbarProps;
          gridParams = props.gridProps;

          return <div data-test-subj="custom-toolbar">Custom layout</div>;
        });

        await renderComponent({
          ...getProps(),
          renderCustomToolbar: renderCustomToolbarMock,
        });

        // custom toolbar should be rendered
        expect(screen.getByTestId('custom-toolbar')).toBeVisible();

        expect(renderCustomToolbarMock).toHaveBeenLastCalledWith(
          expect.objectContaining({
            gridProps: expect.objectContaining({
              additionalControls: null,
            }),
            toolbarProps: expect.objectContaining({
              hasRoomForGridControls: true,
            }),
          })
        );

        // the default eui controls should be available for custom rendering
        expect(toolbarParams?.columnSortingControl).toBeTruthy();
        expect(toolbarParams?.keyboardShortcutsControl).toBeTruthy();
        expect(gridParams?.additionalControls).toBe(null);

        // additional controls become available after selecting a document
        await userEvent.click(screen.getByTestId(`dscGridSelectDoc-${getDocId(esHitsMock[0])}`));

        expect(toolbarParams?.keyboardShortcutsControl).toBeTruthy();
        expect(gridParams?.additionalControls).toBeTruthy();
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('gridStyleOverride', () => {
    it(
      'should render the grid with the default style if no gridStyleOverride is provided',
      async () => {
        await renderComponent({
          ...getProps(),
        });

        const grid = screen.getByTestId('docTable');

        expect(grid).toHaveClass('euiDataGrid--bordersHorizontal');
        expect(grid).toHaveClass('euiDataGrid--fontSizeSmall');
        expect(grid).toHaveClass('euiDataGrid--paddingSmall');
        expect(grid).toHaveClass('euiDataGrid--rowHoverHighlight');
        expect(grid).toHaveClass('euiDataGrid--headerUnderline');
        expect(grid).toHaveClass('euiDataGrid--stripes');
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should render the grid with style override if gridStyleOverride is provided',
      async () => {
        await renderComponent({
          ...getProps(),
          gridStyleOverride: {
            border: 'none',
            rowHover: 'none',
            stripes: false,
          },
        });

        const grid = screen.getByTestId('docTable');

        expect(grid).not.toHaveClass('euiDataGrid--stripes');
        expect(grid).not.toHaveClass('euiDataGrid--rowHoverHighlight');
        expect(grid).toHaveClass('euiDataGrid--bordersNone');
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('rowLineHeightOverride', () => {
    it(
      'should render the grid with the default row line height if no rowLineHeightOverride is provided',
      async () => {
        await renderComponent({
          ...getProps(),
        });

        expect(screen.getAllByTestId('dataGridRowCell')[0]).toHaveStyle({
          lineHeight: '1.6em',
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should render the grid with row line height override if rowLineHeightOverride is provided',
      async () => {
        await renderComponent({
          ...getProps(),
          rowLineHeightOverride: '24px',
        });

        expect(screen.getAllByTestId('dataGridRowCell')[0]).toHaveStyle({
          lineHeight: '24px',
        });
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('document comparison', () => {
    const closeSelectedRowsMenu = async () => {
      await userEvent.click(await screen.findByTestId('unifiedDataTableSelectionBtn'));
      await waitForEuiPopoverClose();
    };

    const getCellValues = () =>
      Array.from(document.querySelectorAll(`.${CELL_CLASS}`)).map(({ textContent }) => textContent);

    const getColumnHeaders = () =>
      screen
        .getAllByTestId(/^dataGridHeaderCell-/)
        .map((header) => header.querySelector('.euiDataGridHeaderCell__content')?.textContent);

    const getCompareDocumentsButton = () =>
      screen.queryByTestId('unifiedDataTableCompareSelectedDocuments');

    const getFieldColumns = () =>
      screen
        .queryAllByTestId('unifiedDataTableComparisonFieldName')
        .map(({ textContent }) => textContent);

    const getFullScreenButton = () => screen.queryByTestId('dataGridFullScreenButton');

    const getSelectedDocumentsButton = () => screen.queryByTestId('unifiedDataTableSelectionBtn');

    const goToComparisonMode = async () => {
      await selectDocument(esHitsMock[0]);
      await selectDocument(esHitsMock[1]);
      await openSelectedRowsMenu();

      await userEvent.click(await screen.findByTestId('unifiedDataTableCompareSelectedDocuments'));
      await waitForEuiPopoverClose();
      await screen.findByText('Comparing 2 documents');
      await screen.findByTestId('unifiedDataTableCompareDocuments');
    };

    const openSelectedRowsMenu = async () => {
      await userEvent.click(await screen.findByTestId('unifiedDataTableSelectionBtn'));
      await waitForEuiPopoverOpen();
      await screen.findAllByText('Clear selection');
    };

    const selectDocument = async (document: EsHitRecord) =>
      await userEvent.click(screen.getByTestId(`dscGridSelectDoc-${getDocId(document)}`));

    it(
      'should not allow comparison if less than 2 documents are selected',
      async () => {
        await renderDataTable({ enableComparisonMode: true });

        expect(getSelectedDocumentsButton()).not.toBeInTheDocument();

        await selectDocument(esHitsMock[0]);
        expect(getSelectedDocumentsButton()).toBeVisible();

        await openSelectedRowsMenu();
        expect(getCompareDocumentsButton()).not.toBeInTheDocument();
        await closeSelectedRowsMenu();

        await selectDocument(esHitsMock[1]);
        expect(getSelectedDocumentsButton()).toBeVisible();

        await openSelectedRowsMenu();
        await waitFor(() => {
          expect(getCompareDocumentsButton()).toBeVisible();
        });
        await closeSelectedRowsMenu();
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should not allow comparison if comparison mode is disabled',
      async () => {
        await renderDataTable({ enableComparisonMode: false });

        await selectDocument(esHitsMock[0]);
        await selectDocument(esHitsMock[1]);

        await openSelectedRowsMenu();
        expect(getCompareDocumentsButton()).not.toBeInTheDocument();
        await closeSelectedRowsMenu();
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should allow comparison if 2 or more documents are selected and comparison mode is enabled',
      async () => {
        await renderDataTable({ enableComparisonMode: true });

        await goToComparisonMode();

        expect(getColumnHeaders()).toEqual(['Field', '1', '2']);
        expect(getCellValues()).toEqual(['', '', 'i', 'i', '20', '', '', 'jpg', 'test1', '']);
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should show full screen button if showFullScreenButton is true',
      async () => {
        await renderDataTable({ enableComparisonMode: true, showFullScreenButton: true });

        await goToComparisonMode();

        expect(getFullScreenButton()).toBeVisible();
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should hide full screen button if showFullScreenButton is false',
      async () => {
        await renderDataTable({ enableComparisonMode: true, showFullScreenButton: false });

        await goToComparisonMode();

        expect(getFullScreenButton()).not.toBeInTheDocument();
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should render selected fields',
      async () => {
        await renderDataTable({ enableComparisonMode: true, columns: ['bytes', 'message'] });

        await goToComparisonMode();

        expect(getFieldColumns()).toEqual(['@timestamp', 'bytesDisplayName', 'message']);
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should render all available fields if no fields are selected',
      async () => {
        await renderDataTable({ enableComparisonMode: true });

        await goToComparisonMode();

        expect(getFieldColumns()).toEqual([
          '@timestamp',
          '_index',
          'bytesDisplayName',
          'extension',
          'message',
        ]);
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('getRowIndicator', () => {
    it(
      'should render the color indicator control',
      async () => {
        await renderComponent({
          ...getProps(),
          getRowIndicator: jest.fn(() => ({ color: 'blue', label: 'test' })),
        });

        expect(screen.getByTestId('dataGridHeaderCell-colorIndicator')).toBeVisible();
        expect(screen.getAllByTestId('unifiedDataTableRowColorIndicatorCell')[0]).toHaveAttribute(
          'title',
          'test'
        );
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should not render the color indicator control by default',
      async () => {
        await renderComponent({
          ...getProps(),
          getRowIndicator: undefined,
        });

        expect(screen.queryByTestId('dataGridHeaderCell-colorIndicator')).not.toBeInTheDocument();
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('columns', () => {
    // Default column width in EUI is hardcoded to 100px for Jest envs
    const EUI_DEFAULT_COLUMN_WIDTH = '100px';

    const getColumnHeader = (name: string) => screen.getByTestId(`dataGridHeaderCell-${name}`);

    const openColumnActions = async (name: string) => {
      const actionsButton = screen.getByTestId(`dataGridHeaderCellActionButton-${name}`);
      await userEvent.click(actionsButton);
      await waitForEuiPopoverOpen();
    };

    const queryColumnHeader = (name: string) => screen.queryByTestId(`dataGridHeaderCell-${name}`);

    it(
      'should reset the last column to auto width if only absolute width columns remain',
      async () => {
        await renderDataTable({
          columns: ['message', 'extension', 'bytes'],
          settings: {
            columns: {
              extension: { width: 50 },
              bytes: { width: 50 },
            },
          },
        });

        expect(getColumnHeader('message')).toHaveStyle({ width: EUI_DEFAULT_COLUMN_WIDTH });
        expect(getColumnHeader('extension')).toHaveStyle({ width: '50px' });
        expect(getColumnHeader('bytes')).toHaveStyle({ width: '50px' });

        await openColumnActions('message');
        await userEvent.click(screen.getByTestId('unifiedDataTableRemoveColumn'));
        await waitFor(() => {
          expect(queryColumnHeader('message')).not.toBeInTheDocument();
        });

        expect(getColumnHeader('extension')).toHaveStyle({ width: '50px' });
        expect(getColumnHeader('bytes')).toHaveStyle({ width: EUI_DEFAULT_COLUMN_WIDTH });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should not reset the last column to auto width when there are remaining auto width columns',
      async () => {
        await renderDataTable({
          columns: ['message', 'extension', 'bytes'],
          settings: {
            columns: {
              bytes: { width: 50 },
            },
          },
        });

        expect(getColumnHeader('message')).toHaveStyle({ width: EUI_DEFAULT_COLUMN_WIDTH });
        expect(getColumnHeader('extension')).toHaveStyle({ width: EUI_DEFAULT_COLUMN_WIDTH });
        expect(getColumnHeader('bytes')).toHaveStyle({ width: '50px' });

        await openColumnActions('message');
        await userEvent.click(screen.getByTestId('unifiedDataTableRemoveColumn'));
        await waitFor(() => {
          expect(queryColumnHeader('message')).not.toBeInTheDocument();
        });

        expect(getColumnHeader('extension')).toHaveStyle({ width: EUI_DEFAULT_COLUMN_WIDTH });
        expect(getColumnHeader('bytes')).toHaveStyle({ width: '50px' });
      },
      EXTENDED_JEST_TIMEOUT
    );

    describe('given a column with absolute width', () => {
      describe('when it is the time column', () => {
        it('should use default time column width when resetting', async () => {
          await renderDataTable({
            columns: [],
            settings: {
              columns: {
                '@timestamp': { width: 50 },
              },
            },
          });

          expect(getColumnHeader('@timestamp')).toHaveStyle({ width: '50px' });

          await openColumnActions('@timestamp');
          await userEvent.click(screen.getByTestId('unifiedDataTableResetColumnWidth'));

          expect(getColumnHeader('@timestamp')).toHaveStyle({
            width: `${defaultTimeColumnWidth}px`,
          });
        });
      });

      describe('when it is not the time column', () => {
        it('should use EUI default column width when resetting', async () => {
          await renderDataTable({
            columns: ['extension'],
            settings: {
              columns: {
                extension: { width: 50 },
              },
            },
          });

          expect(getColumnHeader('extension')).toHaveStyle({ width: '50px' });

          await openColumnActions('extension');
          await userEvent.click(screen.getByTestId('unifiedDataTableResetColumnWidth'));

          expect(getColumnHeader('extension')).toHaveStyle({
            width: EUI_DEFAULT_COLUMN_WIDTH,
          });
        });
      });
    });

    describe('given a column without absolute width', () => {
      it('should not show the reset width button', async () => {
        await renderDataTable({ columns: ['message'] });

        expect(getColumnHeader('message')).toHaveStyle({ width: EUI_DEFAULT_COLUMN_WIDTH });
        await openColumnActions('message');

        expect(screen.queryByTestId('unifiedDataTableResetColumnWidth')).not.toBeInTheDocument();
      });
    });

    it(
      'should have columnVisibility configuration',
      async () => {
        await renderComponent({
          ...getProps(),
          canDragAndDropColumns: true,
          columns: ['message'],
        });

        expect(getLastEuiDataGridProps().columnVisibility).toEqual({
          canDragAndDropColumns: true,
          setVisibleColumns: expect.any(Function),
          visibleColumns: ['@timestamp', 'message'],
        });
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should disable drag&drop if Summary is present',
      async () => {
        await renderComponent({
          ...getProps(),
          canDragAndDropColumns: true,
          columns: [],
        });

        expect(getLastEuiDataGridProps().columnVisibility).toEqual({
          canDragAndDropColumns: false,
          setVisibleColumns: expect.any(Function),
          visibleColumns: ['@timestamp', '_source'],
        });
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('pagination', () => {
    const onChangePageMock = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should effect pageIndex change', async () => {
      await renderComponent({
        ...getProps(),
        rowsPerPageOptions: [1, 5],
        rowsPerPageState: 1,
        onUpdatePageIndex: onChangePageMock,
      });

      expect(screen.getByTestId('pagination-button-1')).toBeVisible();

      onChangePageMock.mockClear();

      await userEvent.click(screen.getByTestId('pagination-button-1'));
      expect(onChangePageMock).toHaveBeenNthCalledWith(1, 1);
    });

    it('should effect pageIndex change when itemsPerPage has been changed', async () => {
      /*
       * Use Case:
       *
       * Let's say we have 4 pages and we are on page 1 with 1 item per page.
       * Now if we change items per page to 4, it should automatically change the pageIndex to 0.
       *
       * */
      const props = {
        ...getProps(),
        rowsPerPageOptions: [1, 4],
        rowsPerPageState: 1,
        onUpdatePageIndex: onChangePageMock,
      };

      const { rerender } = await renderComponent(props);

      expect(screen.getByTestId('pagination-button-4')).toBeVisible();

      onChangePageMock.mockClear();

      // go to last page
      await userEvent.click(screen.getByTestId('pagination-button-4'));
      expect(onChangePageMock).toHaveBeenNthCalledWith(1, 4);

      onChangePageMock.mockClear();

      // Change items per Page so that pageIndex automatically changes.
      expect(screen.getByTestId('tablePaginationPopoverButton')).toHaveTextContent(
        'Rows per page: 1'
      );

      await userEvent.click(screen.getByTestId('tablePaginationPopoverButton'));
      rerender(<DataTableWithI18n {...props} rowsPerPageState={5} />);

      await waitFor(() => {
        expect(screen.getByTestId('tablePaginationPopoverButton')).toHaveTextContent(
          'Rows per page: 5'
        );
      });

      expect(onChangePageMock).toHaveBeenNthCalledWith(1, 0);
    });
  });

  describe('enableInTableSearch', () => {
    it(
      'should render find-button if enableInTableSearch is true and no custom toolbar specified',
      async () => {
        await renderDataTable({ columns: ['bytes'], enableInTableSearch: true });

        expect(screen.getByTestId(BUTTON_TEST_SUBJ)).toBeVisible();
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should render find-button if enableInTableSearch is true and renderCustomToolbar is provided',
      async () => {
        const renderCustomToolbarMock = jest.fn((props) => {
          return (
            <div data-test-subj="custom-toolbar">
              Custom layout {props.gridProps.inTableSearchControl}
            </div>
          );
        });

        await renderDataTable({
          columns: ['bytes'],
          enableInTableSearch: true,
          renderCustomToolbar: renderCustomToolbarMock,
        });

        expect(screen.getByTestId('custom-toolbar')).toBeVisible();
        expect(screen.getByTestId(BUTTON_TEST_SUBJ)).toBeVisible();
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should not render find-button if enableInTableSearch is false',
      async () => {
        await renderDataTable({ columns: ['bytes'], enableInTableSearch: false });

        expect(screen.queryByTestId(BUTTON_TEST_SUBJ)).not.toBeInTheDocument();
      },
      EXTENDED_JEST_TIMEOUT
    );

    it(
      'should find the search term in the table',
      async () => {
        await renderDataTable({ columns: ['bytes'], enableInTableSearch: true });

        expect(screen.getByTestId(BUTTON_TEST_SUBJ)).toBeVisible();

        await userEvent.click(screen.getByTestId(BUTTON_TEST_SUBJ));

        expect(screen.getByTestId(INPUT_TEST_SUBJ)).toBeVisible();

        const searchTerm = '50';

        const input = screen.getByTestId(INPUT_TEST_SUBJ);
        await userEvent.click(input);
        await userEvent.paste(searchTerm);
        expect(input).toHaveValue(searchTerm);

        await waitFor(() => {
          // 3 results for `bytes` column with value `50`
          expect(screen.getByTestId(COUNTER_TEST_SUBJ)).toHaveTextContent('1/3');
        });

        await waitFor(() => {
          const highlights = screen.getAllByText(searchTerm);

          expect(highlights.length).toBeGreaterThan(0);
          expect(
            highlights.every(
              (highlight) =>
                highlight.tagName === 'MARK' && highlight.classList.contains(HIGHLIGHT_CLASS_NAME)
            )
          ).toBe(true);
        });

        await userEvent.click(screen.getByTestId(BUTTON_NEXT_TEST_SUBJ));

        await waitFor(() => {
          expect(screen.getByTestId(COUNTER_TEST_SUBJ)).toHaveTextContent('2/3');
        });

        const anotherSearchTerm = 'random';
        await userEvent.clear(input);
        await userEvent.paste(anotherSearchTerm);
        expect(screen.getByTestId(INPUT_TEST_SUBJ)).toHaveValue(anotherSearchTerm);

        await waitFor(() => {
          // no results
          expect(screen.getByTestId(COUNTER_TEST_SUBJ)).toHaveTextContent('0/0');
        });
      },
      EXTENDED_JEST_TIMEOUT
    );
  });

  describe('Refs', () => {
    it('should expose the EuiDataGrid ref', async () => {
      const ref = React.createRef<EuiDataGridRefProps & RestorableStateProviderApi>();
      render(<UnifiedDataTable {...getProps()} ref={ref} />);

      expect(ref.current?.setFocusedCell).toBeDefined();
    });
  });
});
