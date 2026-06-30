/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { type ReactNode } from 'react';
import { css } from '@emotion/react';
import { EuiLink, useEuiTheme } from '@elastic/eui';
import { Meter, MeterFillStyle, MeterSize } from '@elastic/charts';
import type { MeterColorStop, MeterFill } from '@elastic/charts';
import type { DataGridDensity, CellDecorationFillConfig } from '@kbn/lens-common';
import { LENS_DATAGRID_DENSITY } from '@kbn/lens-common';
import { getCellClassName, type Alignment } from './cell_value_helpers';

// Bar thickness per table density, expressed as `Meter` size presets
// (Small=4px, Medium=8px, Large=16px; corner radius is a fixed 8px, so Medium
// and Large both read as a full rounded pill). The normal-density bar uses the
// thick pill from the issue mockup; compact/expanded step down/up around it.
const COMPACT_BAR_HEIGHT = MeterSize.Medium;
const NORMAL_BAR_HEIGHT = MeterSize.Large;
const EXPANDED_BAR_HEIGHT = MeterSize.Large;

/** Maps the table density to a Meter thickness preset. */
export function getProgressBarSize(
  density?: DataGridDensity
): (typeof MeterSize)[keyof typeof MeterSize] {
  switch (density) {
    case LENS_DATAGRID_DENSITY.COMPACT:
      return COMPACT_BAR_HEIGHT;
    case LENS_DATAGRID_DENSITY.EXPANDED:
      return EXPANDED_BAR_HEIGHT;
    case LENS_DATAGRID_DENSITY.NORMAL:
    default:
      return NORMAL_BAR_HEIGHT;
  }
}

/**
 * Zips a render-layer palette (`CustomPaletteState`: parallel `colors`/`stops` arrays)
 * into domain-valued {@link MeterColorStop}s expected by the Meter.
 */
export function toMeterColorStops(
  colors: string[] | undefined,
  stops: number[] | undefined
): MeterColorStop[] {
  if (!colors?.length || !stops?.length) return [];
  return colors.reduce<MeterColorStop[]>((acc, color, index) => {
    const stop = stops[index];
    if (stop != null) acc.push({ color, stop });
    return acc;
  }, []);
}

/**
 * Builds the {@link MeterFill} for a decorated column from its fill mode and
 * pre-zipped, domain-valued color stops.
 *
 * Single fills use a fixed color; solid/gradient fills reveal the palette via the stops.
 */
export function getMeterFill(
  fillStyle: CellDecorationFillConfig,
  colorStops: MeterColorStop[],
  fallbackColor: string
): MeterFill {
  if (fillStyle.fillMode === 'single') {
    return { type: MeterFillStyle.Single, color: fillStyle.color ?? fallbackColor };
  }

  return {
    type: 'palette',
    style: fillStyle.fillMode === 'gradient' ? MeterFillStyle.Gradient : MeterFillStyle.Solid,
    colorStops,
    fallbackColor,
  };
}

export interface ProgressBarCellProps {
  value: number;
  label: ReactNode;
  domain: [number, number];
  fill: MeterFill;
  size: (typeof MeterSize)[keyof typeof MeterSize];
  alignment: Alignment;
  /**
   * Character width to reserve for the value gutter so the bar starts/ends at the
   * same x across rows regardless of digit count. Derived from the column's widest
   * formatted value; falls back to a small default.
   */
  labelWidthCh?: number;
  /**
   * Value at which the fill starts (defaults to `0`). The fill grows from this
   * baseline toward the value, leaving the track empty before it when the
   * baseline sits inside the domain.
   */
  baseline?: number;
  fitRowToContent?: boolean;
  ariaLabel?: string;
  /** When set, the value label becomes a one-click filter trigger. */
  onLabelClick?: () => void;
}

/** Minimum gutter width (in `ch`) when the column's widest value is unknown. */
const MIN_LABEL_WIDTH_CH = 3;

interface LabelFormatter {
  convertToText?: (value: unknown) => string;
}

/**
 * Reserves gutter width (in `ch`) from the column's widest formatted bound so the
 * bar shares a consistent edge across rows. With `tabular-nums` each character is
 * one `ch`, so the longest formatted bound's length is the column-wide gutter.
 */
