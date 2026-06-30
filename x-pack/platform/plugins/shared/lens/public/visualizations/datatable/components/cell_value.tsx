/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useContext, useEffect, useMemo, useRef } from 'react';
import type { EuiDataGridCellValueElementProps } from '@elastic/eui';
import { getFallbackDataBounds } from '@kbn/coloring';
import { makeHighContrastColor, useEuiTheme } from '@elastic/eui';
import type { PaletteOutput, PaletteRegistry } from '@kbn/coloring';
import type { CustomPaletteState } from '@kbn/charts-plugin/common';
import type { RawValue } from '@kbn/data-plugin/common';
import { getOriginalId } from '@kbn/transpose-utils';
import type { DataGridDensity } from '@kbn/lens-common';
import type { FormatFactory } from '../../../../common/types';
import type { DatatableColumnConfig } from '../../../../common/expressions';
import type { DataContextType } from './types';
import type { CellColorFn } from '../../../shared_components/coloring/get_cell_color_fn';
import {
  getProgressBarDomain,
  getProgressBarPaletteStops,
  DEFAULT_PROGRESS_BAR_COLOR,
} from '../utils';
import { parseCellDecorationFillConfig } from '../cell_decoration';
import {
  buildColumnConfigLookup,
  getRenderMode,
  applyCellColoring,
  isEmptyValue,
  FormattedCell,
  LinkCell,
  BadgeCell,
} from './cell_value_helpers';
import {
  ProgressBarCell,
  getMeterFill,
  getProgressBarLabelWidthCh,
  getProgressBarSize,
  toMeterColorStops,
} from './progress_bar_cell';

