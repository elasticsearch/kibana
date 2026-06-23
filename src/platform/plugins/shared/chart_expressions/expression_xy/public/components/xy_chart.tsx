/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/react';
import type {
  ElementClickListener,
  BrushEndListener,
  XYBrushEvent,
  LegendPositionConfig,
  DisplayValueStyle,
  RecursivePartial,
  XYChartElementEvent,
  XYChartSeriesIdentifier,
  SettingsProps,
  TooltipValue,
  PointerValue,
  AxisStyle,
} from '@elastic/charts';
import {
  Chart,
  Settings,
  Axis,
  Position,
  VerticalAlignment,
  HorizontalAlignment,
  LayoutDirection,
  TooltipType,
  Placement,
  Direction,
  Tooltip,
  LEGACY_LIGHT_THEME,
} from '@elastic/charts';
import { partition } from 'lodash';
import { type IconType } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { isOfAggregateQueryType } from '@kbn/es-query';
import type { PaletteRegistry } from '@kbn/coloring';
import type { RenderMode } from '@kbn/expressions-plugin/common';
import { useKbnPalettes } from '@kbn/palettes';
import { ESQL_TABLE_TYPE, MULTI_FIELD_KEY_SEPARATOR } from '@kbn/data-plugin/common';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import { EmptyPlaceholder, LegendToggle } from '@kbn/charts-plugin/public';
import type { EventAnnotationServiceType } from '@kbn/event-annotation-plugin/public';
import type { PointEventAnnotationRow } from '@kbn/event-annotation-plugin/common';
import type { ChartsPluginSetup, ChartsPluginStart } from '@kbn/charts-plugin/public';
import { useActiveCursor } from '@kbn/charts-plugin/public';
import type { ChartSizeSpec } from '@kbn/chart-expressions-common';
import type { PersistedState } from '@kbn/visualizations-common';
import {
  ChartTooltipFooterMessage,
  DEFAULT_LEGEND_SIZE,
  LegendSizeToPixels,
  getLegendLayout,
  getAccessorByDimension,
  getColumnByAccessor,
  getOverridesFor,
} from '@kbn/chart-expressions-common';
import { useAppFixedViewport } from '@kbn/core-rendering-browser';
import { useKibanaIsDarkMode } from '@kbn/react-kibana-context-theme';
import type { AlertRuleFromVisUIActionData } from '@kbn/alerts-ui-shared';
import type {
  FilterEvent,
  BrushEvent,
  FormatFactory,
  LayerCellValueActions,
  MultiFilterEvent,
} from '../types';
import { isTimeChart } from '../../common/helpers';
import type {
  CommonXYDataLayerConfig,
  ReferenceLineDecorationConfig,
  ExtendedReferenceLineDecorationConfig,
  XYChartProps,
  AxisExtentConfigResult,
} from '../../common/types';
import type { AxisConfiguration, GroupsConfiguration, Series } from '../helpers';
import {
  isHorizontalChart,
  getDataLayers,
  getAxisPosition,
  getFormattedTablesByLayers,
  getLayersFormats,
  getLayersTitles,
  isReferenceLineDecorationConfig,
  getFilteredLayers,
  getReferenceLayers,
  isDataLayer,
  getAxesConfiguration,
  getLinesCausedPaddings,
  validateExtent,
  getOriginalAxisPosition,
  getDecimalsFromFormat,
} from '../helpers';
import { getXDomain, XyEndzones } from './x_domain';
import { getLegendAction } from './legend_action';
import {
  ReferenceLines,
  computeChartMargins,
  getAxisGroupForReferenceLine,
  getReferenceLinesFormattersMap,
} from './reference_lines';
import { visualizationDefinitions } from '../definitions';
import type { CommonXYLayerConfig } from '../../common/types';
import { SplitChart } from './split_chart';
import {
  Annotations,
  getAnnotationsGroupedByInterval,
  isRangeAnnotation,
  OUTSIDE_RECT_ANNOTATION_WIDTH,
  OUTSIDE_RECT_ANNOTATION_WIDTH_SUGGESTION,
} from './annotations';
import { AxisExtentModes, SeriesTypes, ValueLabelModes, XScaleTypes } from '../../common/constants';
import { DataLayers } from './data_layers';
import { Tooltip as CustomTooltip } from './tooltip';
import { XYCurrentTime } from './xy_current_time';
import { TooltipHeader } from './tooltip';
import { LegendColorPickerWrapperContext, LegendColorPickerWrapper } from './legend_color_picker';
import { createSplitPoint, getTooltipActions, getXSeriesPoint } from './tooltip/tooltip_actions';
import { getComputedColumnWarning } from './tooltip/computed_column_warning';
import { GlobalXYChartStyles } from './xy_chart.styles';

declare global {
  interface Window {
    /**
     * Flag used to enable debugState on elastic charts
     */
    _echDebugStateFlag?: boolean;
  }
}