export function getProgressBarLabelWidthCh(
  formatter: LabelFormatter | undefined,
  min: number,
  max: number
): number {
  const format = (n: number): string =>
    Number.isFinite(n) ? formatter?.convertToText?.(n) ?? String(n) : '';
  const widest = Math.max(format(min).length, format(max).length);
  return Math.max(widest, MIN_LABEL_WIDTH_CH);
}

const cellLayout = css`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  width: 100%;
`;

// The Meter flexes to fill the cell width next to the value label, mirroring the
// progress-bar cell decoration mockup (value beside a full-width track).
const meterContainer = css`
  flex: 1 1 auto;
  min-width: 0;
`;

// The value occupies a fixed-width gutter with tabular figures so every row's bar
// shares the same start (leading value) or end (trailing value) edge regardless of
// digit count — mirroring `NumberBadge` and the issue mockup's aligned columns.
const valueLabelBase = css`
  flex: 0 0 auto;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
`;

/**
 * Renders a numeric cell as a value label beside a horizontal {@link Meter} that
 * fills the remaining cell width.
 *
 * The value sits on the leading side for left alignment and the trailing side for
 * right alignment, following the column's text alignment so the bar grows away
 * from the value (matching the cell-decoration mockup).
 *
 * The fill starts from `baseline` (default `0`). When the fill does not begin at
 * the domain's lower edge — i.e. the baseline sits inside the domain — the start
 * fill edge is left square so the bar reads cleanly as it grows from the anchor.
 */
export const ProgressBarCell = ({
  value,
  label,
  domain,
  fill,
  size,
  alignment,
  labelWidthCh,
  baseline = 0,
  ariaLabel,
  onLabelClick,
}: ProgressBarCellProps) => {
  const { euiTheme } = useEuiTheme();
  const [min] = domain;
  // The start edge is rounded only when the fill begins at the lower domain edge.
  const fillStartsAtDomainEdge = baseline <= min;
  // Right-aligned columns keep the value on the trailing edge; everything else
  // (left/default) keeps it on the leading edge.
  const valueOnTrailingSide = alignment === 'right';

  // Reserve a fixed gutter so the value never pushes the bar's shared edge around.
  // The value hugs the bar: a leading value is right-aligned (bar starts at a fixed
  // x), a trailing value is left-aligned (bar ends at a fixed x).
  const gutterWidthCh = Math.max(labelWidthCh ?? 0, MIN_LABEL_WIDTH_CH);
  const valueLabel = css`
    ${valueLabelBase};
    min-width: ${gutterWidthCh}ch;
    text-align: ${valueOnTrailingSide ? 'left' : 'right'};
  `;

  const labelNode = onLabelClick ? (
    <EuiLink
      color="text"
      css={valueLabel}
      data-test-subj="lnsTableProgressBarLabel"
      onClick={onLabelClick}
    >
      {label}
    </EuiLink>
  ) : (
    <span css={valueLabel} data-test-subj="lnsTableProgressBarLabel">
      {label}
    </span>
  );

  const meterNode = (
    <div css={meterContainer}>
      <Meter
        value={value}
        domain={domain}
        fill={fill}
        baseline={baseline}
        roundFillStart={fillStartsAtDomainEdge}
        size={size}
        orientation="horizontal"
        trackColor={euiTheme.colors.lightShade}
        // A thin ring in the cell background color separates the fill pill from
        // the track, matching the issue mockup (and the Metric chart's bar).
        fillBorderColor={euiTheme.colors.emptyShade}
        fillBorderWidth={1}
        ariaLabel={ariaLabel}
        ariaValueNow={value}
        ariaValueMin={domain[0]}
        ariaValueMax={domain[1]}
      />
    </div>
  );

  return (
    <div
      data-test-subj="lnsTableCellContent"
      className={getCellClassName(alignment)}
      css={cellLayout}
    >
      {valueOnTrailingSide ? (
        <>
          {meterNode}
          {labelNode}
        </>
      ) : (
        <>
          {labelNode}
          {meterNode}
        </>
      )}
    </div>
  );
};
