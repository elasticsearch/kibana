/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC } from 'react';
import React, { memo, useMemo, useState, useCallback, useRef } from 'react';
import moment from 'moment';
import { ESQL_TABLE_TYPE } from '@kbn/data-plugin/common';
import type {
  ElementClickListener,
  BrushEndListener,
  HeatmapBrushEvent,
  HeatmapElementEvent,
  HeatmapSpec,
  ESFixedIntervalUnit,
  ESCalendarIntervalUnit,
  PartialTheme,
  SettingsProps,
  SeriesIdentifier,
  TooltipValue,
  PointerValue,
} from '@elastic/charts';
import { Chart, Heatmap, ScaleType, Settings, TooltipType, Tooltip } from '@elastic/charts';
import type { CustomPaletteState } from '@kbn/charts-plugin/public';
import { search } from '@kbn/data-plugin/public';
import { LegendToggle, EmptyPlaceholder, useActiveCursor } from '@kbn/charts-plugin/public';
import {
  ChartTooltipFooterMessage,
  getAccessorByDimension,
  getFormatByAccessor,
  getComputedColumnWarningForColumns,
  getOverridesFor,
  DEFAULT_LEGEND_SIZE,
  LegendSizeToPixels,
} from '@kbn/chart-expressions-common';
import { i18n } from '@kbn/i18n';
import type { DatatableColumn } from '@kbn/expressions-plugin/public';
import { IconChartHeatmap } from '@kbn/chart-icons';
import { useKibanaIsDarkMode } from '@kbn/react-kibana-context-theme';
import type { CoreSetup } from '@kbn/core/public';

import type { HeatmapRenderProps, FilterEvent, BrushEvent } from '../../common';
import {
  applyPaletteParams,
  findMinMaxByColumnId,
  getFormattedTable,
  getSortPredicate,
} from './helpers';
import {
  LegendColorPickerWrapperContext,
  LegendColorPickerWrapper,
} from '../utils/get_color_picker';
import { defaultPaletteParams } from '../constants';
import { ChartSplit } from './chart_split';
import { getSplitDimensionAccessor, createSplitPoint } from '../utils/get_split_dimension_utils';

declare global {
  interface Window {
    /**
     * Flag used to enable debugState on elastic charts
     */
    _echDebugStateFlag?: boolean;
  }
}

function getStops(
  { colors, stops, range }: CustomPaletteState,
  { min, max }: { min: number; max: number }
) {
  if (stops.length) {
    return stops.slice(0, stops.length - 1);
  }
  // Do not use relative values here
  const maxValue = range === 'percent' ? 100 : max;
  const minValue = range === 'percent' ? 0 : min;
  const step = (maxValue - minValue) / colors.length;
  return colors.slice(0, colors.length - 1).map((_, i) => minValue + (i + 1) * step);
}

/**
 * Heatmaps use a different convention than palettes (same convention as EuiColorStops)
 * so stops need to be left shifted.
 * Values normalization provides a percent => absolute array of values
 */
function shiftAndNormalizeStops(
  params: CustomPaletteState,
  { min, max }: { min: number; max: number }
) {
  // data min is the fallback in case of default options
  const absMin = params.range === 'percent' ? 0 : min;
  return [params.stops.length ? params.rangeMin : absMin, ...getStops(params, { min, max })].map(
    (value) => {
      let result = value;
      if (params.range === 'percent') {
        result = min + ((max - min) * value) / 100;
      }
      return result;
    }
  );
}

/**
 * Computes the minimum interval between adjacent x values in the data.
 * Used for ES|QL queries without explicit interval metadata.
 *
 * @param data - The heatmap chart data (with timestamps already converted to numbers)
 * @param xAccessor - The x-axis accessor key
 * @returns The minimum interval in milliseconds, or undefined if cannot be computed
 */