const MULTILAYER_TIME_AXIS_TICKLINE_PADDING = 4;
const DEFAULT_LEGEND_TRUNCATE_WIDTH_LIMIT = 1000;

export type XYChartRenderProps = Omit<XYChartProps, 'canNavigateToLens'> & {
  chartsThemeService: ChartsPluginSetup['theme'];
  chartsActiveCursorService: ChartsPluginStart['activeCursor'];
  data: DataPublicPluginStart;
  paletteService: PaletteRegistry;
  formatFactory: FormatFactory;
  timeZone: string;
  minInterval: number | undefined;
  interactive?: boolean;
  onClickValue: (data: FilterEvent['data']) => void;
  onClickMultiValue: (data: MultiFilterEvent['data']) => void;
  onCreateAlertRule: (data: AlertRuleFromVisUIActionData) => void;
  layerCellValueActions: LayerCellValueActions;
  onSelectRange: (data: BrushEvent['data']) => void;
  renderMode: RenderMode;
  syncColors: boolean;
  syncTooltips: boolean;
  syncCursor: boolean;
  eventAnnotationService: EventAnnotationServiceType;
  renderComplete: () => void;
  uiState?: PersistedState;
  timeFormat: string;
  setChartSize: (chartSizeSpec: ChartSizeSpec) => void;
  shouldShowLegendAction?: (actionId: string) => boolean;
};

function nonNullable<T>(v: T): v is NonNullable<T> {
  return v != null;
}
function getValueLabelsStyling(isHorizontal: boolean): {
  displayValue: RecursivePartial<DisplayValueStyle>;
} {
  const VALUE_LABELS_MAX_FONTSIZE = 12;
  const VALUE_LABELS_MIN_FONTSIZE = 10;
  const VALUE_LABELS_VERTICAL_OFFSET = -10;
  const VALUE_LABELS_HORIZONTAL_OFFSET = 10;

  return {
    displayValue: {
      fontSize: { min: VALUE_LABELS_MIN_FONTSIZE, max: VALUE_LABELS_MAX_FONTSIZE },
      fill: { textBorder: 0 },
      alignment: isHorizontal
        ? { vertical: VerticalAlignment.Middle }
        : { horizontal: HorizontalAlignment.Center },
      offsetX: isHorizontal ? VALUE_LABELS_HORIZONTAL_OFFSET : 0,
      offsetY: isHorizontal ? 0 : VALUE_LABELS_VERTICAL_OFFSET,
    },
  };
}

function getIconForSeriesType(layer: CommonXYDataLayerConfig): IconType {
  return (
    visualizationDefinitions.find(
      (c) =>
        c.id ===
        `${layer.seriesType}${layer.isHorizontal ? '_horizontal' : ''}${
          layer.isPercentage ? '_percentage' : ''
        }${layer.isStacked ? '_stacked' : ''}`
    )?.icon || 'empty'
  );
}

export const XYChartReportable = React.memo(XYChart);

