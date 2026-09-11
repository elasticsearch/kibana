/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type {
  GeometryValue,
  XYChartSeriesIdentifier,
  TooltipAction,
  TooltipValue,
} from '@elastic/charts';
import { Settings, TooltipType, Heatmap, Tooltip } from '@elastic/charts';
import { chartPluginMock } from '@kbn/charts-plugin/public/mocks';
import { EmptyPlaceholder } from '@kbn/charts-plugin/public';
import { createDatatableUtilitiesMock } from '@kbn/data-plugin/common/mocks';
import { ESQL_TABLE_TYPE } from '@kbn/data-plugin/common';
import { fieldFormatsServiceMock } from '@kbn/field-formats-plugin/public/mocks';
import type { Datatable } from '@kbn/expressions-plugin/public';
import { mountWithIntl, shallowWithIntl } from '@kbn/test-jest-helpers';
import { findTestSubject } from '@elastic/eui/lib/test';
import { act } from 'react-dom/test-utils';
import type { HeatmapRenderProps, HeatmapArguments } from '../../common';
import HeatmapComponent, {
  computeMinIntervalFromData,
  getDateFormatPattern,
} from './heatmap_component';
import { LegendSize } from '@kbn/chart-expressions-common';
import type { FieldFormat } from '@kbn/field-formats-plugin/common';

const actWithTimeout = (action: Function, timer: number = 1) =>
  act(
    () =>
      new Promise((resolve) =>
        setTimeout(async () => {
          await action();
          resolve(void 0);
        }, timer)
      )
  );
const chartStartContract = chartPluginMock.createStartContract();
const chartsThemeService = chartPluginMock.createSetupContract().theme;
const chartsActiveCursorService = chartStartContract.activeCursor;
const palettesRegistry = chartPluginMock.createPaletteRegistry();
const formatService = fieldFormatsServiceMock.createStartContract();
const args: HeatmapArguments = {
  percentageMode: false,
  legend: {
    isVisible: true,
    position: 'top',
    type: 'heatmap_legend',
    legendSize: LegendSize.SMALL,
  },
  gridConfig: {
    isCellLabelVisible: true,
    isYAxisLabelVisible: true,
    isXAxisLabelVisible: true,
    isYAxisTitleVisible: true,
    isXAxisTitleVisible: true,
    type: 'heatmap_grid',
  },
  palette: {
    type: 'palette',
    name: '',
    params: {
      colors: ['rgb(0, 0, 0)', 'rgb(112, 38, 231)'],
      stops: [0, 150],
      gradient: false,
      rangeMin: 0,
      rangeMax: 150,
      range: 'number',
    },
  },
  showTooltip: true,
  highlightInHover: false,
  xAccessor: 'col-1-2',
  valueAccessor: 'col-0-1',
  yAccessor: 'col-2-3',
};
const data: Datatable = {
  type: 'datatable',
  rows: [
    { 'col-0-1': 0, 'col-1-2': 'a', 'col-2-3': 'd' },
    { 'col-0-1': 148, 'col-1-2': 'b', 'col-2-3': 'c' },
  ],
  columns: [
    { id: 'col-0-1', name: 'Count', meta: { type: 'number' } },
    { id: 'col-1-2', name: 'Dest', meta: { type: 'string' } },
    { id: 'col-2-3', name: 'Test', meta: { type: 'string' } },
  ],
};

const mockState = new Map();
const uiState = {
  get: jest
    .fn()
    .mockImplementation((key, fallback) => (mockState.has(key) ? mockState.get(key) : fallback)),
  set: jest.fn().mockImplementation((key, value) => mockState.set(key, value)),
  emit: jest.fn(),
  setSilent: jest.fn(),
} as any;

