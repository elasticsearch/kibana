/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Quick-range presets for the Intelligence Hub dashboard (no custom date picker). */
export const TIME_RANGE_PRESET_IDS = ['24h', '7d', '30d', '90d'] as const;

export type TimeRangePresetId = (typeof TIME_RANGE_PRESET_IDS)[number];

export const DEFAULT_TIME_RANGE_PRESET: TimeRangePresetId = '7d';

const PRESET_DURATION_MS: Record<TimeRangePresetId, number> = {
  '24h': 24 * HOUR_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
  '90d': 90 * DAY_MS,
};

export interface ResolvedTimeRange {
  readonly from: string;
  readonly to: string;
}

export const isTimeRangePresetId = (value: string): value is TimeRangePresetId =>
  (TIME_RANGE_PRESET_IDS as readonly string[]).includes(value);

/**
 * Resolve a quick-range preset to ISO `from` / `to` bounds for the dashboard
 * overview API. `to` is always `now` at resolution time so manual refresh
 * slides the window forward with the clock.
 */
export const resolveTimeRangeFromPreset = (
  preset: TimeRangePresetId,
  nowMs: number = Date.now()
): ResolvedTimeRange => {
  const to = new Date(nowMs).toISOString();
  const from = new Date(nowMs - PRESET_DURATION_MS[preset]).toISOString();
  return { from, to };
};