export function XYChart({
  args,
  data,
  formatFactory,
  timeZone,
  chartsThemeService,
  chartsActiveCursorService,
  paletteService,
  minInterval,
  onClickValue,
  onClickMultiValue,
  onCreateAlertRule,
  layerCellValueActions,
  onSelectRange,
  setChartSize,
  interactive = true,
  syncColors,
  syncTooltips,
  syncCursor,
  renderComplete,
  uiState,
  timeFormat,
  overrides,
}: XYChartRenderProps) {
  const {
    legend,
    layers,
    fittingFunction,
    endValue,
    emphasizeFitting,
    valueLabels,
    hideEndzones,
    yAxisConfigs,
    xAxisConfig,
    splitColumnAccessor,
    splitRowAccessor,
    singleTable,
    annotations,
    pointVisibility,
  } = args;

  const chartRef = useRef<Chart>(null);
  const chartBaseTheme = chartsThemeService.useChartsBaseTheme();
  const darkMode = useKibanaIsDarkMode();
  const palettes = useKbnPalettes();
  const appFixedViewport = useAppFixedViewport();
  const filteredLayers = getFilteredLayers(layers);
  const layersById = filteredLayers.reduce<Record<string, CommonXYLayerConfig>>(
    (hashMap, layer) => ({ ...hashMap, [layer.layerId]: layer }),
    {}
  );
  const chartHasMoreThanOneSeries =
    filteredLayers.length > 1 ||
    filteredLayers.some((layer) => layer.accessors.length > 1) ||
    filteredLayers.some(
      (layer) => isDataLayer(layer) && layer.splitAccessors && layer.splitAccessors.length
    );

  const getShowLegendDefault = useCallback(() => {
    const legendStateDefault =
      legend.isVisible && !legend.showSingleSeries ? chartHasMoreThanOneSeries : legend.isVisible;
    return uiState?.get('vis.legendOpen', legendStateDefault) ?? legendStateDefault;
  }, [chartHasMoreThanOneSeries, legend.isVisible, legend.showSingleSeries, uiState]);

  const [showLegend, setShowLegend] = useState<boolean>(() => getShowLegendDefault());

  useEffect(() => {
    const legendShow = getShowLegendDefault();
    setShowLegend(legendShow);
  }, [getShowLegendDefault]);

  const toggleLegend = useCallback(() => {
    setShowLegend((value) => {
      const newValue = !value;
      uiState?.set?.('vis.legendOpen', newValue);
      return newValue;
    });
  }, [uiState]);

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

  // Exclude the reference layers from the cursor update
  const cursorSyncLayers = filteredLayers.filter(isDataLayer);
  const handleCursorUpdate = useActiveCursor(chartsActiveCursorService, chartRef, {
    datatables: cursorSyncLayers.map(({ table }) => table),
  });

  const onRenderChange = useCallback(
    (isRendered: boolean = true) => {
      if (isRendered) {
        renderComplete();
      }
    },
    [renderComplete]
  );

  const dataLayers: CommonXYDataLayerConfig[] = filteredLayers.filter(isDataLayer);

  const isTimeViz = isTimeChart(dataLayers);

  useEffect(() => {
    const chartSizeSpec: ChartSizeSpec =
      isTimeViz && !isHorizontalChart(dataLayers)
        ? {
            aspectRatio: {
              x: 16,
              y: 9,
            },
            minDimensions: {
              y: { value: 300, unit: 'pixels' },
              x: { value: 100, unit: 'percentage' },
            },
          }
        : {
            maxDimensions: {
              x: { value: 100, unit: 'percentage' },
              y: { value: 100, unit: 'percentage' },
            },
          };

    setChartSize(chartSizeSpec);
  }, [dataLayers, isTimeViz, setChartSize]);

  const formattedDatatables = useMemo(
    () =>
      getFormattedTablesByLayers(dataLayers, formatFactory, splitColumnAccessor, splitRowAccessor),
    [dataLayers, formatFactory, splitColumnAccessor, splitRowAccessor]
  );

  const fieldFormats = useMemo(
    () => getLayersFormats(dataLayers, { splitColumnAccessor, splitRowAccessor }, formatFactory),
    [dataLayers, splitColumnAccessor, splitRowAccessor, formatFactory]
  );

  const isEsqlMode = dataLayers.some((l) => l.table?.meta?.type === ESQL_TABLE_TYPE);

  // Compute warning message for ES|QL computed columns that cannot be filtered.
  const warningMessage = useMemo(
    () => (isEsqlMode ? getComputedColumnWarning(dataLayers) : undefined),
    [isEsqlMode, dataLayers]
  );

  const TooltipFooter = useMemo<
    | React.ComponentType<{
        items: Array<TooltipValue<Record<string, string | number>, XYChartSeriesIdentifier>>;
        header: PointerValue<Record<string, string | number>> | null;
      }>
    | 'default'
  >(() => {
    if (!warningMessage) return 'default';
    return () => <ChartTooltipFooterMessage message={warningMessage} />;
  }, [warningMessage]);

  const icon: IconType = getIconForSeriesType(getDataLayers(layers)?.[0]);

  if (dataLayers.length === 0) {
    return (
      <EmptyPlaceholder icon={icon} renderComplete={onRenderChange} css={xyChartEmptyStyles} />
    );
  }

  // use formatting hint of first x axis column to format ticks
  const xAxisColumn = dataLayers[0].xAccessor
    ? getColumnByAccessor(dataLayers[0].xAccessor, dataLayers[0]?.table.columns)
    : undefined;

  const xAxisFormatter = formatFactory(
    xAxisColumn?.id ? fieldFormats[dataLayers[0].layerId].xAccessors[xAxisColumn?.id] : undefined
  );

  const xTickDecimals = getDecimalsFromFormat(xAxisFormatter);

  // This is a safe formatter for the xAccessor that abstracts the knowledge of already formatted layers
  const safeXAccessorLabelRenderer = (value: unknown): string =>
    xAxisColumn && formattedDatatables[dataLayers[0]?.layerId]?.formattedColumns[xAxisColumn.id]
      ? String(value)
      : String(xAxisFormatter.convertToText(value));

  const shouldRotate = isHorizontalChart(dataLayers);

  const yAxesConfiguration = getAxesConfiguration(
    dataLayers,
    shouldRotate,
    formatFactory,
    fieldFormats,
    yAxisConfigs
  );

  const axesConfiguration = getAxesConfiguration(
    dataLayers,
    shouldRotate,
    formatFactory,
    fieldFormats,
    [...(yAxisConfigs ?? []), ...(xAxisConfig ? [xAxisConfig] : [])]
  );

  const xTitle = xAxisConfig?.title || (xAxisColumn && xAxisColumn.name) || undefined;
  const yAxesMap = {
    left: yAxesConfiguration.find(
      ({ position }) => position === getAxisPosition(Position.Left, shouldRotate)
    ),
    right: yAxesConfiguration.find(
      ({ position }) => position === getAxisPosition(Position.Right, shouldRotate)
    ),
  };

  const titles = getLayersTitles(
    dataLayers,
    { splitColumnAccessor, splitRowAccessor },
    { xTitle },
    yAxesConfiguration
  );

  const filteredBarLayers = dataLayers.filter(({ seriesType }) => seriesType === SeriesTypes.BAR);

  const chartHasMoreThanOneBarSeries =
    filteredBarLayers.length > 1 ||
    filteredBarLayers.some((layer) => layer.accessors.length > 1) ||
    filteredBarLayers.some(
      (layer) => isDataLayer(layer) && layer.splitAccessors && layer.splitAccessors.length
    );

  const defaultXScaleType = isTimeViz ? XScaleTypes.TIME : XScaleTypes.ORDINAL;

  const isHistogramViz = dataLayers.every((l) => l.isHistogram);
  const hasBars = dataLayers.some((l) => l.seriesType === SeriesTypes.BAR);
  const isHorizontalBarChart = isHorizontalChart(dataLayers) && hasBars;

  const { baseDomain: rawXDomain, extendedDomain: xDomain } = getXDomain(
    data.datatableUtilities,
    dataLayers,
    minInterval,
    isTimeViz,
    isHistogramViz,
    hasBars,
    timeZone,
    xAxisConfig?.extent
  );

  const axisTitlesVisibilitySettings = {
    yLeft: yAxesMap?.left?.showTitle ?? true,
    yRight: yAxesMap?.right?.showTitle ?? true,
  };
  const tickLabelsVisibilitySettings = {
    yLeft: yAxesMap?.left?.showLabels ?? true,
    yRight: yAxesMap?.right?.showLabels ?? true,
  };

  const getYAxesTitles = (axisSeries: Series[]) => {
    return axisSeries
      .map(({ layer, accessor }) => titles?.[layer]?.yTitles?.[accessor])
      .find((name) => Boolean(name));
  };

  const referenceLineLayers = getReferenceLayers(layers);
  const [rangeAnnotations, lineAnnotations] = isTimeViz
    ? partition(annotations?.datatable.rows, isRangeAnnotation)
    : [[], []];

  const groupedLineAnnotations = getAnnotationsGroupedByInterval(
    lineAnnotations as PointEventAnnotationRow[],
    annotations?.layers.flatMap((l) => l.annotations),
    annotations?.datatable.columns,
    formatFactory,
    timeFormat,
    darkMode
  );

  const visualConfigs = [
    ...referenceLineLayers
      .flatMap<ReferenceLineDecorationConfig | ExtendedReferenceLineDecorationConfig | undefined>(
        ({ decorations }) => decorations
      )
      .map((config) => ({
        ...config,
        position: config
          ? getAxisGroupForReferenceLine(axesConfiguration, config, shouldRotate)?.position ??
            Position.Left
          : Position.Bottom,
      })),
    ...groupedLineAnnotations,
  ].filter(nonNullable);

  const shouldHideDetails =
    annotations?.layers && annotations.layers.length > 0
      ? annotations?.layers[0].simpleView
      : false;
  const linesPaddings = !shouldHideDetails
    ? getLinesCausedPaddings(visualConfigs, yAxesMap, shouldRotate)
    : {};

  const getYAxesStyle = (axis: AxisConfiguration): RecursivePartial<AxisStyle> => {
    const tickVisible = axis.showLabels;
    const position = getOriginalAxisPosition(axis.position, shouldRotate);

    const style = {
      tickLabel: {
        fill: axis.labelColor,
        visible: tickVisible,
        rotation: axis.labelsOrientation,
        padding:
          linesPaddings[position] != null
            ? {
                inner: linesPaddings[position],
              }
            : undefined,
      },
      axisTitle: {
        visible: axis.showTitle,
        // if labels are not visible add the padding to the title
        padding:
          !tickVisible && linesPaddings[position] != null
            ? {
                inner: linesPaddings[position],
              }
            : undefined,
      },
    };
    return style;
  };

  const getYAxisDomain = (axis: GroupsConfiguration[number]) => {
    const extent: AxisExtentConfigResult = axis.extent || {
      type: 'axisExtentConfig',
      mode: 'full',
    };
    const hasBarOrArea = Boolean(
      axis.series.some((series) => {
        const layer = layersById[series.layer];
        if (!(layer && isDataLayer(layer))) {
          return false;
        }

        return layer.seriesType === SeriesTypes.BAR || layer.seriesType === SeriesTypes.AREA;
      })
    );

    const fit = Boolean(
      (!hasBarOrArea || axis.extent?.enforce) && extent.mode === AxisExtentModes.DATA_BOUNDS
    );
    const padding = axis.boundsMargin || undefined;

    let min: number = NaN;
    let max: number = NaN;
    if (extent.mode === 'custom') {
      const validExtent = validateExtent(hasBarOrArea, extent);
      if (validExtent || extent.enforce) {
        min = extent.lowerBound ?? NaN;
        max = extent.upperBound ?? NaN;
      }
    }

    return {
      fit,
      min,
      max,
      padding,
      includeDataFromIds: referenceLineLayers
        .flatMap(
          (l) => l.decorations?.map((decoration) => ({ layerId: l.layerId, decoration })) || []
        )
        .filter(({ decoration }) => {
          if (decoration.axisId) {
            return axis.groupId.includes(decoration.axisId);
          }

          return (
            axis.position === getAxisPosition(decoration.position ?? Position.Left, shouldRotate)
          );
        })
        .map(({ layerId, decoration }) =>
          isReferenceLineDecorationConfig(decoration)
            ? `${layerId}-${decoration.value}-${decoration.fill !== 'none' ? 'rect' : 'line'}`
            : `${layerId}-${decoration.forAccessor}-${decoration.fill !== 'none' ? 'rect' : 'line'}`
        ),
    };
  };

  const shouldShowValueLabels = !uiState || valueLabels !== ValueLabelModes.HIDE;

  const valueLabelsStyling =
    shouldShowValueLabels &&
    valueLabels !== ValueLabelModes.HIDE &&
    getValueLabelsStyling(shouldRotate);

  const clickHandler: ElementClickListener = ([elementEvent]) => {
    // this cast is safe because we are rendering a cartesian chart
    const [xyGeometry, xySeries] = elementEvent as XYChartElementEvent;

    const layer = dataLayers.find((l) =>
      xySeries.seriesKeys.some((key: string | number) =>
        l.accessors.some(
          (accessor) => getAccessorByDimension(accessor, l.table.columns) === key.toString()
        )
      )
    );

    if (!layer) {
      return;
    }
    const { table } = layer;

    const xSeriesPoint = getXSeriesPoint(
      layer,
      xyGeometry.x,
      fieldFormats,
      formattedDatatables,
      xAxisFormatter,
      formatFactory
    );

    const splitPoints: FilterEvent['data']['data'] = [];

    if (xySeries.seriesKeys.length > 1) {
      xySeries.splitAccessors.forEach((value, accessor) => {
        const point = createSplitPoint(
          accessor,
          value,
          formattedDatatables[layer.layerId].table.rows,
          table
        );
        if (point) {
          splitPoints.push(point);
        }
      });
    }

    if (xySeries.smHorizontalAccessorValue && splitColumnAccessor) {
      const accessor = getAccessorByDimension(splitColumnAccessor, table.columns);
      const point = createSplitPoint(
        accessor,
        xySeries.smHorizontalAccessorValue,
        formattedDatatables[layer.layerId].table.rows,
        table
      );
      if (point) {
        splitPoints.push(point);
      }
    }

    if (xySeries.smVerticalAccessorValue && splitRowAccessor) {
      const accessor = getAccessorByDimension(splitRowAccessor, table.columns);
      const point = createSplitPoint(
        accessor,
        xySeries.smVerticalAccessorValue,
        formattedDatatables[layer.layerId].table.rows,
        table
      );
      if (point) {
        splitPoints.push(point);
      }
    }

    const context: FilterEvent['data'] = {
      data: [xSeriesPoint, ...splitPoints],
    };
    onClickValue(context);
  };

  const brushHandler = ({ x }: XYBrushEvent) => {
    if (!x) {
      return;
    }
    const [min, max] = x;
    if (!xAxisColumn || !isHistogramViz) {
      return;
    }

    const { table } = dataLayers[0];
    const xAccessor =
      dataLayers[0].xAccessor !== undefined
        ? getAccessorByDimension(dataLayers[0].xAccessor, table.columns)
        : undefined;
    const xAxisColumnIndex = table.columns.findIndex((el) => el.id === xAccessor);
    const context: BrushEvent['data'] = {
      range: [min, max],
      table,
      column: xAxisColumnIndex,
      ...(isEsqlMode
        ? {
            timeFieldName:
              table.columns[xAxisColumnIndex].meta.sourceParams?.sourceField?.toString(),
          }
        : {}),
    };
    onSelectRange(context);
  };

  const legendInsideParams: LegendPositionConfig = {
    vAlign: legend.verticalAlignment ?? VerticalAlignment.Top,
    hAlign: legend?.horizontalAlignment ?? HorizontalAlignment.Right,
    direction: LayoutDirection.Vertical,
    floating: true,
    floatingColumns: legend?.floatingColumns ?? 1,
  };

  const isHistogramModeEnabled = dataLayers.some(
    ({ isHistogram, seriesType, isStacked }) =>
      isHistogram && (isStacked || seriesType !== SeriesTypes.BAR || !chartHasMoreThanOneBarSeries)
  );

  const isHorizontalTimeAxis = isTimeViz && isHistogramModeEnabled && !shouldRotate;

  const defaultXAxisPosition = shouldRotate ? Position.Left : Position.Bottom;

  const gridLineStyle = {
    visible: xAxisConfig?.showGridLines,
    strokeWidth: 1,
  };

  const xAxisStyle: RecursivePartial<AxisStyle> = isHorizontalTimeAxis
    ? {
        tickLabel: {
          visible: Boolean(xAxisConfig?.showLabels),
          fill: xAxisConfig?.labelColor,
        },
        tickLine: {
          visible: Boolean(xAxisConfig?.showLabels),
        },
        axisTitle: {
          visible: xAxisConfig?.showTitle,
        },
      }
    : {
        tickLabel: {
          visible: xAxisConfig?.showLabels,
          rotation: xAxisConfig?.labelsOrientation,
          padding: linesPaddings.bottom != null ? { inner: linesPaddings.bottom } : undefined,
          fill: xAxisConfig?.labelColor,
        },
        axisTitle: {
          visible: xAxisConfig?.showTitle,
          padding:
            !xAxisConfig?.showLabels && linesPaddings.bottom != null
              ? { inner: linesPaddings.bottom }
              : undefined,
        },
      };
  const isSplitChart = splitColumnAccessor || splitRowAccessor;
  const splitTable = isSplitChart ? dataLayers[0].table : undefined;
  const splitColumnId =
    splitColumnAccessor && splitTable
      ? getAccessorByDimension(splitColumnAccessor, splitTable?.columns)
      : undefined;

  const splitRowId =
    splitRowAccessor && splitTable
      ? getAccessorByDimension(splitRowAccessor, splitTable?.columns)
      : undefined;

  const chartContainerStyle = css({
    width: '100%',
    height: '100%',
    overflowX: 'hidden',
    position: uiState ? 'absolute' : 'relative',
  });

  const { theme: settingsThemeOverrides = {}, ...settingsOverrides } = getOverridesFor(
    overrides,
    'settings'
  ) as Partial<SettingsProps>;

  const referenceLinesFormatters = getReferenceLinesFormattersMap(
    referenceLineLayers,
    formatFactory
  );

  // ES|QL charts are allowed to create alert rules only in dashboards
  const applicationQuery = data.query.queryString.getQuery();
  const canCreateAlerts =
    isEsqlMode && applicationQuery && !isOfAggregateQueryType(applicationQuery);

  return (
    <>
      <GlobalXYChartStyles />
      <div css={chartContainerStyle}>
        {showLegend !== undefined && uiState && (
          <LegendToggle
            onClick={toggleLegend}
            showLegend={showLegend}
            legendPosition={legend.position}
          />
        )}
        <LegendColorPickerWrapperContext.Provider
          value={{
            uiState,
            setColor,
            legendPosition: legend.position,
            dataLayers,
            formattedDatatables,
            titles,
            fieldFormats,
            singleTable,
          }}
        >
          <Chart ref={chartRef} {...getOverridesFor(overrides, 'chart')}>
            <Tooltip<Record<string, string | number>, XYChartSeriesIdentifier>
              boundary={appFixedViewport}
              headerFormatter={
                !args.detailedTooltip && xAxisColumn
                  ? ({ value }) => (
                      <TooltipHeader
                        value={value}
                        formatter={safeXAccessorLabelRenderer}
                        xDomain={rawXDomain}
                      />
                    )
                  : undefined
              }
              actions={getTooltipActions(
                dataLayers,
                onClickMultiValue,
                onCreateAlertRule,
                fieldFormats,
                formattedDatatables,
                xAxisFormatter,
                formatFactory,
                isEsqlMode,
                canCreateAlerts,
                interactive && !args.detailedTooltip
              )}
              customTooltip={
                args.detailedTooltip
                  ? ({ header, values }) => (
                      <CustomTooltip
                        header={header}
                        values={values}
                        titles={titles}
                        fieldFormats={fieldFormats}
                        formatFactory={formatFactory}
                        formattedDatatables={formattedDatatables}
                        splitAccessors={{
                          splitColumnAccessor: splitColumnId,
                          splitRowAccessor: splitRowId,
                        }}
                        layers={dataLayers}
                        xDomain={isTimeViz ? rawXDomain : undefined}
                      />
                    )
                  : undefined
              }
              type={args.showTooltip ? TooltipType.VerticalCursor : TooltipType.None}
              footer={TooltipFooter}
            />
            <Settings
              noResults={
                <EmptyPlaceholder
                  icon={icon}
                  renderComplete={onRenderChange}
                  css={xyChartEmptyStyles}
                />
              }
              onRenderChange={onRenderChange}
              pointerUpdateDebounce={0} // use the `handleCursorUpdate` debounce time
              onPointerUpdate={syncCursor ? handleCursorUpdate : undefined}
              externalPointerEvents={{
                tooltip: { visible: syncTooltips, placement: Placement.Right },
              }}
              legendColorPicker={uiState ? LegendColorPickerWrapper : undefined}
              debugState={window._echDebugStateFlag ?? false}
              showLegend={showLegend}
              legendPosition={legend?.isInside ? legendInsideParams : legend.position}
              legendLayout={getLegendLayout({
                isInside: legend.isInside,
                position: legend.position,
                layout: legend.layout,
              })}
              legendSize={LegendSizeToPixels[legend.legendSize ?? DEFAULT_LEGEND_SIZE]}
              legendValues={isHistogramViz ? legend.legendStats : []}
              legendTitle={getLegendTitle(legend.title, dataLayers[0], legend.isTitleVisible)}
              legendActionOnHover={interactive}
              theme={[
                {
                  barSeriesStyle: {
                    ...valueLabelsStyling,
                  },
                  background: {
                    color: undefined, // removes background for embeddables
                  },
                  legend: {
                    labelOptions: legend.shouldTruncate
                      ? {
                          maxLines: legend?.maxLines ?? 1,
                          widthLimit: DEFAULT_LEGEND_TRUNCATE_WIDTH_LIMIT,
                        }
                      : {
                          maxLines: 0,
                          widthLimit: 0,
                        },
                  },
                  // if not title or labels are shown for axes, add some padding if required by reference line markers
                  chartMargins: {
                    // Temporary margin defaults
                    ...LEGACY_LIGHT_THEME.chartMargins,
                    ...computeChartMargins(
                      linesPaddings,
                      { ...tickLabelsVisibilitySettings, x: xAxisConfig?.showLabels },
                      { ...axisTitlesVisibilitySettings, x: xAxisConfig?.showTitle },
                      yAxesMap,
                      shouldRotate
                    ),
                  },
                  markSizeRatio: args.markSizeRatio,
                },
                ...(Array.isArray(settingsThemeOverrides)
                  ? settingsThemeOverrides
                  : [settingsThemeOverrides]),
              ]}
              baseTheme={chartBaseTheme}
              allowBrushingLastHistogramBin={isTimeViz}
              rotation={shouldRotate ? 90 : 0}
              xDomain={xDomain}
              // enable brushing only for time charts, for both ES|QL and DSL queries
              onBrushEnd={interactive ? (brushHandler as BrushEndListener) : undefined}
              onElementClick={interactive ? clickHandler : undefined}
              legendAction={
                interactive
                  ? getLegendAction(
                      dataLayers,
                      onClickValue,
                      layerCellValueActions,
                      fieldFormats,
                      formattedDatatables,
                      titles,
                      singleTable
                    )
                  : undefined
              }
              ariaLabel={args.ariaLabel}
              ariaUseDefaultSummary={!args.ariaLabel}
              orderOrdinalBinsBy={
                args.orderBucketsBySum
                  ? {
                      direction: Direction.Descending,
                    }
                  : undefined
              }
              locale={i18n.getLocale()}
              {...settingsOverrides}
            />
            <XYCurrentTime
              enabled={Boolean(args.addTimeMarker && isTimeViz)}
              isDarkMode={darkMode}
              domain={rawXDomain}
            />

            <Axis
              id="x"
              position={
                xAxisConfig?.position
                  ? getOriginalAxisPosition(xAxisConfig?.position, shouldRotate)
                  : defaultXAxisPosition
              }
              title={xTitle}
              gridLine={gridLineStyle}
              hide={xAxisConfig?.hide || dataLayers[0]?.simpleView || !dataLayers[0]?.xAccessor}
              tickFormat={(d) => safeXAccessorLabelRenderer(d) || ''}
              maximumFractionDigits={xTickDecimals}
              style={xAxisStyle}
              showOverlappingLabels={xAxisConfig?.showOverlappingLabels}
              showDuplicatedTicks={xAxisConfig?.showDuplicates}
              tickLabelMaxLength={
                xAxisConfig?.truncate ?? (isHorizontalBarChart ? '40%' : undefined)
              }
              tickLabelTruncate={
                // If legacy truncate is set, preserve end truncation behavior.
                isHorizontalBarChart ? (xAxisConfig?.truncate ? 'end' : 'middle') : undefined
              }
              {...getOverridesFor(overrides, 'axisX')}
            />
            {isSplitChart && splitTable && (
              <SplitChart
                splitColumnAccessor={splitColumnAccessor}
                splitRowAccessor={splitRowAccessor}
                columns={splitTable.columns}
              />
            )}
            {yAxesConfiguration.map((axis) => {
              const tickDecimals = axis.formatter
                ? getDecimalsFromFormat(axis.formatter)
                : undefined;

              return (
                <Axis
                  key={axis.groupId}
                  id={axis.groupId}
                  groupId={axis.groupId}
                  position={axis.position}
                  title={axis.title || getYAxesTitles(axis.series)}
                  gridLine={{
                    visible: axis.showGridLines,
                  }}
                  hide={axis.hide || dataLayers[0]?.simpleView}
                  tickFormat={(d) => axis.formatter?.convertToText(d) || ''}
                  maximumFractionDigits={tickDecimals}
                  style={getYAxesStyle(axis)}
                  domain={getYAxisDomain(axis)}
                  showOverlappingLabels={axis.showOverlappingLabels}
                  showDuplicatedTicks={axis.showDuplicates}
                  tickLabelMaxLength={axis.truncate}
                  {...getOverridesFor(
                    overrides,
                    /left/i.test(axis.groupId) ? 'axisLeft' : 'axisRight'
                  )}
                />
              );
            })}

            {!hideEndzones && (
              <XyEndzones
                baseDomain={rawXDomain}
                extendedDomain={xDomain}
                darkMode={darkMode}
                histogramMode={dataLayers.every(
                  (layer) =>
                    layer.isHistogram &&
                    (layer.isStacked || !layer.splitAccessors || !layer.splitAccessors.length) &&
                    (layer.isStacked ||
                      layer.seriesType !== SeriesTypes.BAR ||
                      !chartHasMoreThanOneBarSeries)
                )}
              />
            )}

            {dataLayers.length && (
              <DataLayers
                titles={titles}
                layers={dataLayers}
                endValue={endValue}
                timeZone={timeZone}
                syncColors={syncColors}
                valueLabels={valueLabels}
                fillOpacity={args.fillOpacity}
                minBarHeight={args.minBarHeight}
                formatFactory={formatFactory}
                paletteService={paletteService}
                palettes={palettes}
                fittingFunction={fittingFunction}
                emphasizeFitting={emphasizeFitting}
                yAxesConfiguration={yAxesConfiguration}
                xAxisConfiguration={
                  xAxisConfig ? axesConfiguration[axesConfiguration.length - 1] : undefined
                }
                shouldShowValueLabels={shouldShowValueLabels}
                formattedDatatables={formattedDatatables}
                chartHasMoreThanOneBarSeries={chartHasMoreThanOneBarSeries}
                defaultXScaleType={defaultXScaleType}
                fieldFormats={fieldFormats}
                uiState={uiState}
                singleTable={singleTable}
                isDarkMode={darkMode}
                pointVisibility={pointVisibility}
              />
            )}
            {referenceLineLayers.length ? (
              <ReferenceLines
                layers={referenceLineLayers}
                xAxisFormatter={xAxisFormatter}
                axesConfiguration={axesConfiguration}
                isHorizontal={shouldRotate}
                paddingMap={linesPaddings}
                titles={titles}
                yAxesMap={yAxesMap}
                formatters={referenceLinesFormatters}
              />
            ) : null}
            {(rangeAnnotations.length || lineAnnotations.length) && isTimeViz ? (
              <Annotations
                rangeAnnotations={rangeAnnotations}
                groupedLineAnnotations={groupedLineAnnotations}
                timeFormat={timeFormat}
                isHorizontal={shouldRotate}
                paddingMap={linesPaddings}
                isBarChart={filteredBarLayers.length > 0}
                minInterval={minInterval}
                simpleView={shouldHideDetails}
                outsideDimension={
                  rangeAnnotations.length && shouldHideDetails
                    ? OUTSIDE_RECT_ANNOTATION_WIDTH_SUGGESTION
                    : isHorizontalTimeAxis
                    ? MULTILAYER_TIME_AXIS_TICKLINE_PADDING + chartBaseTheme.axes.tickLabel.fontSize
                    : Math.max(chartBaseTheme.axes.tickLine.size, OUTSIDE_RECT_ANNOTATION_WIDTH)
                }
              />
            ) : null}
          </Chart>
        </LegendColorPickerWrapperContext.Provider>
      </div>
    </>
  );
}

const defaultLegendTitle = i18n.translate('expressionXY.xyChart.legendTitle', {
  defaultMessage: 'Legend',
});

function getLegendTitle(
  title: string | undefined,
  layer?: CommonXYDataLayerConfig,
  isTitleVisible?: boolean
) {
  if (!isTitleVisible) {
    return undefined;
  }
  if (typeof title === 'string' && title.length > 0) {
    return title;
  }

  const splitAccessorNames =
    layer?.splitAccessors?.reduce<string[]>((acc, accessor) => {
      const column = layer?.table.columns.find((c) => c.id === accessor);
      if (column?.name) {
        acc.push(column.name);
      }
      return acc;
    }, []) ?? [];

  return splitAccessorNames.length > 0
    ? splitAccessorNames.join(MULTI_FIELD_KEY_SEPARATOR)
    : defaultLegendTitle;
}

const xyChartEmptyStyles = css({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
});
