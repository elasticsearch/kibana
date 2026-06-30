/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  SEVERITY_LEVELS,
  THREAT_CATEGORIES,
  type SeverityLevel,
  type ThreatCategory,
  type ThreatRegion,
} from './constants';
import type { ReportTablePayload } from './attachment_payloads';

const isSeverityLevel = (value: unknown): value is SeverityLevel =>
  typeof value === 'string' && (SEVERITY_LEVELS as readonly string[]).includes(value);

const isThreatCategory = (value: unknown): value is ThreatCategory =>
  typeof value === 'string' && (THREAT_CATEGORIES as readonly string[]).includes(value);

export type SearchReportHit = Record<string, unknown> & {
  report_id?: string;
  score?: number | null;
};

export const formatTimeRangeLabel = (timeRange?: { from: string; to: string }): string => {
  if (!timeRange) {
    return 'All time';
  }
  if (timeRange.from === 'now-7d' && (timeRange.to === 'now' || !timeRange.to)) {
    return 'Last 7 days';
  }
  return `${timeRange.from} → ${timeRange.to}`;
};

export const mapSearchReportHitToTableRow = (
  hit: SearchReportHit
): ReportTablePayload['reports'][number] => {
  const title =
    typeof hit.content === 'object' &&
    hit.content !== null &&
    'title' in hit.content &&
    typeof (hit.content as { title?: unknown }).title === 'string'
      ? (hit.content as { title: string }).title
      : 'Untitled report';

  const source =
    typeof hit.source === 'object' && hit.source !== null
      ? (hit.source as { type?: string; name?: string; url?: string })
      : {};

  const severityRaw =
    typeof hit.severity === 'object' && hit.severity !== null && 'level' in hit.severity
      ? (hit.severity as { level?: unknown }).level
      : undefined;

  const extracted =
    typeof hit.extracted === 'object' && hit.extracted !== null
      ? (hit.extracted as { ttps?: { techniques?: unknown } })
      : undefined;

  const techniquesRaw = extracted?.ttps?.techniques;
  const techniques = Array.isArray(techniquesRaw)
    ? techniquesRaw.filter((t): t is string => typeof t === 'string')
    : [];

  const categoriesRaw =
    typeof hit.extracted === 'object' && hit.extracted !== null && 'categories' in hit.extracted
      ? (hit.extracted as { categories?: unknown }).categories
      : undefined;
  const categories = Array.isArray(categoriesRaw)
    ? categoriesRaw.filter(isThreatCategory)
    : undefined;

  const publishedAt = typeof hit['@timestamp'] === 'string' ? hit['@timestamp'] : undefined;

  return {
    report_id: String(hit.report_id ?? ''),
    title,
    source: {
      type: typeof source.type === 'string' ? source.type : 'unknown',
      name: typeof source.name === 'string' ? source.name : 'Unknown source',
      ...(typeof source.url === 'string' ? { url: source.url } : {}),
    },
    severity: isSeverityLevel(severityRaw) ? severityRaw : 'medium',
    ...(publishedAt ? { published_at: publishedAt } : {}),
    ...(categories && categories.length > 0 ? { categories } : {}),
    techniques,
    iocs: [],
  };
};

export const buildReportTablePayloadFromSearch = ({
  params,
  reports,
  attachmentLabel,
}: {
  params: {
    query: string;
    time_range?: { from: string; to: string };
    categories?: ThreatCategory[];
    regions?: ThreatRegion[];
    sort_by?: string;
  };
  reports: SearchReportHit[];
  attachmentLabel?: string;
}): ReportTablePayload => ({
  ...(attachmentLabel ? { attachmentLabel } : {}),
  time_range_label: formatTimeRangeLabel(params.time_range),
  scope: {
    query: params.query,
    ...(params.time_range ? { time_range: params.time_range } : {}),
    ...(params.categories?.length ? { categories: params.categories } : {}),
    ...(params.regions?.length ? { regions: params.regions } : {}),
  },
  reports: reports.map(mapSearchReportHitToTableRow),
});