export function computeMinIntervalFromData(
  data: Array<Record<string, string | number>>,
  xAccessor: string | undefined
): number | undefined {
  if (!xAccessor || data.length < 2) {
    return undefined;
  }

  // Extract numeric timestamps (already converted from date strings)
  const timestamps = data.reduce((acc, curr) => {
    if (curr[xAccessor] !== null && typeof curr[xAccessor] === 'number') {
      acc.add(curr[xAccessor]);
    }
    return acc;
  }, new Set<number>());

  const sortedTimestamps = Array.from(timestamps).sort((a, b) => a - b);

  if (sortedTimestamps.length < 2) {
    return undefined;
  }

  // Compute minimum interval between adjacent values
  let minInterval = Number.MAX_SAFE_INTEGER;
  for (let i = 1; i < sortedTimestamps.length; i++) {
    const interval = Math.abs(sortedTimestamps[i] - sortedTimestamps[i - 1]);
    if (interval > 0) {
      minInterval = Math.min(minInterval, interval);
    }
  }

  return minInterval < Number.MAX_SAFE_INTEGER ? minInterval : undefined;
}

/**
 * Computes the appropriate x-axis scale for the heatmap.
 * Handles traditional aggregations with interval metadata and ES|QL queries that require computed intervals.
 *
 * @param xScaleType - The explicit scale type from grid config
 * @param isTimeBasedSwimLane - Whether this is a time-based swimlane (traditional aggregations)
 * @param chartData - The heatmap chart data
 * @param xAxisColumn - The x-axis column metadata
 * @param dateHistogramMeta - Date histogram metadata from traditional aggregations
 * @param parseEsInterval - Function to parse Elasticsearch interval strings
 * @returns The computed xScale configuration
 */
function computeXScale(
  xScaleType: string | undefined,
  isTimeBasedSwimLane: boolean,
  chartData: Array<Record<string, string | number>>,
  xAxisColumn: DatatableColumn | undefined,
  dateHistogramMeta: { interval?: string } | undefined,
  parseEsInterval: (interval: string) => { type: string; unit: string; value: number } | null
): HeatmapSpec['xScale'] {
  // Fallback to ordinal scale for single row or default
  if (chartData.length <= 1) {
    return { type: ScaleType.Ordinal };
  }

  // Determine if we should use time scale
  const shouldUseTimeScale = xScaleType === 'time' || (!xScaleType && isTimeBasedSwimLane);

  if (shouldUseTimeScale) {
    const dateInterval = dateHistogramMeta?.interval;
    const esInterval = dateInterval ? parseEsInterval(dateInterval) : undefined;

    if (esInterval) {
      // Traditional aggregations with interval metadata
      return {
        type: ScaleType.Time,
        interval:
          esInterval.type === 'fixed'
            ? {
                type: 'fixed',
                unit: esInterval.unit as ESFixedIntervalUnit,
                value: esInterval.value,
              }
            : {
                type: 'calendar',
                unit: esInterval.unit as ESCalendarIntervalUnit,
                value: esInterval.value,
              },
      };
    } else if (xScaleType === 'time') {
      // ES|QL queries without interval metadata - compute interval from data
      // this need to infer the interval from the data table is temporary. Once Elasticsearch returns
      // the interval metadata for ES|QL queries, we can simplify
      const computedInterval = computeMinIntervalFromData(chartData, xAxisColumn?.id);
      if (computedInterval) {
        return {
          type: ScaleType.Time,
          interval: {
            type: 'fixed',
            unit: 'ms',
            value: computedInterval,
          },
        };
      }
      // Fallback to Linear if we can't compute an interval
      return { type: ScaleType.Linear };
    }
  } else if (xScaleType === 'linear') {
    return { type: ScaleType.Linear };
  }

  return { type: ScaleType.Ordinal };
}

function computeColorRanges(
  paletteService: HeatmapRenderProps['paletteService'],
  paletteParams: CustomPaletteState | undefined,
  baseColor: string,
  minMax: { min: number; max: number }
) {
  const paletteColors =
    paletteParams?.colors ||
    applyPaletteParams(
      paletteService,
      { type: 'palette', name: defaultPaletteParams.name },
      minMax
    ).map(({ color }) => color);
  // Repeat the first color at the beginning to cover below and above the defined palette
  const colors = [paletteColors[0], ...paletteColors];

  const ranges = shiftAndNormalizeStops(
    {
      gradient: false,
      range: defaultPaletteParams.rangeType,
      rangeMin: defaultPaletteParams.rangeMin,
      rangeMax: defaultPaletteParams.rangeMax,
      stops: [],
      ...paletteParams,
      colors: colors.slice(1),
    },
    minMax
  );

  return { colors, ranges };
}