export const createGridCell = (
  formatters: Record<string, ReturnType<FormatFactory>>,
  columnConfig: DatatableColumnConfig,
  DataContext: React.Context<DataContextType>,
  isDarkMode: boolean,
  getCellColor: (
    originalId: string,
    palette?: PaletteOutput<CustomPaletteState>,
    colorMapping?: string
  ) => CellColorFn,
  paletteService: PaletteRegistry,
  fitRowToContent?: boolean,
  density?: DataGridDensity
) => {
  const columnConfigLookup = buildColumnConfigLookup(columnConfig.columns);
  const progressBarSize = getProgressBarSize(density);

  return ({ rowIndex, columnId, setCellProps, isExpanded }: EuiDataGridCellValueElementProps) => {
    const { table, alignments, handleFilterClick, minMaxByColumnId } = useContext(DataContext);
    const { euiTheme } = useEuiTheme();
    const hasColorStyleRef = useRef(false);

    const rawValue: RawValue = table?.rows[rowIndex]?.[columnId];
    const formatter = formatters[columnId];
    const currentColumnConfig = columnConfigLookup.get(columnId);
    const colIndex = currentColumnConfig?.colIndex ?? -1;
    const {
      oneClickFilter,
      colorMode = 'none',
      palette,
      colorMapping,
      fillStyle: rawFillStyle,
    } = currentColumnConfig ?? {};

    const isClickable = Boolean(oneClickFilter && handleFilterClick);
    const isNonColorable = isEmptyValue(rawValue);
    const renderMode = getRenderMode(colorMode, isClickable, isNonColorable);

    const fallbackText = rawValue == null ? '' : String(rawValue);

    const alignment = alignments?.get(columnId);

    const onFilter = () => handleFilterClick?.(columnId, rawValue, colIndex, rowIndex);

    const cellStyle = useMemo(
      () =>
        applyCellColoring({
          colorMode,
          columnId,
          palette,
          colorMapping,
          rawValue,
          getCellColor,
          isDarkMode,
        }),
      [colorMode, columnId, palette, colorMapping, rawValue]
    );

    const fillStyle = useMemo(() => parseCellDecorationFillConfig(rawFillStyle), [rawFillStyle]);

    const progressBarProps = useMemo(() => {
      if (renderMode !== 'progress' || !fillStyle || typeof rawValue !== 'number') {
        return null;
      }
      const dataBounds = minMaxByColumnId?.get(getOriginalId(columnId)) ?? getFallbackDataBounds();
      const { min, max } = getProgressBarDomain({ fillStyle, palette }, dataBounds);
      // Recompute default-palette stops when the serialized palette omits them,
      // so solid/gradient bars are colored rather than falling back to a flat color.
      const paletteStops = getProgressBarPaletteStops(
        paletteService,
        dataBounds,
        palette?.params?.colors,
        palette?.params?.stops
      );
      const colorStops = toMeterColorStops(
        paletteStops.map(({ color }) => color),
        paletteStops.map(({ stop }) => stop)
      );
      const fill = getMeterFill(fillStyle, colorStops, DEFAULT_PROGRESS_BAR_COLOR);
      // Size the value gutter to the column's widest formatted bound so every
      // row's bar shares the same edge regardless of digit count.
      const labelWidthCh = getProgressBarLabelWidthCh(formatter, dataBounds.min, dataBounds.max);
      return {
        domain: [min, max] as [number, number],
        fill,
        labelWidthCh,
        baseline: fillStyle.baseline,
      };
    }, [renderMode, fillStyle, rawValue, minMaxByColumnId, columnId, palette, formatter]);

    const badgeColor = useMemo(() => {
      if (renderMode !== 'badge') return null;
      if (isEmptyValue(rawValue)) return null;
      // Always delegate to getCellColor: when no palette/colorMapping is configured
      // (e.g. via the as-code Lens API) the factory resolves sensible defaults so badges
      // are colored automatically, mirroring the cell/text coloring behavior.
      const color = getCellColor(columnId, palette, colorMapping)(rawValue);
      return color || null;
    }, [renderMode, columnId, palette, colorMapping, rawValue]);

    useEffect(() => {
      // Cell/text coloring is applied via setCellProps (affects the EuiDataGrid cell container).
      // Badge mode handles its own color inline; none means no coloring.
      if (!cellStyle) {
        // EuiDataGrid virtualizes/reuses cells, so ensure we clear any previously applied styles
        // when this cell should not be colored (e.g. null/blank/NaN, or coloring disabled).
        if (hasColorStyleRef.current) {
          setCellProps({ style: { backgroundColor: undefined, color: undefined } });
          hasColorStyleRef.current = false;
        }
        return;
      }

      setCellProps({ style: cellStyle });
      hasColorStyleRef.current = true;

      // Clean up styles when dependencies change to avoid stale colors sticking.
      // Skip cleanup when the cell is expanded — it would clear the expanded panel's style.
      if (!isExpanded) {
        return () => {
          setCellProps({ style: { backgroundColor: undefined, color: undefined } });
          hasColorStyleRef.current = false;
        };
      }
    }, [cellStyle, setCellProps, isExpanded]);

    switch (renderMode) {
      case 'badge':
        return (
          <BadgeCell
            label={formatter?.convertToText(rawValue) ?? fallbackText}
            badgeColor={badgeColor}
            isClickable={isClickable}
            onClick={onFilter}
            isDarkMode={isDarkMode}
            alignment={alignment}
            fitRowToContent={fitRowToContent}
          />
        );

      case 'progress':
        // Fall back to a formatted cell when the domain/fill cannot be resolved.
        if (!progressBarProps) {
          return (
            <FormattedCell
              content={formatter?.convertToReact(rawValue) ?? fallbackText}
              alignment={alignment}
              fitRowToContent={fitRowToContent}
              isColored={false}
            />
          );
        }
        return (
          <ProgressBarCell
            value={rawValue as number}
            label={formatter?.convertToReact(rawValue) ?? fallbackText}
            domain={progressBarProps.domain}
            fill={progressBarProps.fill}
            size={progressBarSize}
            alignment={alignment}
            labelWidthCh={progressBarProps.labelWidthCh}
            baseline={progressBarProps.baseline}
            fitRowToContent={fitRowToContent}
            ariaLabel={formatter?.convertToText(rawValue) ?? fallbackText}
            onLabelClick={isClickable ? onFilter : undefined}
          />
        );

      case 'link': {
        const backgroundColor =
          colorMode === 'cell' && !isEmptyValue(rawValue)
            ? getCellColor(columnId, palette, colorMapping)(rawValue)
            : null;
        const baseColor = euiTheme.colors.link;
        // Only adjust link contrast when the cell background is colored (colorMode: cell).
        const linkColor =
          colorMode === 'cell' && backgroundColor
            ? makeHighContrastColor(
                isDarkMode ? euiTheme.colors.highlight : baseColor, // preferred foreground
                4.5 // WCAG AA contrast ratio (default in EUI)
              )(backgroundColor)
            : baseColor;

        return (
          <LinkCell
            content={formatter?.convertToText(rawValue) ?? fallbackText}
            linkColor={linkColor}
            onClick={onFilter}
            alignment={alignment}
            fitRowToContent={fitRowToContent}
          />
        );
      }

      case 'formatted':
      default:
        return (
          <FormattedCell
            content={formatter?.convertToReact(rawValue) ?? fallbackText}
            alignment={alignment}
            fitRowToContent={fitRowToContent}
            isColored={Boolean(cellStyle)}
          />
        );
    }
  };
};
