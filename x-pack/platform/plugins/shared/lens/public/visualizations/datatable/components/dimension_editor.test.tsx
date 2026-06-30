/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { DEFAULT_COLOR_MAPPING_CONFIG } from '@kbn/coloring';
import type { KbnPaletteId } from '@kbn/palettes';
import { act, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { chartPluginMock } from '@kbn/charts-plugin/public/mocks';
import { fieldFormatsServiceMock } from '@kbn/field-formats-plugin/public/mocks';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import { EuiButtonGroupTestHarness, EuiComboBoxTestHarness } from '@kbn/test-eui-helpers';
import type { DatatableColumnType } from '@kbn/expressions-plugin/common';
import type {
  FramePublicAPI,
  DatasourcePublicAPI,
  OperationDescriptor,
  DataType,
  DatatableVisualizationState,
} from '@kbn/lens-common';
import { createMockDatasource, createMockFramePublicAPI } from '../../../mocks';
import type { TableDimensionEditorProps } from './dimension_editor';
import { TableDimensionEditor } from './dimension_editor';
import { getCellDecorationLabel } from '../cell_decoration';
import type { ColumnState } from '../../../../common/expressions';
import { getKbnPalettes } from '@kbn/palettes';
import { renderWithProviders } from '../../../test_utils/test_utils';

const fieldFormatsMock = fieldFormatsServiceMock.createStartContract();

describe('data table dimension editor', () => {
  let user: UserEvent;
  let frame: FramePublicAPI;
  let state: DatatableVisualizationState;
  let btnGroups: { alignment: EuiButtonGroupTestHarness; colorMode: EuiComboBoxTestHarness };
  let mockOperationForFirstColumn: (overrides?: Partial<OperationDescriptor>) => void;
  let mockActiveDataColumnType: (type: DatatableColumnType) => void;
  let mockFirstColumn: (overrides?: Partial<OperationDescriptor>) => void;

  let props: TableDimensionEditorProps;

  // Resolve display labels from the same capability registry the editor uses, so
  // the stored value (e.g. 'cell' -> "Background") and the visible label never drift.
  const getDynamicColoringLabel = (colorMode: ColumnState['colorMode']) =>
    getCellDecorationLabel(colorMode ?? 'none');

  function testState(): DatatableVisualizationState {
    return {
      layerId: 'first',
      layerType: LayerTypes.DATA,
      columns: [
        {
          columnId: 'foo',
        },
      ],
    };
  }

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  beforeEach(() => {
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    btnGroups = {
      colorMode: new EuiComboBoxTestHarness('lnsDatatable_dynamicColoring_groups'),
      alignment: new EuiButtonGroupTestHarness('lnsDatatable_alignment_groups'),
    };
    state = testState();
    frame = createMockFramePublicAPI();
    frame.datasourceLayers = {
      first: createMockDatasource('test').publicAPIMock,
    };
    frame.activeData = {
      first: {
        type: 'datatable',
        columns: [
          {
            id: 'foo',
            name: 'foo',
            meta: {
              type: 'string',
              params: {},
            },
          },
        ],
        rows: [],
      },
    };
    props = {
      accessor: 'foo',
      frame,
      groupId: 'columns',
      layerId: 'first',
      state,
      setState: jest.fn(),
      isDarkMode: false,
      paletteService: chartPluginMock.createPaletteRegistry(),
      palettes: getKbnPalettes({ name: 'amsterdam', darkMode: false }),
      panelRef: React.createRef(),
      addLayer: jest.fn(),
      removeLayer: jest.fn(),
      datasource: {} as DatasourcePublicAPI,
      formatFactory: fieldFormatsMock.deserialize,
    };

    mockOperationForFirstColumn = (overrides: Partial<OperationDescriptor> = {}) => {
      frame!.datasourceLayers!.first!.getOperationForColumnId = jest.fn().mockReturnValue({
        label: 'label',
        isBucketed: false,
        dataType: 'string',
        hasTimeShift: false,
        hasReducedTimeRange: false,
        ...overrides,
      } satisfies OperationDescriptor);
    };

    mockActiveDataColumnType = (type: DatatableColumnType) => {
      frame.activeData!.first.columns[0].meta.type = type;
    };

    mockFirstColumn = (overrides: Partial<OperationDescriptor> = {}) => {
      mockOperationForFirstColumn(overrides);
      mockActiveDataColumnType((overrides.dataType ?? 'string') as DatatableColumnType);
    };

    mockFirstColumn();
  });

  const renderTableDimensionEditor = (overrideProps?: Partial<TableDimensionEditorProps>) => {
    return renderWithProviders(<TableDimensionEditor {...props} {...overrideProps} />, {
      wrapper: ({ children }) => (
        <>
          <div ref={props.panelRef} />
          {children}
        </>
      ),
    });
  };

  it('should render default alignment', () => {
    renderTableDimensionEditor();
    expect(btnGroups.alignment.getSelected()).toHaveTextContent('Left');
  });

  it('should render default alignment for number', () => {
    mockFirstColumn({ dataType: 'number' });
    renderTableDimensionEditor();
    expect(btnGroups.alignment.getSelected()).toHaveTextContent('Right');
  });

  it('should render default alignment for ranges', () => {
    mockFirstColumn({ isBucketed: true, dataType: 'number' });
    renderTableDimensionEditor();
    expect(btnGroups.alignment.getSelected()).toHaveTextContent('Left');
  });

  it('should render specific alignment', () => {
    state.columns[0].alignment = 'center';
    renderTableDimensionEditor();
    expect(btnGroups.alignment.getSelected()).toHaveTextContent('Center');
  });

  it('should set state for the right column', async () => {
    state.columns = [
      {
        columnId: 'foo',
      },
      {
        columnId: 'bar',
      },
    ];
    renderTableDimensionEditor();
    await user.click(screen.getByRole('button', { name: 'Center' }));
    await act(async () => jest.advanceTimersByTime(256));
    expect(props.setState).toHaveBeenCalledWith({
      ...state,
      columns: [
        {
          columnId: 'foo',
          alignment: 'center',
        },
        {
          columnId: 'bar',
        },
      ],
    });
  });

  it('should set the dynamic coloring default to "none"', () => {
    state.columns[0].colorMode = undefined;
    renderTableDimensionEditor();
    expect(btnGroups.colorMode.getSelected()).toEqual(['None']);
    expect(screen.queryByTestId('lns_dynamicColoring_edit')).not.toBeInTheDocument();
  });

  it.each<DataType>(['date'])(
    'should show the dynamic coloring option for "%s" columns',
    (type) => {
      mockFirstColumn({ dataType: type });

      renderTableDimensionEditor();
      expect(screen.queryByTestId('lnsDatatable_dynamicColoring_groups')).toBeInTheDocument();
      expect(screen.queryByTestId('lns_dynamicColoring_edit')).not.toBeInTheDocument();
    }
  );

  it.each<ColumnState['colorMode']>(['cell', 'text', 'badge'])(
    'should show the palette options ony when colorMode is "%s"',
    (colorMode) => {
      state.columns[0].colorMode = colorMode;
      renderTableDimensionEditor();
      expect(btnGroups.colorMode.getSelected()).toEqual([getDynamicColoringLabel(colorMode)]);
      expect(screen.getByTestId('lns_dynamicColoring_edit')).toBeInTheDocument();
    }
  );

  it.each<ColumnState['colorMode']>(['none', undefined])(
    'should not show the palette options when colorMode is "%s"',
    (colorMode) => {
      state.columns[0].colorMode = colorMode;
      renderTableDimensionEditor();
      expect(btnGroups.colorMode.getSelected()).toEqual(['None']);
      expect(screen.queryByTestId('lns_dynamicColoring_edit')).not.toBeInTheDocument();
    }
  );

  it('should set the coloring mode to the right column', async () => {
    state.columns = [{ columnId: 'foo' }, { columnId: 'bar' }];
    renderTableDimensionEditor();
    await btnGroups.colorMode.select(getDynamicColoringLabel('cell'));
    await act(async () => jest.advanceTimersByTime(256));
    expect(props.setState).toHaveBeenCalledWith({
      ...state,
      columns: [
        {
          columnId: 'foo',
          colorMode: 'cell',
          colorMapping: DEFAULT_COLOR_MAPPING_CONFIG,
        },
        {
          columnId: 'bar',
        },
      ],
    });
  });

  it('should set the badge coloring mode to the right column', async () => {
    state.columns = [{ columnId: 'foo' }, { columnId: 'bar' }];
    renderTableDimensionEditor();
    await btnGroups.colorMode.select(getDynamicColoringLabel('badge'));
    await act(async () => jest.advanceTimersByTime(256));
    expect(props.setState).toHaveBeenCalledWith({
      ...state,
      columns: [
        {
          columnId: 'foo',
          colorMode: 'badge',
          colorMapping: DEFAULT_COLOR_MAPPING_CONFIG,
        },
        {
          columnId: 'bar',
        },
      ],
    });
  });

  it('should not set colorMapping or palette if color mode is changed to "text"', async () => {
    const paletteId = 'non-default' as KbnPaletteId;
    state.columns = [
      {
        columnId: 'foo',
        colorMode: 'cell',
        colorMapping: {
          ...DEFAULT_COLOR_MAPPING_CONFIG,
          paletteId,
        },
        palette: {
          type: 'palette',
          name: paletteId,
        },
      },
    ];
    renderTableDimensionEditor();
    await btnGroups.colorMode.select('Text');
    await act(async () => jest.advanceTimersByTime(256));

    expect(props.setState).toHaveBeenCalledWith({
      ...state,
      columns: [
        {
          columnId: 'foo',
          colorMode: 'text',
          colorMapping: expect.objectContaining({ paletteId }),
          palette: expect.objectContaining({ type: 'palette', name: paletteId }),
        },
      ],
    });
  });

  it.each<{ flyout: 'terms' | 'values'; isBucketed: boolean; type: DataType }>([
    { flyout: 'terms', isBucketed: true, type: 'number' },
    { flyout: 'terms', isBucketed: false, type: 'string' },
    { flyout: 'values', isBucketed: false, type: 'number' },
  ])(
    'should show color by $flyout flyout when bucketing is $isBucketed with $type column',
    async ({ flyout, isBucketed, type }) => {
      state.columns[0].colorMode = 'cell';
      mockFirstColumn({ isBucketed, dataType: type });
      renderTableDimensionEditor();

      await user.click(screen.getByLabelText('Edit colors'));
      await act(async () => jest.advanceTimersByTime(256));

      expect(screen.getByTestId(`lns-palettePanel-${flyout}`)).toBeInTheDocument();
    }
  );

  it.each<{
    flyout: 'terms' | 'values';
    operationType: DataType;
    activeDataType: DatatableColumnType;
  }>([
    { flyout: 'terms', operationType: 'number', activeDataType: 'string' },
    { flyout: 'values', operationType: 'string', activeDataType: 'number' },
  ])(
    'should show $flyout panel when operation type is $operationType but active data type is $activeDataType',
    async ({ flyout, operationType, activeDataType }) => {
      state.columns[0].colorMode = 'cell';
      mockOperationForFirstColumn({ dataType: operationType });
      mockActiveDataColumnType(activeDataType);
      renderTableDimensionEditor();

      await user.click(screen.getByLabelText('Edit colors'));
      await act(async () => jest.advanceTimersByTime(256));

      expect(screen.getByTestId(`lns-palettePanel-${flyout}`)).toBeInTheDocument();
    }
  );

  it('should show the dynamic coloring option for a bucketed operation', () => {
    state.columns[0].colorMode = 'cell';
    mockFirstColumn({ isBucketed: true, dataType: 'string' });

    renderTableDimensionEditor();
    expect(screen.queryByTestId('lnsDatatable_dynamicColoring_groups')).toBeInTheDocument();
    expect(screen.queryByTestId('lns_dynamicColoring_edit')).toBeInTheDocument();
  });

  it('should set a default palette when enabling legacy palettes', async () => {
    state.columns[0].colorMode = 'badge';
    mockFirstColumn({ isBucketed: true, dataType: 'string' });

    renderTableDimensionEditor();

    await user.click(screen.getByLabelText('Edit colors'));
    await act(async () => jest.advanceTimersByTime(256));

    await user.click(screen.getByTestId('lns_colorMappingOrLegacyPalette_switch'));
    await act(async () => jest.advanceTimersByTime(256));

    expect(props.setState).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: [
          expect.objectContaining({
            columnId: 'foo',
            colorMode: 'badge',
            palette: { type: 'palette', name: 'default' },
            colorMapping: undefined,
          }),
        ],
      })
    );
  });

  it('should clear palette and colorMapping when colorMode is set to "none"', async () => {
    state.columns[0].colorMode = 'cell';
    state.columns[0].palette = {
      type: 'palette',
      name: 'default',
    };
    state.columns[0].colorMapping = DEFAULT_COLOR_MAPPING_CONFIG;

    renderTableDimensionEditor();

    await btnGroups.colorMode.select(getDynamicColoringLabel('none'));

    await act(async () => jest.advanceTimersByTime(256));
    expect(props.setState).toBeCalledWith({
      ...state,
      columns: [
        expect.objectContaining({
          colorMode: 'none',
          palette: undefined,
          colorMapping: undefined,
        }),
      ],
    });
  });

  [true, false].forEach((isTransposed) => {
    it(`should${isTransposed ? ' not' : ''} show hidden switch when column is${
      !isTransposed ? ' not' : ''
    } transposed`, () => {
      state.columns[0].isTransposed = isTransposed;
      renderTableDimensionEditor();

      const hiddenSwitch = screen.queryByTestId('lns-table-column-hidden');
      if (isTransposed) {
        expect(hiddenSwitch).not.toBeInTheDocument();
      } else {
        expect(hiddenSwitch).toBeInTheDocument();
      }
    });
  });

  describe('progress bar', () => {
    it('offers the "Progress bar" decoration for numeric, non-bucketed columns', async () => {
      mockFirstColumn({ dataType: 'number' });
      renderTableDimensionEditor();

      await btnGroups.colorMode.select(getDynamicColoringLabel('progress'));
      await act(async () => jest.advanceTimersByTime(256));

      expect(props.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: [expect.objectContaining({ colorMode: 'progress' })],
        })
      );
    });

    it('does not offer "Progress bar" for bucketed (terms) columns', async () => {
      mockFirstColumn({ isBucketed: true, dataType: 'string' });
      renderTableDimensionEditor();

      await btnGroups.colorMode.select(getDynamicColoringLabel('progress'));
      await act(async () => jest.advanceTimersByTime(256));

      // No "progress" colorMode should ever be produced for a terms column.
      const calls = (props.setState as jest.Mock).mock.calls;
      const producedProgress = calls.some(([next]) =>
        next?.columns?.some((c: ColumnState) => c.colorMode === 'progress')
      );
      expect(producedProgress).toBe(false);
    });

    it('seeds a default progress config and forces non-center alignment when selected', async () => {
      mockFirstColumn({ dataType: 'number' });
      state.columns[0].alignment = 'center';
      renderTableDimensionEditor();

      await btnGroups.colorMode.select(getDynamicColoringLabel('progress'));
      await act(async () => jest.advanceTimersByTime(256));

      expect(props.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: [
            expect.objectContaining({
              colorMode: 'progress',
              alignment: 'right',
              fillStyle: expect.objectContaining({ fillMode: 'single' }),
            }),
          ],
        })
      );
    });

    it('disables the Center alignment option in progress mode', () => {
      mockFirstColumn({ dataType: 'number' });
      state.columns[0].colorMode = 'progress';
      state.columns[0].fillStyle = { fillMode: 'single' };
      renderTableDimensionEditor();

      const centerButton = screen.getByTestId('lnsDatatable_alignment_groups_center');
      expect(centerButton).toBeDisabled();
    });

    it('renders progress bar controls (Bar color + Value range) in progress mode', () => {
      mockFirstColumn({ dataType: 'number' });
      state.columns[0].colorMode = 'progress';
      state.columns[0].fillStyle = { fillMode: 'single' };
      renderTableDimensionEditor();

      expect(screen.getByTestId('lnsDatatable_progressBar_barColor')).toBeInTheDocument();
      expect(screen.getByTestId('lnsDatatable_progressBar_valueRange')).toBeInTheDocument();
      // Single bar color exposes the EuiColorPicker, labeled "Color".
      expect(screen.getByLabelText('Color')).toBeInTheDocument();
    });

    it('hides the dual range slider for an auto value range', () => {
      mockFirstColumn({ dataType: 'number' });
      state.columns[0].colorMode = 'progress';
      state.columns[0].fillStyle = { fillMode: 'single', valueRange: { mode: 'auto' } };
      renderTableDimensionEditor();

      // The `inputWithPopover` dual range exposes two number inputs; none are
      // rendered while the range is auto.
      expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    });

    it('shows the dual range slider only when value range is custom', () => {
      mockFirstColumn({ dataType: 'number' });
      state.columns[0].colorMode = 'progress';
      state.columns[0].fillStyle = {
        fillMode: 'single',
        valueRange: { mode: 'custom', min: 0, max: 10 },
      };
      renderTableDimensionEditor();

      // EUI's `inputWithPopover` dual range renders the bounds as two number
      // inputs (the test-subj does not forward to a single queryable node), so
      // assert on the rendered min/max spinbuttons instead.
      const spinbuttons = screen.getAllByRole('spinbutton');
      expect(spinbuttons).toHaveLength(2);
      spinbuttons.forEach((input) => {
        // Regression guard for the ±Infinity continuity bug: every bound the
        // slider receives must be finite.
        expect(Number.isFinite(Number(input.getAttribute('min')))).toBe(true);
        expect(Number.isFinite(Number(input.getAttribute('max')))).toBe(true);
      });
    });

    it('gives the custom range slider headroom below the current min so it can be pulled down', () => {
      mockFirstColumn({ dataType: 'number' });
      state.columns[0].colorMode = 'progress';
      state.columns[0].fillStyle = {
        fillMode: 'single',
        valueRange: { mode: 'custom', min: 0, max: 10 },
      };
      renderTableDimensionEditor();

      // The number inputs carry the slider bounds; the lower bound must extend
      // below the current min (0) so a custom min below 0 is selectable.
      const [minInput] = screen.getAllByRole('spinbutton');
      expect(Number(minInput.getAttribute('min'))).toBeLessThan(0);
    });

    it('renders a finite custom range slider for a solid fill with open-ended palette bounds', () => {
      // Regression: default by-value palettes store open-ended continuities as
      // ±Infinity on the palette params. A solid fill with a custom range read
      // those directly and crashed / produced NaN slider inputs.
      mockFirstColumn({ dataType: 'number' });
      state.columns[0].colorMode = 'progress';
      state.columns[0].fillStyle = { fillMode: 'solid', valueRange: { mode: 'custom' } };
      state.columns[0].palette = {
        type: 'palette',
        name: 'custom',
        params: { rangeMin: Number.NEGATIVE_INFINITY, rangeMax: Number.POSITIVE_INFINITY },
      };
      renderTableDimensionEditor();

      const spinbuttons = screen.getAllByRole('spinbutton');
      expect(spinbuttons).toHaveLength(2);
      spinbuttons.forEach((input) => {
        expect(Number.isFinite(Number(input.getAttribute('min')))).toBe(true);
        expect(Number.isFinite(Number(input.getAttribute('max')))).toBe(true);
        expect(input.getAttribute('value')).not.toBe('');
      });
    });

    it('retains the last custom range when toggling Custom -> Auto (single fill)', async () => {
      mockFirstColumn({ dataType: 'number' });
      state.columns[0].colorMode = 'progress';
      state.columns[0].fillStyle = {
        fillMode: 'single',
        valueRange: { mode: 'custom', min: -5, max: 25 },
      };
      renderTableDimensionEditor();

      // Toggle the value range to Auto.
      await act(async () => screen.getByTestId('lnsDatatable_progressBar_valueRange_auto').click());
      await act(async () => jest.advanceTimersByTime(256));

      // The committed bounds survive on `fillStyle.valueRange` (inert under Auto)
      // so they can be restored on the next switch to Custom.
      expect(props.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: [
            expect.objectContaining({
              fillStyle: expect.objectContaining({
                valueRange: { mode: 'auto', min: -5, max: 25 },
              }),
            }),
          ],
        })
      );
    });

    it('restores the remembered custom bounds when switching Auto -> Custom (single fill)', async () => {
      mockFirstColumn({ dataType: 'number' });
      // Auto mode but with previously committed bounds remembered on valueRange.
      state.columns[0].colorMode = 'progress';
      state.columns[0].fillStyle = {
        fillMode: 'single',
        valueRange: { mode: 'auto', min: -5, max: 25 },
      };
      renderTableDimensionEditor();

      await act(async () =>
        screen.getByTestId('lnsDatatable_progressBar_valueRange_custom').click()
      );
      await act(async () => jest.advanceTimersByTime(256));

      // The committed Custom range is seeded from the remembered bounds (-5, 25),
      // not reset to the data bounds.
      expect(props.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: [
            expect.objectContaining({
              fillStyle: expect.objectContaining({
                valueRange: { mode: 'custom', min: -5, max: 25 },
              }),
            }),
          ],
        })
      );
    });

    it('renders the remembered bounds on the slider for a custom range', () => {
      mockFirstColumn({ dataType: 'number' });
      state.columns[0].colorMode = 'progress';
      state.columns[0].fillStyle = {
        fillMode: 'single',
        valueRange: { mode: 'custom', min: -5, max: 25 },
      };
      renderTableDimensionEditor();

      const [minInput, maxInput] = screen.getAllByRole('spinbutton');
      expect(minInput).toHaveValue(-5);
      expect(maxInput).toHaveValue(25);
    });

    it('drops progress config when switching away from progress mode', async () => {
      mockFirstColumn({ dataType: 'number' });
      state.columns[0].colorMode = 'progress';
      state.columns[0].fillStyle = { fillMode: 'single' };
      renderTableDimensionEditor();

      await btnGroups.colorMode.select('Background');
      await act(async () => jest.advanceTimersByTime(256));

      expect(props.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: [expect.objectContaining({ colorMode: 'cell', fillStyle: undefined })],
        })
      );
    });
  });
});
