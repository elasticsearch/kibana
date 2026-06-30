/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ColorMapping,
  ColorStop,
  CustomPaletteParams,
  DataBounds,
  PaletteOutput,
  PaletteRegistry,
} from '@kbn/coloring';
import {
  applyPaletteParams,
  CUSTOM_PALETTE,
  DEFAULT_COLOR_MAPPING_CONFIG,
  hasPaletteStops,
} from '@kbn/coloring';
import { getOriginalId } from '@kbn/transpose-utils';
import type { Datatable } from '@kbn/expressions-plugin/common';
import type {
  ColumnCellDecorationMode,
  CellDecorationFillMode,
  CellDecorationFillConfig,
  CellDecorationValueRange,
} from '@kbn/lens-common';
import { defaultPaletteParams, findMinMaxByColumnId } from '../../shared_components';
import { getCellDecorationCapabilities } from './cell_decoration';

export function getColumnAlignment<C extends { alignment?: 'left' | 'right' | 'center' }>(
  { alignment }: C,
  isNumeric = false
): 'left' | 'right' | 'center' {
  if (alignment) return alignment;
  return isNumeric ? 'right' : 'left';
}

export function hasIncompatibleColorConfig({
  colorByTerms,
  palette,
  colorMapping,
}: {
  colorByTerms: boolean;
  palette?: PaletteOutput<{ stops?: ColorStop[] | number[] }>;
  colorMapping?: ColorMapping.Config | string;
}): boolean {
  const isValueBasedPalette = hasPaletteStops(palette);
  const hasColorMappingOnNumeric = !colorByTerms && colorMapping != null;
  // To avoid warnings on current SOs with both palette and color mapping defined, we need to check if the palette is value based and if the color mapping is not defined.
  const hasValuePaletteOnBucket = colorByTerms && isValueBasedPalette && !colorMapping;
  return hasColorMappingOnNumeric || hasValuePaletteOnBucket;
}

/**
 * Resolves the column IDs for a given accessor
 */
function getColumnIds(
  accessor: string,
  currentData?: Datatable,
  stateColumns?: Array<{ isTransposed?: boolean }>
): string[] {
  const hasTransposedColumn = stateColumns?.some(({ isTransposed }) => isTransposed);
  if (!hasTransposedColumn) return [accessor];
  return (
    currentData?.columns.filter(({ id }) => getOriginalId(id) === accessor).map(({ id }) => id) ??
    []
  );
}

/**
 * Gets data bounds for an accessor
 */
export function getDataBoundsForAccessor(
  accessor: string,
  currentData?: Datatable,
  stateColumns?: Array<{ isTransposed?: boolean }>
): DataBounds | undefined {
  const columnsToCheck = getColumnIds(accessor, currentData, stateColumns);
  const minMaxByColumnId = findMinMaxByColumnId(columnsToCheck, currentData);
  return minMaxByColumnId.get(accessor);
}

export function getColorByValuePalette(
  paletteService: PaletteRegistry,
  dataBounds: DataBounds,
  existingPalette?: PaletteOutput<CustomPaletteParams>
): PaletteOutput<CustomPaletteParams> {
  // Use existing palette or create default
  const activePalette: PaletteOutput<CustomPaletteParams> = existingPalette
    ? {
        type: 'palette',
        name: existingPalette.name,
        params: { ...existingPalette.params },
      }
    : {
        type: 'palette',
        name: defaultPaletteParams.name,
        params: { ...defaultPaletteParams },
      };

  // For non-custom palettes -> update the stops with computed values
  if (activePalette.name !== CUSTOM_PALETTE) {
    const computedStops = applyPaletteParams(paletteService, activePalette, dataBounds);

    activePalette.params = {
      ...activePalette.params,
      stops: computedStops,
    };
  }

  return activePalette;
}

/**
 * Applies correct default color configuration
 */
export function getColorDefaults({
  colorByTerms,
  paletteService,
  dataBounds,
}: {
  colorByTerms: boolean;
  paletteService: PaletteRegistry;
  dataBounds: DataBounds;
}): {
  palette: PaletteOutput<CustomPaletteParams> | undefined;
  colorMapping: ColorMapping.Config | undefined;
} {
  if (colorByTerms) {
    return {
      palette: undefined,
      colorMapping: DEFAULT_COLOR_MAPPING_CONFIG,
    };
  }

  const palette = getColorByValuePalette(paletteService, dataBounds);
  return { palette, colorMapping: undefined };
}

