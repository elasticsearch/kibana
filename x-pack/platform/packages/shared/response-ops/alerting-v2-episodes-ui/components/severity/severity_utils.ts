/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HeatmapElementEvent } from '@elastic/charts';
import type { EuiBadgeProps, EuiThemeComputed } from '@elastic/eui';
import { first, get, includes, isEmpty, isString, lowerCase } from 'lodash';
import * as i18n from './translations';

export enum EpisodeSeverity {
  Info = 'info',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

export const EPISODE_SEVERITIES: EpisodeSeverity[] = [
  EpisodeSeverity.Info,
  EpisodeSeverity.Low,
  EpisodeSeverity.Medium,
  EpisodeSeverity.High,
  EpisodeSeverity.Critical,
];

/** Just for the episodes list filters — episodes with no aggregated severity. */
export const EPISODE_SEVERITY_FILTER_NONE = '__no_severity__';

export const EPISODE_SEVERITY_CHART_VALUE: Record<EpisodeSeverity, number> = {
  [EpisodeSeverity.Info]: 0,
  [EpisodeSeverity.Low]: 1,
  [EpisodeSeverity.Medium]: 2,
  [EpisodeSeverity.High]: 3,
  [EpisodeSeverity.Critical]: 4,
};

interface EpisodeSeverityColorBand {
  start: EpisodeSeverity;
  end: EpisodeSeverity;
}

export const EPISODE_SEVERITY_CHART_COLOR_BANDS: readonly EpisodeSeverityColorBand[] =
  EPISODE_SEVERITIES.map((severity) => ({ start: severity, end: severity }));

const EPISODE_SEVERITY_LABELS: Record<EpisodeSeverity, string> = {
  [EpisodeSeverity.Info]: i18n.EPISODE_SEVERITY_INFO_LABEL,
  [EpisodeSeverity.Low]: i18n.EPISODE_SEVERITY_LOW_LABEL,
  [EpisodeSeverity.Medium]: i18n.EPISODE_SEVERITY_MEDIUM_LABEL,
  [EpisodeSeverity.High]: i18n.EPISODE_SEVERITY_HIGH_LABEL,
  [EpisodeSeverity.Critical]: i18n.EPISODE_SEVERITY_CRITICAL_LABEL,
};

export const EPISODE_SEVERITY_BADGE_COLORS: Record<
  EpisodeSeverity,
  NonNullable<EuiBadgeProps['color']>
> = {
  [EpisodeSeverity.Critical]: 'danger',
  [EpisodeSeverity.High]: 'risk',
  [EpisodeSeverity.Medium]: 'success',
  [EpisodeSeverity.Low]: 'primary',
  [EpisodeSeverity.Info]: 'default',
};

/** Heatmap cell fill colors aligned with `EuiBadge` fill backgrounds for each severity. */
export const getEpisodeSeverityHeatmapColor = (
  euiTheme: EuiThemeComputed,
  severity: EpisodeSeverity
): string => {
  switch (severity) {
    case EpisodeSeverity.Critical:
      return euiTheme.colors.backgroundFilledDanger;
    case EpisodeSeverity.High:
      return euiTheme.colors.backgroundFilledRisk;
    case EpisodeSeverity.Medium:
      return euiTheme.colors.backgroundFilledSuccess;
    case EpisodeSeverity.Low:
      return euiTheme.colors.backgroundFilledPrimary;
    case EpisodeSeverity.Info:
      return euiTheme.components.badgeBackground;
    default:
      return euiTheme.components.badgeBackground;
  }
};

export const isSupportedEpisodeSeverity = (
  severity: string | undefined | null
): severity is string => {
  if (!isString(severity) || isEmpty(severity)) {
    return false;
  }

  return includes(EPISODE_SEVERITIES, lowerCase(severity));
};

export const normalizeEpisodeSeverity = (severity: string): EpisodeSeverity => {
  return lowerCase(severity) as EpisodeSeverity;
};

export const getEpisodeSeverityLabel = (severity: EpisodeSeverity): string => {
  return EPISODE_SEVERITY_LABELS[severity] ?? severity;
};

export const toEpisodeSeverityChartColorBands = (
  colorForSeverity: (severity: EpisodeSeverity) => string
): Array<{ start: number; end: number; color: string; label: string }> => {
  return EPISODE_SEVERITY_CHART_COLOR_BANDS.map((band, index) => {
    const severity = band.start;
    const n = EPISODE_SEVERITY_CHART_VALUE[severity];
    const isLast = index === EPISODE_SEVERITY_CHART_COLOR_BANDS.length - 1;
    return {
      start: n,
      end: isLast ? Infinity : n + 1,
      color: colorForSeverity(severity),
      label: getEpisodeSeverityLabel(severity),
    };
  });
};

export interface HeatmapTableDatum {
  x: string | number;
  y: string | number;
  value: number;
  originalIndex: number;
}

export const getHeatmapDatumFromElementClick = <T>(
  elements: HeatmapElementEvent[],
  data: T[]
): T | undefined => {
  const heatmapEvent = first(elements);
  if (!heatmapEvent) {
    return undefined;
  }

  const cell = first(heatmapEvent);
  const tableDatum = cell?.datum as HeatmapTableDatum | undefined;
  if (tableDatum == null) {
    return undefined;
  }

  return get(data, tableDatum.originalIndex);
};

/** Returns true when the chart hover tooltip should be suppressed. */
export const shouldSuppressSeverityHeatmapTooltip = (
  selectedDatum: { x: number } | null
): boolean => selectedDatum != null;
