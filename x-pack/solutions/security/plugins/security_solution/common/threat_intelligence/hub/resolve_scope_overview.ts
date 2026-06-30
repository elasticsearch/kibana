/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReportTableScope } from './attachment_payloads';
import type { ThreatCategory, ThreatRegion } from './constants';
import type { TimeRangePresetId } from './time_range';
import { resolveTimeRangeFromPreset } from './time_range';

const RELATIVE_FROM_TO_PRESET: Record<string, TimeRangePresetId> = {
  'now-24h': '24h',
  'now-7d': '7d',
  'now-30d': '30d',
  'now-90d': '90d',
};

export interface ResolvedOverviewQuery {
  from: string;
  to: string;
  categories: ThreatCategory[];
  regions: ThreatRegion[];
}

/**
 * Map a digest/search `scope` onto `DASHBOARD_OVERVIEW_API_PATH` query params so
 * the Agent Builder canvas shows the same filtered Intelligence Hub as the
 * originating `search_reports` call.
 */
export const resolveOverviewQueryFromScope = (scope?: ReportTableScope): ResolvedOverviewQuery => {
  const categories = scope?.categories ?? [];
  const regions = scope?.regions ?? [];
  const timeRange = scope?.time_range;

  if (!timeRange?.from) {
    return { ...resolveTimeRangeFromPreset('7d'), categories, regions };
  }

  const preset = RELATIVE_FROM_TO_PRESET[timeRange.from];
  const toIsNow = !timeRange.to || timeRange.to === 'now';
  if (preset && toIsNow) {
    return { ...resolveTimeRangeFromPreset(preset), categories, regions };
  }

  return {
    from: timeRange.from,
    to: toIsNow ? new Date().toISOString() : timeRange.to,
    categories,
    regions,
  };
};