// Per-decoration defaults live in the cell-decoration capability registry; these
// re-exports keep the existing `../utils` import surface stable for consumers.
export { DEFAULT_PROGRESS_BAR_COLOR, getDecorationDefaultColor } from './cell_decoration';

/**
 * Seeds a fresh fill config for a decoration. Applied only when a column has no
 * existing `fillStyle`, so persisted values are never overridden.
 *
 * The fill mode and color are taken from the decoration's capabilities, so each
 * decoration dictates its own seed from a single source of truth.
 */
export function getDefaultFillConfig(
  colorMode: ColumnCellDecorationMode = 'progress'
): CellDecorationFillConfig {
  const { defaultFillMode, defaultColor } = getCellDecorationCapabilities(colorMode);
  return {
    fillMode: defaultFillMode ?? 'single',
    color: defaultColor,
    valueRange: { mode: 'auto' },
  };
}

export function isPaletteFillMode(fillMode: CellDecorationFillMode): boolean {
  return fillMode === 'solid' || fillMode === 'gradient';
}

/**
 * Resolves the bar domain `[min, max]` for a decorated column.
 *
 * - `auto`: uses the loaded column data bounds (baseline stays at `0`).
 * - `custom`: uses the explicit bounds. For solid/gradient the custom bounds live
 *   on `palette.params.rangeMin`/`rangeMax`; for single they live on
 *   `fillStyle.valueRange`. Either store is honored here so callers don't branch.
 *
 * Returns bounds already widened to include the `0` baseline so signed columns keep
 * a stable zero anchor.
 */
export interface DecorationColumnLike {
  fillStyle?: CellDecorationFillConfig;
  // Accepts either editor (`CustomPaletteParams`) or render (`CustomPaletteState`)
  // palette params; only the numeric range bounds are read here.
  palette?: { params?: { rangeMin?: number; rangeMax?: number } };
}

export function getProgressBarDomain(
  column: DecorationColumnLike,
  dataBounds: DataBounds
): { min: number; max: number } {
  const fillStyle = column.fillStyle;
  // Single fills own their custom range on `fillStyle.valueRange`; solid/gradient
  // mirror it onto the palette params. Only consult the palette for palette fills
  // so a stale `rangeMin/rangeMax` left over from a prior mode can't leak in.
  const usesPalette = fillStyle != null && isPaletteFillMode(fillStyle.fillMode);
  const paletteParams = usesPalette ? column.palette?.params : undefined;
  // Open-ended continuities store `±Infinity`; treat those as "unbounded" so they
  // don't count as an explicit custom bound and don't leak into the domain.
  const paletteRangeMin = finiteOr(paletteParams?.rangeMin, NaN);
  const paletteRangeMax = finiteOr(paletteParams?.rangeMax, NaN);
  // `fillStyle.valueRange.mode` is the source of truth: an explicit `auto`
  // recomputes from the data bounds regardless of any stale `rangeMin/rangeMax`
  // left on the palette (range retention keeps the last custom bounds around).
  // Only when no explicit mode is set (legacy / as-code columns) does the mere
  // presence of a finite palette range read as custom.
  const rangeMode = fillStyle?.valueRange?.mode;
  const isCustom =
    rangeMode === 'custom' ||
    (rangeMode == null &&
      usesPalette &&
      (!Number.isNaN(paletteRangeMin) || !Number.isNaN(paletteRangeMax)));

  let min: number;
  let max: number;

  if (isCustom) {
    min = finiteOr(fillStyle?.valueRange?.min, finiteOr(paletteRangeMin, dataBounds.min));
    max = finiteOr(fillStyle?.valueRange?.max, finiteOr(paletteRangeMax, dataBounds.max));
  } else {
    min = dataBounds.min;
    max = dataBounds.max;
  }

  // Final guard against any remaining non-finite bounds from corrupt config.
  if (!Number.isFinite(min)) min = dataBounds.min;
  if (!Number.isFinite(max)) max = dataBounds.max;

  // Normalize an inverted custom range so the bar fill direction stays correct.
  if (min > max) {
    [min, max] = [max, min];
  }

  // Keep zero inside the domain so the baseline (0) stays a stable anchor.
  min = Math.min(min, 0);
  max = Math.max(max, 0);

  // Guard against a degenerate domain.
  if (min === max) {
    max = min + 1;
  }

  return { min, max };
}