/**
 * Selects the appropriate date format pattern from dateFormat:scaled based on the interval.
 * Follows the same logic as date_histogram operation in Lens.
 * @param intervalMs - The interval in milliseconds
 * @param uiSettings - The UI settings service
 * @returns The date format pattern string, or undefined if no pattern can be determined
 *
 * (copied from x-pack/platform/plugins/shared/lens/public/datasources/form_based/operations/definitions/date_histogram.tsx)
 */
export function getDateFormatPattern(
  intervalMs: number | undefined,
  uiSettings: CoreSetup['uiSettings'] | undefined
): string | undefined {
  if (!intervalMs || !uiSettings) {
    return undefined;
  }

  const rules = uiSettings.get('dateFormat:scaled');
  // Iterate backwards through rules to find the first matching interval
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i];
    if (!Array.isArray(rule) || rule.length !== 2) continue;
    // Empty string means "any interval below the next threshold"
    if (!rule[0] || intervalMs >= moment.duration(rule[0]).asMilliseconds()) {
      return rule[1];
    }
  }

  // Fallback to default date format
  return uiSettings.get('dateFormat');
}

export const HeatmapComponent: FC<HeatmapRenderProps> = memo(
  ({
    data: table,
    args,
    timeZone,
    formatFactory,
    chartsThemeService,
    chartsActiveCursorService,
    datatableUtilities,
    onClickValue,
    onSelectRange,
    onClickMultiValue,
    paletteService,
    uiState,
    interactive,
    syncTooltips,
    syncCursor,
    renderComplete,
    overrides,
    uiSettings,
  }) => {
    const chartRef = useRef<Chart>(null);
    const isDarkTheme = useKibanaIsDarkMode();
    // legacy heatmap legend is handled by the uiState
    const [showLegend, setShowLegend] = useState<boolean>(() => {
      const bwcLegendStateDefault = args.legend.isVisible ?? true;
      return uiState?.get('vis.legendOpen', bwcLegendStateDefault);
    });

    const chartBaseTheme = chartsThemeService.useChartsBaseTheme();

    const toggleLegend = useCallback(() => {
      if (!interactive) {
        return;
      }
      setShowLegend((value) => {
        const newValue = !value;
        uiState?.set?.('vis.legendOpen', newValue);
        return newValue;
      });
    }, [uiState, interactive]);

    const setColor = useCallback(
      (newColor: string | null, seriesLabel: string | number) => {
        const colors = uiState?.get('vis.colors') || {};
        if (colors[seriesLabel] === newColor || !newColor) {
          delete colors[seriesLabel];
        } else {
          colors[seriesLabel] = newColor;
        }
        uiState?.setSilent('vis.colors', null);
        uiState?.set('vis.colors', colors);
        uiState?.emit('reload');
        uiState?.emit('colorChanged');
      },
      [uiState]
    );

    const onRenderChange = useCallback(
      (isRendered: boolean = true) => {
        if (isRendered) {
          renderComplete();
        }
      },
      [renderComplete]
    );
    const valueAccessor = args.valueAccessor
      ? getAccessorByDimension(args.valueAccessor, table.columns)
      : undefined;
    const minMaxByColumnId = useMemo(
      () => findMinMaxByColumnId([valueAccessor!], table),
      [valueAccessor, table]
    );
    const paletteParams = args.palette?.params;
    const xAccessor = args.xAccessor
      ? getAccessorByDimension(args.xAccessor, table.columns)
      : undefined;
    const yAccessor = args.yAccessor
      ? getAccessorByDimension(args.yAccessor, table.columns)
      : undefined;
    const splitChartRowAccessor = args.splitRowAccessor
      ? getSplitDimensionAccessor(table.columns, args.splitRowAccessor, formatFactory)
      : undefined;
    const splitChartColumnAccessor = args.splitColumnAccessor
      ? getSplitDimensionAccessor(table.columns, args.splitColumnAccessor, formatFactory)
      : undefined;

    const xAxisColumnIndex = table.columns.findIndex((v) => v.id === xAccessor);
    const yAxisColumnIndex = table.columns.findIndex((v) => v.id === yAccessor);

    const xAxisColumn = table.columns[xAxisColumnIndex] as DatatableColumn | undefined;
    const yAxisColumn = table.columns[yAxisColumnIndex] as DatatableColumn | undefined;
    const valueColumn = table.columns.find((v) => v.id === valueAccessor) as
      | DatatableColumn
      | undefined;
    const xAxisMeta = xAxisColumn?.meta;
    const dateHistogramMeta = xAxisColumn
      ? datatableUtilities.getDateHistogramMeta(xAxisColumn)
      : undefined;
    const isTimeBasedSwimLane = xAxisMeta?.type === 'date' && Boolean(dateHistogramMeta?.interval);

    const yValuesFormatter = useMemo(
      () => formatFactory(yAxisColumn?.meta.params),
      [formatFactory, yAxisColumn?.meta.params]
    );
    const metricFormatter = useMemo(
      () => formatFactory(getFormatByAccessor(args.valueAccessor!, table.columns)),
      [args.valueAccessor, formatFactory, table.columns]
    );

    const formattedTable = getFormattedTable(table, formatFactory);
    let chartData = formattedTable.table.rows.filter(
      (v) => v[valueAccessor!] === null || typeof v[valueAccessor!] === 'number'
    );

    // Convert date strings to timestamps for ES|QL time data
    // This needs to happen before x scale logic so both interval computation and rendering work correctly
    if (xAxisColumn?.id && xAxisMeta?.type === 'date') {
      const firstXValue = chartData[0]?.[xAxisColumn.id];
      if (typeof firstXValue === 'string') {
        chartData = chartData.map((row) => {
          const xValue = row[xAxisColumn.id];
          if (typeof xValue === 'string') {
            const timestamp = new Date(xValue).getTime();
            return {
              ...row,
              [xAxisColumn.id]: isNaN(timestamp) ? xValue : timestamp,
            };
          }
          return row;
        });
      }
    }

    const xScale = computeXScale(
      args.gridConfig.xScaleType,
      isTimeBasedSwimLane,
      chartData,
      xAxisColumn,
      dateHistogramMeta,
      search.aggs.parseEsInterval
    );

    const handleCursorUpdate = useActiveCursor(chartsActiveCursorService, chartRef, {
      datatables: [formattedTable.table],
    });

    const isEsqlMode = table?.meta?.type === ESQL_TABLE_TYPE;

    const xValuesFormatter = useMemo(() => {
      // For ES|QL time-based x-axis with computed interval, use scaled date format
      // Traditional aggregations already handle this in the date histogram operator
      if (
        isEsqlMode &&
        xAxisMeta?.type === 'date' &&
        xScale.type === ScaleType.Time &&
        xScale.interval?.unit === 'ms' &&
        uiSettings
      ) {
        const pattern = getDateFormatPattern(xScale.interval.value, uiSettings);
        if (pattern) {
          return formatFactory({
            id: 'date',
            params: {
              pattern,
            },
          });
        }
      }

      return formatFactory(xAxisMeta?.params);
    }, [formatFactory, xAxisMeta?.params, xAxisMeta?.type, xScale, uiSettings, isEsqlMode]);

    const hasTooltipActions = interactive && !isEsqlMode;

    // Compute warning message for ES|QL computed columns that cannot be filtered.
    const warningMessage = useMemo(
      () =>
        isEsqlMode ? getComputedColumnWarningForColumns([xAxisColumn, yAxisColumn]) : undefined,
      [isEsqlMode, xAxisColumn, yAxisColumn]
    );

    const TooltipFooter = useMemo<
      | React.ComponentType<{
          items: Array<TooltipValue<Record<string, string | number>, SeriesIdentifier>>;
          header: PointerValue<Record<string, string | number>> | null;
        }>
      | 'default'
    >(() => {
      if (!warningMessage) return 'default';
      return () => <ChartTooltipFooterMessage message={warningMessage} />;
    }, [warningMessage]);

    const onElementClick = useCallback(
      (e: HeatmapElementEvent[]) => {
        const cell = e[0][0];
        const { x, y, smVerticalAccessorValue, smHorizontalAccessorValue } = cell.datum;

        const points = [
          {
            row: table.rows.findIndex((r) => {
              if (!xAxisColumn) return false;
              if (formattedTable.formattedColumns[xAxisColumn.id]) {
                // stringify the value to compare with the chart value
                return xValuesFormatter.convertToText(r[xAxisColumn.id]) === x;
              }
              return r[xAxisColumn.id] === x;
            }),
            column: xAxisColumnIndex,
            value: x,
            table,
          },
          ...(yAxisColumn
            ? [
                {
                  row: table.rows.findIndex((r) => {
                    if (formattedTable.formattedColumns[yAxisColumn.id]) {
                      // stringify the value to compare with the chart value
                      return yValuesFormatter.convertToText(r[yAxisColumn.id]) === y;
                    }
                    return r[yAxisColumn.id] === y;
                  }),
                  column: yAxisColumnIndex,
                  value: y,
                  table,
                },
              ]
            : []),
        ];

        if (smHorizontalAccessorValue && args.splitColumnAccessor) {
          const point = createSplitPoint(
            args.splitColumnAccessor,
            smHorizontalAccessorValue,
            formatFactory,
            table
          );
          if (point) {
            points.push(point);
          }
        }
        if (smVerticalAccessorValue && args.splitRowAccessor) {
          const point = createSplitPoint(
            args.splitRowAccessor,
            smVerticalAccessorValue,
            formatFactory,
            table
          );
          if (point) {
            points.push(point);
          }
        }

        onClickValue({
          data: points,
        });
      },
      [
        args.splitColumnAccessor,
        args.splitRowAccessor,
        formatFactory,
        formattedTable.formattedColumns,
        onClickValue,
        table,
        xAxisColumn,
        xAxisColumnIndex,
        xValuesFormatter,
        yAxisColumn,
        yAxisColumnIndex,
        yValuesFormatter,
      ]
    );

    const onBrushEnd = useCallback(
      (e: HeatmapBrushEvent) => {
        const { x, y } = e;

        if (isTimeBasedSwimLane) {
          const context: BrushEvent['data'] = {
            range: x as number[],
            table,
            column: xAxisColumnIndex,
          };
          onSelectRange(context);
        } else {
          const points: Array<{ row: number; column: number; value: string | number }> = [];

          if (yAxisColumn) {
            (y as string[]).forEach((v) => {
              points.push({
                row: table.rows.findIndex((r) => {
                  if (formattedTable.formattedColumns[yAxisColumn.id]) {
                    // stringify the value to compare with the chart value
                    return yValuesFormatter.convertToText(r[yAxisColumn.id]) === v;
                  }
                  return r[yAxisColumn.id] === v;
                }),
                column: yAxisColumnIndex,
                value: v,
              });
            });
          }
          if (xAxisColumn) {
            (x as string[]).forEach((v) => {
              points.push({
                row: table.rows.findIndex((r) => {
                  if (formattedTable.formattedColumns[xAxisColumn.id]) {
                    // stringify the value to compare with the chart value
                    return xValuesFormatter.convertToText(r[xAxisColumn.id]) === v;
                  }
                  return r[xAxisColumn.id] === v;
                }),
                column: xAxisColumnIndex,
                value: v,
              });
            });
          }

          const context: FilterEvent['data'] = {
            data: points.map((point) => ({
              row: point.row,
              column: point.column,
              value: point.value,
              table,
            })),
          };
          onClickValue(context);
        }
      },
      [
        formattedTable.formattedColumns,
        isTimeBasedSwimLane,
        onClickValue,
        onSelectRange,
        table,
        xAxisColumn,
        xAxisColumnIndex,
        xValuesFormatter,
        yAxisColumn,
        yAxisColumnIndex,
        yValuesFormatter,
      ]
    );

    if (!chartData || !chartData.length) {
      return <EmptyPlaceholder icon={IconChartHeatmap} renderComplete={onRenderChange} />;
    }

    if (!yAxisColumn) {
      // required for tooltip
      chartData = chartData.map((row) => {
        return {
          ...row,
          unifiedY: '',
        };
      });
    }
    if (!xAxisColumn) {
      // required for tooltip
      chartData = chartData.map((row) => {
        return {
          ...row,
          unifiedX: '',
        };
      });
    }
    const { min, max } = minMaxByColumnId[valueAccessor!];
    if (!valueColumn) {
      // Chart is not ready
      return null;
    }

    const valueFormatter = (d: number) => {
      let value = d;

      if (args.percentageMode) {
        const percentageNumber = (Math.abs(value - min) / (max - min)) * 100;
        value = parseInt(percentageNumber.toString(), 10) / 100;
      }
      return `${metricFormatter.convertToText(value) ?? ''}`;
    };

    const { colors, ranges } = computeColorRanges(
      paletteService,
      paletteParams,
      isDarkTheme ? '#000' : '#fff',
      minMaxByColumnId[valueAccessor!]
    );

    // adds a very small number to the max value to make sure the max value will be included
    const smattering = 0.00001;
    let endValueDistinctBounds = max + smattering;
    if (paletteParams?.rangeMax || paletteParams?.rangeMax === 0) {
      endValueDistinctBounds =
        (paletteParams?.range === 'number'
          ? paletteParams.rangeMax
          : min + ((max - min) * paletteParams.rangeMax) / 100) + smattering;
    }

    const overwriteColors = uiState?.get('vis.colors') ?? null;
    const hasSingleValue = max === min;
    const bands = ranges.map((start, index, array) => {
      const isLastValue = index === array.length - 1;
      const nextValue = array[index + 1];
      // by default the last range is right-open
      let endValue = isLastValue ? Number.POSITIVE_INFINITY : nextValue;
      const startValue =
        isLastValue && hasSingleValue && paletteParams?.range !== 'number' ? min : start;

      // if the lastRangeIsRightOpen is set to false, we need to set the last range to the max value
      if (args.lastRangeIsRightOpen === false) {
        const lastBand = hasSingleValue ? Number.POSITIVE_INFINITY : endValueDistinctBounds;
        endValue = isLastValue ? lastBand : nextValue;
      }

      let overwriteArrayIdx;

      if (endValue === Number.POSITIVE_INFINITY) {
        overwriteArrayIdx = `≥ ${valueFormatter(startValue)}`;
      } else {
        overwriteArrayIdx = `${valueFormatter(start)} - ${valueFormatter(endValue)}`;
      }

      const overwriteColor = overwriteColors?.[overwriteArrayIdx];
      return {
        // with the default continuity:above the every range is left-closed
        start: startValue,
        end: endValue,
        // the current colors array contains a duplicated color at the beginning that we need to skip
        color: overwriteColor ?? colors[index + 1],
      };
    });

    const { theme: settingsThemeOverrides = {}, ...settingsOverrides } = getOverridesFor(
      overrides,
      'settings'
    ) as Partial<SettingsProps>;

    const themeOverrides: PartialTheme = {
      legend: {
        labelOptions: {
          maxLines: args.legend.shouldTruncate ? args.legend?.maxLines ?? 1 : 0,
        },
      },
      heatmap: {
        grid: {
          stroke: {
            width:
              args.gridConfig.strokeWidth ?? chartBaseTheme.axes.gridLine.horizontal.strokeWidth,
            color: args.gridConfig.strokeColor ?? chartBaseTheme.axes.gridLine.horizontal.stroke,
          },
        },
        cell: {
          maxWidth: 'fill',
          maxHeight: 'fill',
          label: {
            visible: args.gridConfig.isCellLabelVisible ?? false,
            minFontSize: 8,
            maxFontSize: 18,
            useGlobalMinFontSize: true, // override the min if there's a different directive upstream
          },
          border: {
            strokeWidth: 0,
          },
        },
        yAxisLabel: {
          visible: !!yAxisColumn && args.gridConfig.isYAxisLabelVisible,
          // eui color subdued
          textColor: chartBaseTheme.axes.tickLabel.fill,
          padding: yAxisColumn?.name ? 8 : 0,
        },
        xAxisLabel: {
          visible: Boolean(args.gridConfig.isXAxisLabelVisible && xAxisColumn),
          // eui color subdued
          textColor: chartBaseTheme.axes.tickLabel.fill,
          padding: xAxisColumn?.name ? 8 : 0,
          rotation:
            args.gridConfig.xAxisLabelRotation && Math.abs(args.gridConfig.xAxisLabelRotation), // rotation is a positive value
        },
        brushMask: {
          fill: isDarkTheme ? 'rgb(30,31,35,80%)' : 'rgb(247,247,247,50%)',
        },
        brushArea: {
          stroke: isDarkTheme ? 'rgb(255, 255, 255)' : 'rgb(105, 112, 125)',
        },
      },
    };

    const xAxisTitle = args.gridConfig.xTitle ?? xAxisColumn?.name;
    const yAxisTitle = args.gridConfig.yTitle ?? yAxisColumn?.name;

    const filterSelectedTooltipValues = (
      tooltipSelectedValues: Array<
        TooltipValue<Record<'x' | 'y', string | number>, SeriesIdentifier>
      >
    ) => {
      const { datum } = tooltipSelectedValues[0];
      if (!datum) {
        return;
      }
      const { x, y } = datum;

      const shouldFilterByX = tooltipSelectedValues.some(
        ({ label }) => label === xAxisColumn?.name
      );

      const shouldFilterByY = tooltipSelectedValues.some(
        ({ label }) => label === yAxisColumn?.name
      );

      const cells = [
        ...(xAxisColumn && shouldFilterByX
          ? [
              {
                column: xAxisColumnIndex,
                row: table.rows.findIndex((r) => {
                  if (!xAxisColumn) return false;
                  if (formattedTable.formattedColumns[xAxisColumn.id]) {
                    // stringify the value to compare with the chart value
                    return xValuesFormatter.convertToText(r[xAxisColumn.id]) === x;
                  }
                  return r[xAxisColumn.id] === x;
                }),
              },
            ]
          : []),
        ...(yAxisColumn && shouldFilterByY
          ? [
              {
                column: yAxisColumnIndex,
                row: table.rows.findIndex((r) => {
                  if (formattedTable.formattedColumns[yAxisColumn.id]) {
                    // stringify the value to compare with the chart value
                    return yValuesFormatter.convertToText(r[yAxisColumn.id]) === y;
                  }
                  return r[yAxisColumn.id] === y;
                }),
              },
            ]
          : []),
      ];

      if (cells.length) {
        onClickMultiValue({
          data: [
            {
              table,
              cells,
            },
          ],
        });
      }
    };

    return (
      <>
        {showLegend !== undefined && (
          <LegendToggle
            onClick={toggleLegend}
            showLegend={showLegend}
            legendPosition={args.legend.position}
          />
        )}
        <LegendColorPickerWrapperContext.Provider
          value={{
            uiState,
            setColor,
            legendPosition: args.legend.position,
          }}
        >
          <Chart ref={chartRef} {...getOverridesFor(overrides, 'chart')}>
            <ChartSplit
              splitColumnAccessor={splitChartColumnAccessor}
              splitRowAccessor={splitChartRowAccessor}
            />
            <Tooltip<Record<string, string | number>, SeriesIdentifier>
              actions={
                hasTooltipActions
                  ? [
                      {
                        disabled: (selected) => selected.length < 1,
                        label: (selected) =>
                          selected.length === 0
                            ? i18n.translate(
                                'expressionHeatmap.tooltipActions.emptyFilterSelection',
                                {
                                  defaultMessage: 'Select at least one series to filter',
                                }
                              )
                            : i18n.translate('expressionHeatmap.tooltipActions.filterValues', {
                                defaultMessage: 'Filter {seriesNumber} series',
                                values: { seriesNumber: selected.length },
                              }),
                        onSelect: filterSelectedTooltipValues,
                      },
                    ]
                  : undefined
              }
              type={args.showTooltip ? TooltipType.Follow : TooltipType.None}
              footer={TooltipFooter}
            />
            <Settings
              onRenderChange={onRenderChange}
              noResults={
                <EmptyPlaceholder icon={IconChartHeatmap} renderComplete={onRenderChange} />
              }
              onPointerUpdate={syncCursor ? handleCursorUpdate : undefined}
              externalPointerEvents={{
                tooltip: { visible: syncTooltips },
              }}
              onElementClick={interactive ? (onElementClick as ElementClickListener) : undefined}
              showLegend={showLegend ?? args.legend.isVisible}
              legendPosition={args.legend.position}
              legendSize={LegendSizeToPixels[args.legend.legendSize ?? DEFAULT_LEGEND_SIZE]}
              legendColorPicker={uiState ? LegendColorPickerWrapper : undefined}
              debugState={window._echDebugStateFlag ?? false}
              theme={[
                themeOverrides,
                ...(Array.isArray(settingsThemeOverrides)
                  ? settingsThemeOverrides
                  : [settingsThemeOverrides]),
              ]}
              baseTheme={chartBaseTheme}
              xDomain={{
                min:
                  dateHistogramMeta && dateHistogramMeta.timeRange
                    ? new Date(dateHistogramMeta.timeRange.from).getTime()
                    : NaN,
                max:
                  dateHistogramMeta && dateHistogramMeta.timeRange
                    ? new Date(dateHistogramMeta.timeRange.to).getTime()
                    : NaN,
              }}
              onBrushEnd={interactive ? (onBrushEnd as BrushEndListener) : undefined}
              ariaLabel={args.ariaLabel}
              ariaUseDefaultSummary={!args.ariaLabel}
              locale={i18n.getLocale()}
              {...settingsOverrides}
            />
            <Heatmap
              id="heatmap"
              name={valueColumn.name}
              colorScale={{
                type: 'bands',
                bands,
              }}
              timeZone={timeZone}
              data={chartData}
              xAccessor={xAccessor || 'unifiedX'}
              yAccessor={yAccessor || 'unifiedY'}
              valueAccessor={valueAccessor}
              valueFormatter={valueFormatter}
              xScale={xScale}
              xSortPredicate={
                !isTimeBasedSwimLane && xAxisColumn
                  ? getSortPredicate(xAxisColumn, args.gridConfig.xSortPredicate)
                  : undefined
              }
              ySortPredicate={
                yAxisColumn && getSortPredicate(yAxisColumn, args.gridConfig.ySortPredicate)
              }
              xAxisLabelName={xAxisColumn?.name || ''}
              yAxisLabelName={yAxisColumn?.name || ''}
              xAxisTitle={args.gridConfig.isXAxisTitleVisible ? xAxisTitle : undefined}
              yAxisTitle={args.gridConfig.isYAxisTitleVisible ? yAxisTitle : undefined}
              xAxisLabelFormatter={(v) =>
                `${
                  xAccessor && formattedTable.formattedColumns[xAccessor]
                    ? v
                    : xValuesFormatter.convertToText(v)
                }`
              }
              yAxisLabelFormatter={
                yAxisColumn
                  ? (v) =>
                      `${
                        yAccessor && formattedTable.formattedColumns[yAccessor]
                          ? v
                          : yValuesFormatter.convertToText(v) ?? ''
                      }`
                  : undefined
              }
            />
          </Chart>
        </LegendColorPickerWrapperContext.Provider>
      </>
    );
  }
);

// default export required for React.Lazy
// eslint-disable-next-line import/no-default-export
export { HeatmapComponent as default };