describe('HeatmapComponent', function () {
  let wrapperProps: HeatmapRenderProps;

  beforeAll(() => {
    wrapperProps = {
      data,
      chartsThemeService,
      chartsActiveCursorService,
      args,
      uiState,
      onClickValue: jest.fn(),
      onSelectRange: jest.fn(),
      onClickMultiValue: jest.fn(),
      datatableUtilities: createDatatableUtilitiesMock(),
      paletteService: palettesRegistry,
      formatFactory: formatService.deserialize,
      interactive: true,
      syncTooltips: false,
      syncCursor: true,
      renderComplete: jest.fn(),
    };
  });

  it('renders the legend on the correct position', () => {
    const component = shallowWithIntl(<HeatmapComponent {...wrapperProps} />);
    expect(component.find(Settings).prop('legendPosition')).toEqual('top');
  });

  it('sets correct legend sizes', () => {
    const component = shallowWithIntl(<HeatmapComponent {...wrapperProps} />);
    expect(component.find(Settings).prop('legendSize')).toEqual(80);

    component.setProps({
      args: {
        ...args,
        legend: {
          ...args.legend,
          legendSize: LegendSize.AUTO,
        },
      },
    });
    expect(component.find(Settings).prop('legendSize')).toBeUndefined();

    component.setProps({
      args: {
        ...args,
        legend: {
          ...args.legend,
          legendSize: undefined,
        },
      },
    });
    expect(component.find(Settings).prop('legendSize')).toEqual(130);
  });

  it('renders the legend toggle component if uiState is set', async () => {
    const component = mountWithIntl(<HeatmapComponent {...wrapperProps} />);
    await actWithTimeout(async () => {
      await component.update();
    });
    await act(async () => {
      expect(findTestSubject(component, 'vislibToggleLegend').length).toBe(1);
    });
  });

  it('not renders the legend toggle component if uiState is undefined', async () => {
    const newProps = { ...wrapperProps, uiState: undefined } as unknown as HeatmapRenderProps;
    const component = mountWithIntl(<HeatmapComponent {...newProps} />);
    await actWithTimeout(async () => {
      await component.update();
    });
    await act(async () => {
      expect(findTestSubject(component, 'vislibToggleLegend').length).toBe(0);
    });
  });

  it('renders the legendColorPicker if uiState is set', async () => {
    const component = mountWithIntl(<HeatmapComponent {...wrapperProps} />);
    await actWithTimeout(async () => {
      await component.update();
    });
    await act(async () => {
      expect(component.find(Settings).prop('legendColorPicker')).toBeDefined();
    });
  });

  it('not renders the legendColorPicker if uiState is undefined', async () => {
    const newProps = { ...wrapperProps, uiState: undefined } as unknown as HeatmapRenderProps;
    const component = mountWithIntl(<HeatmapComponent {...newProps} />);
    await actWithTimeout(async () => {
      await component.update();
    });
    await act(async () => {
      expect(component.find(Settings).prop('legendColorPicker')).toBeUndefined();
    });
  });

  it('computes the bands correctly for infinite bounds', async () => {
    const component = mountWithIntl(<HeatmapComponent {...wrapperProps} />);
    await act(async () => {
      expect(component.find(Heatmap).prop('colorScale')).toEqual({
        bands: [
          { color: 'rgb(0, 0, 0)', end: 0, start: 0 },
          { color: 'rgb(112, 38, 231)', end: Infinity, start: 0 },
        ],
        type: 'bands',
      });
    });
  });

  it('computes the bands correctly for distinct bounds', async () => {
    const newProps = {
      ...wrapperProps,
      args: { ...wrapperProps.args, lastRangeIsRightOpen: false },
    } as unknown as HeatmapRenderProps;
    const component = mountWithIntl(<HeatmapComponent {...newProps} />);
    await act(async () => {
      expect(component.find(Heatmap).prop('colorScale')).toEqual({
        bands: [
          { color: 'rgb(0, 0, 0)', end: 0, start: 0 },
          { color: 'rgb(112, 38, 231)', end: 150.00001, start: 0 },
        ],
        type: 'bands',
      });
    });
  });

  it('computes the bands correctly if only value accessor is provided', async () => {
    const newData: Datatable = {
      type: 'datatable',
      rows: [{ 'col-0-1': 571.806 }],
      columns: [{ id: 'col-0-1', name: 'Count', meta: { type: 'number' } }],
    };
    const newProps = {
      ...wrapperProps,
      data: newData,
      args: { ...wrapperProps.args, lastRangeIsRightOpen: false },
    } as unknown as HeatmapRenderProps;
    const component = mountWithIntl(<HeatmapComponent {...newProps} />);
    await act(async () => {
      expect(component.find(Heatmap).prop('colorScale')).toEqual({
        bands: [
          { color: 'rgb(0, 0, 0)', end: 0, start: 0 },
          { color: 'rgb(112, 38, 231)', end: Infinity, start: 0 },
        ],
        type: 'bands',
      });
    });
  });

  it('computes should recompute the bands when range is relative (percent)', async () => {
    const newData: Datatable = {
      type: 'datatable',
      rows: [{ 'col-0-1': 3 }],
      columns: [{ id: 'col-0-1', name: 'Count', meta: { type: 'number' } }],
    };
    const newProps = {
      ...wrapperProps,
      data: newData,
      args: {
        ...wrapperProps.args,
        palette: {
          params: {
            colors: ['#6092c0', '#a8bfda', '#ebeff5', '#ecb385', '#e7664c'],
            stops: [19.98, 39.88, 60, 80, 100],
            range: 'percent',
            gradient: true,
            continuity: 'above',
            rangeMin: 0,
            rangeMax: null,
          },
        },
      },
    } as unknown as HeatmapRenderProps;
    const component = mountWithIntl(<HeatmapComponent {...newProps} />);
    await act(async () => {
      expect(component.find(Heatmap).prop('colorScale')).toEqual({
        bands: [
          {
            start: 3,
            end: 3,
            color: '#6092c0',
          },
          {
            start: 3,
            end: 3,
            color: '#a8bfda',
          },
          {
            start: 3,
            end: 3,
            color: '#ebeff5',
          },
          {
            start: 3,
            end: 3,
            color: '#ecb385',
          },
          {
            start: 3,
            end: Infinity,
            color: '#e7664c',
          },
        ],
        type: 'bands',
      });
    });
  });

  it('computed the bands correctly for number range palettes when a single value is provided', () => {
    const newData: Datatable = {
      type: 'datatable',
      rows: [{ 'col-0-1': 2 }],
      columns: [{ id: 'col-0-1', name: 'Count', meta: { type: 'number' } }],
    };
    const newProps = {
      ...wrapperProps,
      data: newData,
      args: {
        ...wrapperProps.args,
        palette: {
          params: {
            colors: ['#6092c0', '#a8bfda', '#ebeff5', '#ecb385', '#e7664c'],
            stops: [323.39, 362.8, 402.2, 500, 501],
            range: 'number',
            gradient: true,
            continuity: 'above',
            rangeMin: 284,
            rangeMax: null,
          },
        },
      },
    } as unknown as HeatmapRenderProps;
    const component = mountWithIntl(<HeatmapComponent {...newProps} />);
    act(() => {
      expect(component.find(Heatmap).prop('colorScale')).toEqual({
        bands: [
          {
            start: 284,
            end: 323.39,
            color: '#6092c0',
          },
          {
            start: 323.39,
            end: 362.8,
            color: '#a8bfda',
          },
          {
            start: 362.8,
            end: 402.2,
            color: '#ebeff5',
          },
          {
            start: 402.2,
            end: 500,
            color: '#ecb385',
          },
          {
            start: 500,
            end: Infinity,
            color: '#e7664c',
          },
        ],
        type: 'bands',
      });
    });
  });

  it('should keep the minimum open end', () => {
    const newData: Datatable = {
      type: 'datatable',
      rows: [{ 'col-0-1': -3 }],
      columns: [{ id: 'col-0-1', name: 'Count', meta: { type: 'number' } }],
    };
    const newProps = {
      ...wrapperProps,
      data: newData,
      args: {
        ...wrapperProps.args,
        palette: {
          params: {
            colors: ['#6092c0', '#a8bfda', '#ebeff5', '#ecb385', '#e7664c'],
            stops: [1, 2, 3, 4, 5],
            range: 'number',
            gradient: true,
            continuity: 'above',
            rangeMin: -Infinity,
            rangeMax: null,
          },
        },
      },
    } as unknown as HeatmapRenderProps;
    const component = mountWithIntl(<HeatmapComponent {...newProps} />);
    expect(component.find(Heatmap).prop('colorScale')).toEqual({
      bands: [
        {
          start: -Infinity,
          end: 1,
          color: '#6092c0',
        },
        {
          start: 1,
          end: 2,
          color: '#a8bfda',
        },
        {
          start: 2,
          end: 3,
          color: '#ebeff5',
        },
        {
          start: 3,
          end: 4,
          color: '#ecb385',
        },
        {
          start: 4,
          end: Infinity,
          color: '#e7664c',
        },
      ],
      type: 'bands',
    });
  });

  it('renders the axis titles', () => {
    const component = shallowWithIntl(<HeatmapComponent {...wrapperProps} />);
    expect(component.find(Heatmap).prop('xAxisTitle')).toEqual('Dest');
    expect(component.find(Heatmap).prop('yAxisTitle')).toEqual('Test');
  });

  it('renders custom axis titles if given', () => {
    const newProps = {
      ...wrapperProps,
      args: {
        ...wrapperProps.args,
        gridConfig: { ...wrapperProps.args.gridConfig, xTitle: 'test1', yTitle: 'test2' },
      },
    } as unknown as HeatmapRenderProps;
    const component = shallowWithIntl(<HeatmapComponent {...newProps} />);
    expect(component.find(Heatmap).prop('xAxisTitle')).toEqual('test1');
    expect(component.find(Heatmap).prop('yAxisTitle')).toEqual('test2');
  });

  it('hides the legend if the legend isVisible args is false', async () => {
    const newProps = {
      ...wrapperProps,
      args: { ...wrapperProps.args, legend: { ...wrapperProps.args.legend, isVisible: false } },
    } as unknown as HeatmapRenderProps;
    const component = mountWithIntl(<HeatmapComponent {...newProps} />);
    expect(component.find(Settings).prop('showLegend')).toEqual(false);
  });

  it('defaults on displaying the tooltip', () => {
    const component = shallowWithIntl(<HeatmapComponent {...wrapperProps} />);
    expect(component.find(Tooltip).prop('type')).toBe(TooltipType.Follow);
  });

  it('hides the legend if the showTooltip is false', async () => {
    const newProps = {
      ...wrapperProps,
      args: { ...wrapperProps.args, showTooltip: false },
    } as unknown as HeatmapRenderProps;
    const component = mountWithIntl(<HeatmapComponent {...newProps} />);
    expect(component.find(Tooltip).prop('type')).toBe(TooltipType.None);
  });

  it('not renders the component if no value accessor is given', () => {
    const newProps = { ...wrapperProps, valueAccessor: undefined } as unknown as HeatmapRenderProps;
    const component = mountWithIntl(<HeatmapComponent {...newProps} />);
    expect(component).toEqual({});
  });

  it('renders the EmptyPlaceholder if no data are provided', () => {
    const newData: Datatable = {
      type: 'datatable',
      rows: [],
      columns: [
        { id: 'col-0-1', name: 'Count', meta: { type: 'number' } },
        { id: 'col-1-2', name: 'Dest', meta: { type: 'string' } },
      ],
    };
    const newProps = { ...wrapperProps, data: newData };
    const component = mountWithIntl(<HeatmapComponent {...newProps} />);
    expect(component.find(EmptyPlaceholder).length).toBe(1);
  });

  it('preformats non-primitive types in the data table before passing it to the chart and maps them back in the click handler', () => {
    const component = shallowWithIntl(
      <HeatmapComponent
        {...wrapperProps}
        formatFactory={(format) =>
          format?.id === 'string'
            ? ({ convertToText: (v: unknown) => String(v) } as unknown as FieldFormat)
            : ({ convertToText: (v: unknown) => v } as unknown as FieldFormat)
        }
        data={{
          ...data,
          columns: [
            { id: 'col-0-1', name: 'Count', meta: { type: 'number' } },
            { id: 'col-1-2', name: 'Dest', meta: { type: 'string', params: { id: 'string' } } },
            { id: 'col-2-3', name: 'Test', meta: { type: 'string', params: { id: 'string' } } },
          ],
          rows: [
            ...data.rows,
            { 'col-0-1': 148, 'col-1-2': { complex: 'object' }, 'col-2-3': { weird: 'object' } },
          ],
        }}
      />
    );
    expect(component.find(Heatmap).prop('data')).toEqual([
      ...data.rows,
      { 'col-0-1': 148, 'col-1-2': '[object Object]', 'col-2-3': '[object Object]' },
    ]);
    // clicking the "object" row
    component.find(Settings).first().prop('onElementClick')!([
      [
        {
          datum: {
            x: '[object Object]',
            y: 'ES-Air',
          },
        } as unknown as GeometryValue,
        {
          specId: 'heatmap',
          key: 'spec{heatmap}',
        } as unknown as XYChartSeriesIdentifier,
      ],
    ]);
    expect(wrapperProps.onClickValue).toHaveBeenCalledWith({
      data: [expect.objectContaining({ row: 2 }), expect.anything()],
    });

    // clicking the "object" column
    component.find(Settings).first().prop('onElementClick')!([
      [
        {
          datum: {
            x: 'ES-Air',
            y: '[object Object]',
          },
        } as unknown as GeometryValue,
        {
          specId: 'heatmap',
          key: 'spec{heatmap}',
        } as unknown as XYChartSeriesIdentifier,
      ],
    ]);
    expect(wrapperProps.onClickValue).toHaveBeenCalledWith({
      data: [expect.anything(), expect.objectContaining({ row: 2 })],
    });
  });

  it('calls filter callback', () => {
    const component = shallowWithIntl(<HeatmapComponent {...wrapperProps} />);
    component.find(Settings).first().prop('onElementClick')!([
      [
        {
          x: 436.68671874999995,
          y: 1,
          yIndex: 0,
          width: 143.22890625,
          height: 198.5,
          datum: {
            x: 'Vienna International Airport',
            y: 'ES-Air',
            value: 6,
            originalIndex: 12,
          },
          fill: {
            color: [78, 175, 98, 1],
          },
          stroke: {
            color: [128, 128, 128, 1],
            width: 0,
          },
          value: 6,
          visible: true,
          formatted: '6',
          fontSize: 18,
          textColor: 'rgba(0, 0, 0, 1)',
        },
        {
          specId: 'heatmap',
          key: 'spec{heatmap}',
        },
      ],
    ]);
    expect(wrapperProps.onClickValue).toHaveBeenCalled();
  });

  it('does not add callbacks when not interactive', () => {
    const component = shallowWithIntl(<HeatmapComponent {...wrapperProps} interactive={false} />);
    expect(component.find(Settings).first().prop('onElementClick')).toBeUndefined();
    expect(component.find(Settings).first().prop('onBrushEnd')).toBeUndefined();
  });

  describe('overrides', () => {
    it('should apply overrides to the settings component', () => {
      const component = shallowWithIntl(
        <HeatmapComponent
          {...wrapperProps}
          overrides={{ settings: { onBrushEnd: 'ignore', ariaUseDefaultSummary: true } }}
        />
      );

      const settingsComponent = component.find(Settings);
      expect(settingsComponent.prop('onBrushEnd')).toBeUndefined();
      expect(settingsComponent.prop('ariaUseDefaultSummary')).toEqual(true);
    });
  });

  describe('tooltip', () => {
    it('should not have actions if chart is not interactive', () => {
      const component = shallowWithIntl(<HeatmapComponent {...wrapperProps} interactive={false} />);
      const tooltip = component.find(Tooltip);
      const actions = tooltip.prop('actions');
      expect(actions).toBeUndefined();
    });
    it('should have tooltip actions when the chart is fully configured and interactive', () => {
      const component = shallowWithIntl(<HeatmapComponent {...wrapperProps} />);
      const tooltip = component.find(Tooltip);
      const actions = tooltip.prop('actions');
      expect(actions?.length).toBe(1);
      expect(actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            onSelect: expect.any(Function),
            disabled: expect.any(Function),
          }),
        ])
      );
    });

    it('selecting correct actions calls a callback with correct filter data', () => {
      const component = shallowWithIntl(<HeatmapComponent {...wrapperProps} />);
      const tooltip = component.find(Tooltip);
      const actions = tooltip.prop('actions') as TooltipAction[];
      actions[0].onSelect!(
        [
          {
            label: 'Dest',
            datum: {
              x: 'a',
              y: 'd',
              value: 0,
              originalIndex: 0,
            },
          } as TooltipValue,
          {
            label: 'Test',
            datum: {
              x: 'a',
              y: 'd',
              value: 0,
              originalIndex: 0,
            },
          } as TooltipValue,
        ],
        []
      );
      expect(wrapperProps.onClickMultiValue).toHaveBeenCalledWith({
        data: [
          {
            cells: [
              { column: 1, row: 0 },
              { column: 2, row: 0 },
            ],
            table: wrapperProps.data,
          },
        ],
      });
    });
  });

  describe('time-based heatmap with ES|QL data', () => {
    const timeArgs: HeatmapArguments = {
      ...args,
      xAccessor: 'timestamp',
      yAccessor: 'category',
      valueAccessor: 'value',
      gridConfig: {
        ...args.gridConfig,
        xScaleType: 'time',
      },
    };

    const buildTimeData = (
      rows: Array<Record<string, string | number>>,
      timestampMeta: Datatable['columns'][number]['meta'] = { type: 'date' }
    ): Datatable => ({
      type: 'datatable',
      meta: { type: ESQL_TABLE_TYPE },
      columns: [
        { id: 'timestamp', name: 'timestamp', meta: timestampMeta },
        { id: 'category', name: 'category', meta: { type: 'string' } },
        { id: 'value', name: 'value', meta: { type: 'number' } },
      ] satisfies Datatable['columns'],
      rows,
    });

    const renderHeatmap = async (timeData: Datatable, heatmapArgs: HeatmapArguments = timeArgs) => {
      const component = mountWithIntl(
        <HeatmapComponent {...wrapperProps} data={timeData} args={heatmapArgs} />
      );
      await act(async () => {
        await component.update();
      });
      return component.find(Heatmap);
    };

    const renderXScale = async (timeData: Datatable) => {
      const heatmap = await renderHeatmap(timeData);
      return heatmap.prop('xScale');
    };

    it('renders time-based heatmap with ES|QL data using the bucket interval', async () => {
      const xScale = await renderXScale(
        buildTimeData(
          [
            { timestamp: '2024-01-01T00:00:00.000Z', category: 'A', value: 10 },
            { timestamp: '2024-01-01T00:01:00.000Z', category: 'A', value: 20 },
            { timestamp: '2024-01-01T00:02:00.000Z', category: 'B', value: 15 },
          ],
          { type: 'date', esMeta: { bucket: { interval: 1, unit: 'minute' } } }
        )
      );

      expect(xScale).toEqual({
        type: 'time',
        interval: { type: 'calendar', unit: 'm', value: 1 },
      });
    });

    it('falls back to a fixed ms interval when parseEsInterval rejects the bucket interval', async () => {
      // "2w" is a valid moment duration but parseEsInterval throws because calendar weeks
      // only allow value = 1. The scale should still be time-based, using the parsed ms value.
      const xScale = await renderXScale(
        buildTimeData(
          [
            { timestamp: '2024-01-01T00:00:00.000Z', category: 'A', value: 10 },
            { timestamp: '2024-01-15T00:00:00.000Z', category: 'A', value: 20 },
          ],
          { type: 'date', esMeta: { bucket: { interval: 2, unit: 'week' } } }
        )
      );

      const twoWeeksMs = 2 * 7 * 24 * 60 * 60 * 1000;
      expect(xScale).toEqual({
        type: 'time',
        interval: { type: 'fixed', unit: 'ms', value: twoWeeksMs },
      });
    });

    it('computes the interval from row spacing when no bucket metadata is available', async () => {
      // Without esMeta.bucket there is no dateHistogramMeta.interval, so both parseEsInterval and
      // parseInterval short-circuit and the scale must be inferred from computeMinIntervalFromData.
      const fiveMinutesMs = 5 * 60 * 1000;
      const xScale = await renderXScale(
        buildTimeData([
          { timestamp: '2024-01-01T00:00:00.000Z', category: 'A', value: 10 },
          { timestamp: '2024-01-01T00:05:00.000Z', category: 'A', value: 20 },
          { timestamp: '2024-01-01T00:10:00.000Z', category: 'B', value: 15 },
        ])
      );

      expect(xScale).toEqual({
        type: 'time',
        interval: { type: 'fixed', unit: 'ms', value: fiveMinutesMs },
      });
    });

    it('falls back to a linear scale when no interval can be computed', async () => {
      // >1 row (to bypass the ordinal early return) but all identical timestamps means the Set of
      // unique values has size 1, so computeMinIntervalFromData returns undefined too.
      const xScale = await renderXScale(
        buildTimeData([
          { timestamp: '2024-01-01T00:00:00.000Z', category: 'A', value: 10 },
          { timestamp: '2024-01-01T00:00:00.000Z', category: 'B', value: 20 },
        ])
      );

      expect(xScale).toEqual({ type: 'linear' });
    });

    it('falls back to an ordinal scale for a single row even when a time scale is requested', async () => {
      // computeXScale short-circuits to Ordinal for chartData.length <= 1 before any time logic.
      const xScale = await renderXScale(
        buildTimeData([{ timestamp: '2024-01-01T00:00:00.000Z', category: 'A', value: 10 }], {
          type: 'date',
          esMeta: { bucket: { interval: 1, unit: 'minute' } },
        })
      );

      expect(xScale).toEqual({ type: 'ordinal' });
    });

    it('forces a Time scale for an ES|QL date x-axis even when xScaleType is not "time"', async () => {
      // Regression coverage for the reload case: after reload gridConfig.xScaleType is no longer
      // 'time' (here 'ordinal'), but an ES|QL date x-column is inherently chronological, so the
      // component must still force a Time scale and drop the configured xSortPredicate.
      const ordinalArgs: HeatmapArguments = {
        ...timeArgs,
        gridConfig: {
          ...timeArgs.gridConfig,
          xScaleType: 'ordinal',
          xSortPredicate: 'asc',
        },
      };

      const fiveMinutesMs = 5 * 60 * 1000;
      const heatmap = await renderHeatmap(
        buildTimeData([
          { timestamp: '2024-01-01T00:00:00.000Z', category: 'A', value: 10 },
          { timestamp: '2024-01-01T00:05:00.000Z', category: 'A', value: 20 },
          { timestamp: '2024-01-01T00:10:00.000Z', category: 'B', value: 15 },
        ]),
        ordinalArgs
      );

      expect(heatmap.prop('xScale')).toEqual({
        type: 'time',
        interval: { type: 'fixed', unit: 'ms', value: fiveMinutesMs },
      });
      expect(heatmap.prop('xSortPredicate')).toBeUndefined();
    });

    it('brushes a time range filter even when no bucket metadata is available', async () => {
      const onSelectRange = jest.fn();
      const onClickValue = jest.fn();
      const component = mountWithIntl(
        <HeatmapComponent
          {...wrapperProps}
          data={buildTimeData([
            { timestamp: '2024-01-01T00:00:00.000Z', category: 'A', value: 10 },
            { timestamp: '2024-01-01T00:05:00.000Z', category: 'A', value: 20 },
            { timestamp: '2024-01-01T00:10:00.000Z', category: 'B', value: 15 },
          ])}
          args={timeArgs}
          onSelectRange={onSelectRange}
          onClickValue={onClickValue}
        />
      );
      await act(async () => {
        await component.update();
      });

      const onBrushEnd = component.find(Settings).first().prop('onBrushEnd') as (e: {
        x: number[];
        y: unknown[];
      }) => void;
      const range = [1704067200000, 1704067800000];
      onBrushEnd({ x: range, y: [] });

      expect(onSelectRange).toHaveBeenCalledTimes(1);
      expect(onClickValue).not.toHaveBeenCalled();
      expect(onSelectRange.mock.calls[0][0]).toEqual(expect.objectContaining({ range }));
    });
  });

  describe('getDateFormatPattern', () => {
    it('selects correct pattern based on interval', () => {
      const mockUISettings = {
        get: (key: string) => {
          if (key === 'dateFormat:scaled') {
            return [
              ['', 'HH:mm:ss.SSS'],
              ['PT1S', 'HH:mm:ss'],
              ['PT1M', 'HH:mm'],
              ['PT1H', 'YYYY-MM-DD HH:mm'],
            ];
          }
          return 'YYYY-MM-DD';
        },
      } as any;

      expect(getDateFormatPattern(500, mockUISettings)).toBe('HH:mm:ss.SSS');
      expect(getDateFormatPattern(1500, mockUISettings)).toBe('HH:mm:ss');
      expect(getDateFormatPattern(60000, mockUISettings)).toBe('HH:mm');
      expect(getDateFormatPattern(3600000, mockUISettings)).toBe('YYYY-MM-DD HH:mm');
    });

    it('returns undefined when intervalMs is not provided', () => {
      const mockUISettings = {
        get: jest.fn(),
      } as any;

      expect(getDateFormatPattern(undefined, mockUISettings)).toBeUndefined();
    });

    it('returns undefined when uiSettings is not provided', () => {
      expect(getDateFormatPattern(1000, undefined)).toBeUndefined();
    });

    it('returns default date format when no rules match', () => {
      const mockUISettings = {
        get: (key: string) => {
          if (key === 'dateFormat:scaled') {
            return [];
          }
          return 'YYYY-MM-DD';
        },
      } as any;

      expect(getDateFormatPattern(1000, mockUISettings)).toBe('YYYY-MM-DD');
    });
  });

  describe('computeMinIntervalFromData', () => {
    it('computes minimum interval from timestamp data', () => {
      const timestampData = [
        { x: 1000, y: 'a', value: 1 },
        { x: 2000, y: 'a', value: 2 },
        { x: 3500, y: 'b', value: 3 },
      ];
      expect(computeMinIntervalFromData(timestampData, 'x')).toBe(1000);
    });

    it('returns undefined for insufficient data', () => {
      const singleRow = [{ x: 1000, y: 'a', value: 1 }];
      expect(computeMinIntervalFromData(singleRow, 'x')).toBeUndefined();
    });

    it('returns undefined for empty data', () => {
      expect(computeMinIntervalFromData([], 'x')).toBeUndefined();
    });

    it('returns undefined when xAccessor is not provided', () => {
      const timestampData = [
        { x: 1000, y: 'a', value: 1 },
        { x: 2000, y: 'a', value: 2 },
      ];
      expect(computeMinIntervalFromData(timestampData, undefined)).toBeUndefined();
    });
  });
});