/**
 * Resolves the palette color stops (domain-valued `{ color, stop }[]`) for a
 * solid/gradient progress bar.
 *
 * The expression serializes the resolved palette `colors` for every palette, but
 * only carries explicit numeric `stops` for the `custom` palette; predefined
 * (by-name) palettes serialize empty `stops`. So the resolution order is:
 *
 * 1. `colors` + matching `stops` → zip them directly (custom palette).
 * 2. `colors` only → distribute those colors evenly across the data bounds, so
 *    the user's chosen palette is honored rather than discarded.
 * 3. nothing usable → recompute the default by-value palette from the service.
 */
export function getProgressBarPaletteStops(
  paletteService: PaletteRegistry,
  dataBounds: DataBounds,
  colors?: string[],
  stops?: number[]
): Array<{ color: string; stop: number }> {
  if (colors?.length && stops?.length) {
    return colors.reduce<Array<{ color: string; stop: number }>>((acc, color, index) => {
      const stop = stops[index];
      if (stop != null) acc.push({ color, stop });
      return acc;
    }, []);
  }

  // Predefined palettes serialize their resolved colors but omit numeric stops.
  // Spread those colors evenly across the domain so the selected palette drives
  // the bar instead of silently falling back to the default palette.
  if (colors?.length) {
    return distributeColorsAcrossDomain(colors, dataBounds);
  }

  // No usable serialized colors: recompute domain-valued stops from the default.
  const defaultPalette = getColorByValuePalette(paletteService, dataBounds);
  return defaultPalette.params?.stops ?? [];
}

/**
 * Spreads palette `colors` across `[min, max]` as evenly spaced lower-bound
 * stops (the first stop anchors at `min`). A single color collapses to one stop
 * at `min`, yielding a flat fill in that color.
 */
function distributeColorsAcrossDomain(
  colors: string[],
  { min, max }: DataBounds
): Array<{ color: string; stop: number }> {
  if (colors.length === 1) {
    return [{ color: colors[0], stop: min }];
  }
  const span = max - min;
  const step = span / colors.length;
  return colors.map((color, index) => ({ color, stop: min + step * index }));
}

/**
 * Returns `value` when it is a finite number, otherwise `fallback`.
 *
 * Open-ended palette continuities store `rangeMin`/`rangeMax` as
 * `±Infinity`, which are not caught by `??` (they are defined). Treating them as
 * "unbounded" and falling back to the data bounds keeps the editor's range
 * controls finite and on-grid.
 */
function finiteOr(value: number | undefined, fallback: number): number {
  return value != null && Number.isFinite(value) ? value : fallback;
}

/**
 * Custom value range bounds for the editor's dual-range control, reading from the
 * palette params (solid/gradient) or the dedicated single-fill field.
 *
 * Bounds are always returned as finite numbers: unset or open-ended (`±Infinity`)
 * palette ranges collapse to the loaded data bounds so the range slider never
 * receives a non-finite `min`/`max`/`value`.
 */
export function getDecorationCustomRange(
  column: DecorationColumnLike,
  dataBounds: DataBounds
): CellDecorationValueRange {
  const { fillStyle, palette } = column;
  if (!fillStyle) {
    return { mode: 'auto' };
  }

  if (isPaletteFillMode(fillStyle.fillMode)) {
    const mode = fillStyle.valueRange?.mode ?? 'auto';
    return {
      mode,
      min: finiteOr(palette?.params?.rangeMin, dataBounds.min),
      max: finiteOr(palette?.params?.rangeMax, dataBounds.max),
    };
  }

  return {
    mode: fillStyle.valueRange?.mode ?? 'auto',
    min: finiteOr(fillStyle.valueRange?.min, dataBounds.min),
    max: finiteOr(fillStyle.valueRange?.max, dataBounds.max),
  };
}
