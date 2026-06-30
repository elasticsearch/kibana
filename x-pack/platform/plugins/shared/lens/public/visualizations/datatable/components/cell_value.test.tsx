/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiThemeProvider } from '@elastic/eui';
import { DataContext } from './table_basic';
import { createGridCell } from './cell_value';
import { getTransposeId } from '@kbn/transpose-utils';
import { chartPluginMock } from '@kbn/charts-plugin/public/mocks';
import type { FieldFormat } from '@kbn/field-formats-plugin/common';
import { MISSING_TOKEN } from '@kbn/field-formats-common';
import type { Datatable } from '@kbn/expressions-plugin/public';
import type { DatatableArgs } from '../../../../common/expressions';
import type { DataContextType } from './types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('datatable cell renderer', () => {
  const innerCellColorFnMock = jest.fn().mockReturnValue('blue');
  const cellColorFnMock = jest.fn().mockReturnValue(innerCellColorFnMock);
  const paletteServiceMock = chartPluginMock.createPaletteRegistry();
  const setCellProps = jest.fn();

  const baseTable: Datatable = {
    type: 'datatable',
    columns: [
      {
        id: 'a',
        name: 'a',
        meta: {
          type: 'number',
        },
      },
    ],
    rows: [{ a: 123 }],
  };

  const makeTable = (
    rows: Datatable['rows'],
    columns: Datatable['columns'] = baseTable.columns
  ) => ({
    ...baseTable,
    columns,
    rows,
  });

  const defaultFormatter = {
    convertToText: (x: unknown) => `formatted ${x}`,
    convertToReact: (x: unknown) => `formatted ${x}`,
  } as FieldFormat;
  const defaultFormatters = { a: defaultFormatter } as Record<string, FieldFormat>;

  const defaultAlignments = new Map<string, 'left' | 'right' | 'center'>([['a', 'right']]);
  const defaultMinMaxByColumnId = new Map([['a', { min: 12, max: 155 }]]);

  afterEach(() => {
    jest.clearAllMocks();
  });

  const DataContextProviderWrapper =
    (wrapperProps?: Partial<DataContextType>) =>
    ({ children }: { children: React.ReactNode }) => {
      return (
        <DataContext.Provider
          value={{
            table: baseTable,
            alignments: defaultAlignments,
            ...wrapperProps,
          }}
        >
          {children}
        </DataContext.Provider>
      );
    };
  const makeDatatableArgs = (overrides: Partial<DatatableArgs> = {}): DatatableArgs => ({
    title: 'myData',
    columns: [
      {
        columnId: 'a',
        type: 'lens_datatable_column',
        ...overrides.columns?.[0],
      },
    ],
    sortingColumnId: '',
    sortingDirection: 'none',
    rowHeightLines: 1,
    ...overrides,
  });

  type ColumnConfig = Parameters<typeof createGridCell>[1];

  const makeCellRenderer = ({
    columnConfig,
    formatters = defaultFormatters,
    isDarkMode = false,
    fitRowToContent,
  }: {
    columnConfig: ColumnConfig;
    formatters?: Record<string, FieldFormat>;
    isDarkMode?: boolean;
    fitRowToContent?: boolean;
  }) =>
    createGridCell(
      formatters,
      columnConfig,
      DataContext,
      isDarkMode,
      cellColorFnMock,
      paletteServiceMock,
      fitRowToContent
    );

  const renderCell = ({
    cellRenderer: CellRenderer,
    columnId = 'a',
    rowIndex = 0,
    colIndex = 0,
    isExpanded = false,
    context = {},
  }: {
    cellRenderer: ReturnType<typeof createGridCell>;
    columnId?: string;
    rowIndex?: number;
    colIndex?: number;
    isExpanded?: boolean;
    context?: Partial<DataContextType>;
  }) =>
    render(
      <CellRenderer
        rowIndex={rowIndex}
        colIndex={colIndex}
        columnId={columnId}
        setCellProps={setCellProps}
        isExpandable={false}
        isDetails={false}
        isExpanded={isExpanded}
      />,
      {
        wrapper: DataContextProviderWrapper({
          table: baseTable,
          minMaxByColumnId: defaultMinMaxByColumnId,
          ...context,
        }),
      }
    );

  describe('rendering', () => {
    it('renders formatted value', () => {
      const cellRenderer = makeCellRenderer({
        columnConfig: { columns: [], sortingColumnId: '', sortingDirection: 'none' },
      });
      renderCell({ cellRenderer });
      expect(screen.getByText('formatted 123')).toHaveTextContent('formatted 123');
    });

    it('set class with text alignment', () => {
      const cellRenderer = makeCellRenderer({
        columnConfig: { columns: [], sortingColumnId: '', sortingDirection: 'none' },
      });
      renderCell({ cellRenderer });
      expect(screen.getByText('formatted 123')).toHaveClass('lnsTableCell--right');
    });

    it('does not set multiline class for regular height tables', () => {
      const cellRenderer = makeCellRenderer({
        columnConfig: { columns: [], sortingColumnId: '', sortingDirection: 'none' },
      });
      renderCell({ cellRenderer });
      expect(screen.getByText('formatted 123')).not.toHaveClass('lnsTableCell--multiline');
    });

    it('set multiline class for auto height tables', () => {
      const cellRenderer = makeCellRenderer({
        columnConfig: { columns: [], sortingColumnId: '', sortingDirection: 'none' },
        fitRowToContent: true,
      });
      renderCell({ cellRenderer });
      expect(screen.getByText('formatted 123')).toHaveClass('lnsTableCell--multiline');
    });
  });

  describe('one-click filter', () => {
    it('renders as button if oneClickFilter is set', () => {
      const cellRenderer = makeCellRenderer({
        columnConfig: {
          columns: [{ columnId: 'a', type: 'lens_datatable_column', oneClickFilter: true }],
          sortingColumnId: '',
          sortingDirection: 'none',
        },
        fitRowToContent: true,
      });
      renderCell({ cellRenderer, context: { handleFilterClick: () => {} } });
      expect(screen.getByRole('button')).toHaveTextContent('formatted 123');
    });

    it('passes the correct colIndex to handleFilterClick for a non-first column', async () => {
      const handleFilterClick = jest.fn();
      const cellRenderer = makeCellRenderer({
        columnConfig: {
          columns: [
            { columnId: 'a', type: 'lens_datatable_column' },
            { columnId: 'b', type: 'lens_datatable_column', oneClickFilter: true },
          ],
          sortingColumnId: '',
          sortingDirection: 'none',
        },
        formatters: {
          a: {
            convertToText: (x) => `formatted ${x}`,
            convertToReact: (x) => `formatted ${x}`,
          } as FieldFormat,
          b: {
            convertToText: (x) => `formatted ${x}`,
            convertToReact: (x) => `formatted ${x}`,
          } as FieldFormat,
        },
      });

      const multiColTable = makeTable(
        [{ a: 123, b: 456 }],
        [...baseTable.columns, { id: 'b', name: 'b', meta: { type: 'number' } }]
      );

      renderCell({
        cellRenderer,
        columnId: 'b',
        colIndex: 1,
        context: { handleFilterClick, table: multiColTable },
      });

      await userEvent.click(screen.getByRole('button'));
      expect(handleFilterClick).toHaveBeenCalledWith('b', 456, 1, 0);
    });
  });

  describe('dynamic coloring', () => {
    const getCellRendererWithPalette = (columnConfig: DatatableArgs) =>
      makeCellRenderer({ columnConfig, formatters: defaultFormatters });

    const renderPaletteCell = (
      columnConfig: DatatableArgs = makeDatatableArgs(),
      context: Partial<DataContextType> = {}
    ) => {
      const cellRenderer = getCellRendererWithPalette(columnConfig);
      return renderCell({
        cellRenderer,
        columnId: columnConfig.columns[0].columnId,
        context: { ...context },
      });
    };

    it('ignores coloring when colorMode is set to "none"', () => {
      renderPaletteCell();
      expect(setCellProps).not.toHaveBeenCalled();
    });

    it('should set the coloring of the cell when enabled', () => {
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'cell';

      renderPaletteCell(columnConfig, {});

      expect(setCellProps).toHaveBeenCalledWith({
        style: expect.objectContaining({ backgroundColor: 'blue' }),
      });
    });

    it('should call getCellColor with full columnId of transpose column', () => {
      const columnId = getTransposeId('test', 'a');
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'cell';
      columnConfig.columns[0].columnId = columnId;

      renderPaletteCell(columnConfig, {
        table: {
          ...baseTable,
          columns: [
            {
              ...baseTable.columns[0],
              id: columnId,
            },
          ],
          rows: [{ [columnId]: 123 }],
        },
      });

      expect(cellColorFnMock.mock.calls[0][0]).toBe(columnId);
    });

    it('should set the coloring of the text when enabled', () => {
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'text';

      renderPaletteCell(columnConfig, {});

      expect(setCellProps).toHaveBeenCalledWith({
        style: expect.objectContaining({ color: 'blue' }),
      });
    });

    it('should render badge when enabled', () => {
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'badge';

      setCellProps.mockClear();
      renderPaletteCell(columnConfig, {});

      expect(screen.getByText('formatted 123')).toBeInTheDocument();
      expect(screen.getByTestId('lnsTableCellContentBadge')).toBeInTheDocument();
      expect(setCellProps).not.toHaveBeenCalled();
    });

    it('should resolve the badge color via getCellColor even when no palette or colorMapping is configured', () => {
      // Regression: when configuring datatable columns through the as-code Lens API
      // with `colorMode: badge` but without an explicit palette/colorMapping, badges
      // must still pick up colors from the default resolution path (mirrors cell/text).
      // Previously this path short-circuited to null and rendered a hollow badge.
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'badge';
      expect(columnConfig.columns[0].palette).toBeUndefined();
      expect(columnConfig.columns[0].colorMapping).toBeUndefined();

      renderPaletteCell(columnConfig, {});

      // getCellColor must be invoked even without explicit palette/colorMapping so
      // the table-level default resolution kicks in (see table_basic.tsx).
      expect(cellColorFnMock).toHaveBeenCalledWith('a', undefined, undefined);
      expect(innerCellColorFnMock).toHaveBeenCalledWith(123);
      expect(screen.getByTestId('lnsTableCellContentBadge')).toBeInTheDocument();
    });

    it('should not invoke the color function when the badge value is non-colorable', () => {
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'badge';

      renderPaletteCell(columnConfig, {
        table: makeTable([{ a: null }]),
      });

      expect(innerCellColorFnMock).not.toHaveBeenCalled();
    });

    it('should not render badge for null values', () => {
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'badge';

      setCellProps.mockClear();
      renderPaletteCell(columnConfig, {
        table: {
          ...baseTable,
          rows: [{ a: null }],
        },
      });

      expect(screen.queryByTestId('lnsTableCellContentBadge')).not.toBeInTheDocument();
      expect(setCellProps).not.toHaveBeenCalled();
      expect(screen.getByText('formatted null')).toBeInTheDocument();
      expect(screen.getByTestId('lnsTableCellContent')).not.toHaveClass('lnsTableCell--colored');
    });

    it.each(['badge', 'cell', 'text'] as const)(
      'should render null as subdued placeholder regardless of colorMode (%s)',
      (colorMode) => {
        const columnConfig = makeDatatableArgs();
        columnConfig.columns[0].colorMode = colorMode;

        const cellRenderer = makeCellRenderer({
          columnConfig,
          formatters: {
            a: {
              convertToText: () => '(null)',
              convertToReact: (x: unknown) => {
                if (x == null) {
                  return <span className="ffString__emptyValue">(null)</span>;
                }
                return `formatted ${x}`;
              },
            } as unknown as FieldFormat,
          },
        });

        setCellProps.mockClear();

        renderCell({
          cellRenderer,
          context: { table: makeTable([{ a: null }]) },
        });

        expect(screen.getByText('(null)')).toHaveClass('ffString__emptyValue');
        expect(setCellProps).not.toHaveBeenCalled();
        expect(screen.queryByTestId('lnsTableCellContentBadge')).not.toBeInTheDocument();
      }
    );

    it('should treat missing bucket token as non-colorable', () => {
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'cell';
      setCellProps.mockClear();

      renderPaletteCell(columnConfig, {
        table: {
          ...baseTable,
          rows: [{ a: MISSING_TOKEN }],
        },
      });

      expect(setCellProps).not.toHaveBeenCalled();
      expect(screen.getByTestId('lnsTableCellContent')).not.toHaveClass('lnsTableCell--colored');
    });

    it('should not mark empty values as colored when colorMode is text', () => {
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'text';
      setCellProps.mockClear();

      renderPaletteCell(columnConfig, {
        table: {
          ...baseTable,
          rows: [{ a: '' }],
        },
      });

      expect(setCellProps).not.toHaveBeenCalled();
      expect(screen.getByTestId('lnsTableCellContent')).not.toHaveClass('lnsTableCell--colored');
    });

    it('should not render badge for blank values', () => {
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'badge';

      setCellProps.mockClear();
      renderPaletteCell(columnConfig, {
        table: {
          ...baseTable,
          rows: [{ a: '' }],
        },
      });

      expect(screen.queryByTestId('lnsTableCellContentBadge')).not.toBeInTheDocument();
      expect(setCellProps).not.toHaveBeenCalled();
      expect(screen.getByText(/^formatted\s*$/)).toBeInTheDocument();
      expect(screen.getByTestId('lnsTableCellContent')).not.toHaveClass('lnsTableCell--colored');
    });

    it('should not render badge for NaN values', () => {
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'badge';

      setCellProps.mockClear();
      renderPaletteCell(columnConfig, {
        table: {
          ...baseTable,
          rows: [{ a: Number.NaN }],
        },
      });

      expect(screen.getByText('formatted NaN')).toBeInTheDocument();
      expect(screen.queryByTestId('lnsTableCellContentBadge')).not.toBeInTheDocument();
      expect(setCellProps).not.toHaveBeenCalled();
      expect(screen.getByTestId('lnsTableCellContent')).not.toHaveClass('lnsTableCell--colored');
    });

    it('should fall back to React placeholder when text formatting is empty in badge mode', () => {
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'badge';

      const badgeCellRenderer = makeCellRenderer({
        columnConfig,
        formatters: {
          a: {
            convertToText: (x: unknown) => {
              if (typeof x === 'number' && Number.isNaN(x)) {
                return '';
              }
              return `formatted ${x}`;
            },
            convertToReact: (x: unknown) => {
              if (typeof x === 'number' && Number.isNaN(x)) {
                return <span className="ffString__emptyValue">(null)</span>;
              }
              return `formatted ${x}`;
            },
          } as unknown as FieldFormat,
        },
      });

      renderCell({
        cellRenderer: badgeCellRenderer,
        context: { table: makeTable([{ a: Number.NaN }]) },
      });

      expect(screen.getByText('(null)')).toBeInTheDocument();
      expect(screen.queryByTestId('lnsTableCellContentBadge')).not.toBeInTheDocument();
    });

    it('should render a link for null values in badge mode when oneClickFilter is enabled', async () => {
      const handleFilterClick = jest.fn();
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'badge';
      columnConfig.columns[0].oneClickFilter = true;

      renderPaletteCell(columnConfig, {
        handleFilterClick,
        table: makeTable([{ a: null }]),
      });

      expect(screen.queryByTestId('lnsTableCellContentBadge')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button'));
      expect(handleFilterClick).toHaveBeenCalledWith('a', null, 0, 0);
    });

    it('should invoke handleFilterClick when badge with oneClickFilter is clicked', async () => {
      const handleFilterClick = jest.fn();
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'badge';
      columnConfig.columns[0].oneClickFilter = true;

      renderPaletteCell(columnConfig, { handleFilterClick });

      await userEvent.click(screen.getByText('formatted 123'));
      expect(handleFilterClick).toHaveBeenCalledWith('a', 123, 0, 0);
    });

    it('should not color the cell when color function returns null', () => {
      setCellProps.mockClear();
      innerCellColorFnMock.mockReturnValueOnce(null);
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'cell';

      renderPaletteCell(columnConfig, {});

      expect(setCellProps).not.toHaveBeenCalled();
    });

    it('should not color the cell when color function returns empty string', () => {
      innerCellColorFnMock.mockReturnValueOnce('');
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'cell';

      renderPaletteCell(columnConfig, {});

      expect(setCellProps).not.toHaveBeenCalled();
    });

    it('should clear previously applied cell styles when value becomes null', () => {
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'cell';
      innerCellColorFnMock.mockReturnValue('blue');

      const CellRenderer = getCellRendererWithPalette(columnConfig);
      let currentTable: Datatable = makeTable([{ a: 123 }]);
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DataContext.Provider
          value={{
            table: currentTable,
            alignments: defaultAlignments,
          }}
        >
          {children}
        </DataContext.Provider>
      );

      const { rerender } = render(
        <CellRenderer
          rowIndex={0}
          colIndex={0}
          columnId="a"
          setCellProps={setCellProps}
          isExpandable={false}
          isDetails={false}
          isExpanded={false}
        />,
        { wrapper }
      );

      expect(setCellProps).toHaveBeenCalledWith({
        style: expect.objectContaining({ backgroundColor: 'blue' }),
      });

      setCellProps.mockClear();
      currentTable = makeTable([{ a: null }]);
      rerender(
        <CellRenderer
          rowIndex={0}
          colIndex={0}
          columnId="a"
          setCellProps={setCellProps}
          isExpandable={false}
          isDetails={false}
          isExpanded={false}
        />
      );

      expect(setCellProps).toHaveBeenCalledWith({
        style: { backgroundColor: undefined, color: undefined },
      });
    });

    it('should clean up cell coloring on unmount to prevent stale styles', () => {
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'cell';

      const { unmount } = renderPaletteCell(columnConfig);

      expect(setCellProps).toHaveBeenCalledWith({
        style: expect.objectContaining({ backgroundColor: 'blue' }),
      });

      setCellProps.mockClear();
      unmount();

      expect(setCellProps).toHaveBeenCalledWith({
        style: { backgroundColor: undefined, color: undefined },
      });
    });

    it('should not clean up cell styles when the cell is expanded', () => {
      const columnConfig = makeDatatableArgs();
      columnConfig.columns[0].colorMode = 'cell';
      const cellRenderer = getCellRendererWithPalette(columnConfig);

      const { unmount } = renderCell({
        cellRenderer,
        isExpanded: true,
        context: { table: baseTable, minMaxByColumnId: defaultMinMaxByColumnId },
      });

      setCellProps.mockClear();
      unmount();

      expect(setCellProps).not.toHaveBeenCalled();
    });
  });

  describe('one-click filter with background color', () => {
    const handleFilterClick = jest.fn();

    const renderThemedCellRenderer = (
      columnConfig: DatatableArgs,
      isDarkMode: boolean,
      backgroundColor: string | null
    ) => {
      innerCellColorFnMock.mockReturnValue(backgroundColor);
      const CellRendererWithColor = makeCellRenderer({
        columnConfig,
        isDarkMode,
        formatters: defaultFormatters,
      });

      render(
        <EuiThemeProvider colorMode={isDarkMode ? 'dark' : 'light'}>
          <CellRendererWithColor
            rowIndex={0}
            colIndex={0}
            columnId="a"
            setCellProps={setCellProps}
            isExpandable={false}
            isDetails={false}
            isExpanded={false}
          />
        </EuiThemeProvider>,
        {
          wrapper: DataContextProviderWrapper({
            handleFilterClick,
            table: baseTable,
          }),
        }
      );
    };

    const columnConfig: DatatableArgs = {
      title: 'myData',
      columns: [
        {
          columnId: 'a',
          type: 'lens_datatable_column',
          oneClickFilter: true,
          colorMode: 'cell',
        },
      ],
      sortingColumnId: '',
      sortingDirection: 'none',
    };

    it('should adjust link color for dark background in light mode', () => {
      const backgroundColor = '#000000';
      const expectedColor = '#4b78c9';
      const isDarkMode = false;
      renderThemedCellRenderer(columnConfig, isDarkMode, backgroundColor);

      expect(screen.getByRole('button')).toHaveStyle(`color: ${expectedColor}`);
    });

    it('should adjust link color for light background in dark mode', () => {
      const backgroundColor = '#FFFFFF';
      const expectedColor = '#1750BA';
      const isDarkMode = true;
      renderThemedCellRenderer(columnConfig, isDarkMode, backgroundColor);

      expect(screen.getByRole('button')).toHaveStyle(`color: ${expectedColor}`);
    });

    it('should not adjust link color when there is no background color', () => {
      const isDarkMode = false;
      renderThemedCellRenderer(columnConfig, isDarkMode, null);
      const linkColor = '#1750BA';
      expect(screen.getByRole('button')).toHaveStyle(`color: ${linkColor}`);
    });

    it('should not adjust link color when colorMode is none', () => {
      const backgroundColor = '#FF0000'; // A distinct background color
      const isDarkMode = false;
      const columnConfigNonCellColorMode: DatatableArgs = {
        ...columnConfig,
        columns: [
          {
            ...columnConfig.columns[0],
            colorMode: 'none',
          },
        ],
      };
      renderThemedCellRenderer(columnConfigNonCellColorMode, isDarkMode, backgroundColor);
      const linkColor = '#1750BA'; // Default EuiLink color for light mode
      expect(screen.getByRole('button')).toHaveStyle(`color: ${linkColor}`);
    });

    it('should not adjust link color when colorMode is text', () => {
      const backgroundColor = '#FF0000'; // A distinct background color
      const isDarkMode = false;
      const columnConfigNonCellColorMode: DatatableArgs = {
        ...columnConfig,
        columns: [
          {
            ...columnConfig.columns[0],
            colorMode: 'text',
          },
        ],
      };
      renderThemedCellRenderer(columnConfigNonCellColorMode, isDarkMode, backgroundColor);
      const linkColor = '#1750BA'; // Default EuiLink color for light mode
      expect(screen.getByRole('button')).toHaveStyle(`color: ${linkColor}`);
    });
  });

  describe('progress bar', () => {
    const progressColumnConfig = (fillStyle: object): ColumnConfig => ({
      columns: [
        {
          columnId: 'a',
          type: 'lens_datatable_column',
          colorMode: 'progress',
          fillStyle: JSON.stringify(fillStyle),
        },
      ],
      sortingColumnId: '',
      sortingDirection: 'none',
    });

    it('renders a Meter with the formatted value label for a numeric cell', () => {
      const CellRenderer = makeCellRenderer({
        columnConfig: progressColumnConfig({ fillMode: 'single', valueRange: { mode: 'auto' } }),
      });
      render(
        <EuiThemeProvider>
          <CellRenderer
            rowIndex={0}
            colIndex={0}
            columnId="a"
            setCellProps={setCellProps}
            isExpandable={false}
            isDetails={false}
            isExpanded={false}
          />
        </EuiThemeProvider>,
        {
          wrapper: DataContextProviderWrapper({
            table: baseTable,
            minMaxByColumnId: defaultMinMaxByColumnId,
          }),
        }
      );

      expect(screen.getByTestId('lnsTableProgressBarLabel')).toHaveTextContent('formatted 123');
      // The Meter renders with role="meter" carrying the cell value.
      expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '123');
    });

    it('falls back to a formatted cell for empty/non-numeric values', () => {
      const CellRenderer = makeCellRenderer({
        columnConfig: progressColumnConfig({ fillMode: 'single', valueRange: { mode: 'auto' } }),
      });
      render(
        <EuiThemeProvider>
          <CellRenderer
            rowIndex={0}
            colIndex={0}
            columnId="a"
            setCellProps={setCellProps}
            isExpandable={false}
            isDetails={false}
            isExpanded={false}
          />
        </EuiThemeProvider>,
        {
          wrapper: DataContextProviderWrapper({
            table: makeTable([{ a: null }]),
            minMaxByColumnId: defaultMinMaxByColumnId,
          }),
        }
      );

      expect(screen.queryByRole('meter')).not.toBeInTheDocument();
      expect(screen.queryByTestId('lnsTableProgressBarLabel')).not.toBeInTheDocument();
    });
  });
});
