/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import {
  THREAT_INTEL_ADVISORIES_INDEX,
  type DashboardLatestAdvisory,
  type ThreatCategory,
  type ThreatRegion,
} from '../../../common/threat_intelligence/hub';
import { buildSpaceFilterTerms } from './space_filter';

interface AdvisorySource {
  '@timestamp'?: string;
  theme_id?: string;
  theme_title?: string;
  narrative_markdown?: string;
  recommended_actions?: string[];
  report_ids?: string[];
  time_range?: { from?: string; to?: string };
  filters?: {
    categories?: string[];
    regions?: string[];
  };
}

export interface FetchLatestAdvisoryParams {
  esClient: ElasticsearchClient;
  spaceId: string;
  from: string;
  to: string;
  regions: string[];
  categories: string[];
  reportIdsWithEnvHits: Set<string>;
  /** Report ids visible in the current overview scope (for staleness overlap). */
  scopedReportIds: string[];
}

const sortedStringArrayEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
};

const timeRangeOverlaps = (
  advisoryFrom: string | undefined,
  advisoryTo: string | undefined,
  from: string,
  to: string
): boolean => {
  if (!advisoryFrom || !advisoryTo) {
    return true;
  }
  const advFromMs = Date.parse(advisoryFrom);
  const advToMs = Date.parse(advisoryTo);
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if ([advFromMs, advToMs, fromMs, toMs].some((ms) => Number.isNaN(ms))) {
    return true;
  }
  return advFromMs <= toMs && advToMs >= fromMs;
};

export const isAdvisoryStaleForDashboard = ({
  advisoryCategories,
  advisoryRegions,
  advisoryTimeFrom,
  advisoryTimeTo,
  advisoryReportIds,
  dashboardCategories,
  dashboardRegions,
  dashboardFrom,
  dashboardTo,
  scopedReportIds,
}: {
  advisoryCategories: string[];
  advisoryRegions: string[];
  advisoryTimeFrom?: string;
  advisoryTimeTo?: string;
  advisoryReportIds: string[];
  dashboardCategories: string[];
  dashboardRegions: string[];
  dashboardFrom: string;
  dashboardTo: string;
  scopedReportIds: string[];
}): boolean => {
  if (!sortedStringArrayEqual(advisoryCategories, dashboardCategories)) {
    return true;
  }
  if (!sortedStringArrayEqual(advisoryRegions, dashboardRegions)) {
    return true;
  }
  if (!timeRangeOverlaps(advisoryTimeFrom, advisoryTimeTo, dashboardFrom, dashboardTo)) {
    return true;
  }
  if (advisoryReportIds.length === 0) {
    return false;
  }
  const scopedSet = new Set(scopedReportIds);
  const overlap = advisoryReportIds.filter((id) => scopedSet.has(id)).length;
  return overlap / advisoryReportIds.length < 0.25;
};

export const fetchLatestAdvisoryForDashboard = async ({
  esClient,
  spaceId,
  from,
  to,
  regions,
  categories,
  reportIdsWithEnvHits,
  scopedReportIds,
}: FetchLatestAdvisoryParams): Promise<DashboardLatestAdvisory | undefined> => {
  let response;
  try {
    response = await esClient.search({
      index: THREAT_INTEL_ADVISORIES_INDEX,
      size: 1,
      sort: [{ '@timestamp': { order: 'desc' } }],
      query: {
        bool: {
          filter: [buildSpaceFilterTerms(spaceId)],
        },
      },
      _source: [
        '@timestamp',
        'theme_id',
        'theme_title',
        'narrative_markdown',
        'recommended_actions',
        'report_ids',
        'time_range',
        'filters',
      ],
    });
  } catch {
    return undefined;
  }

  const hit = response.hits.hits[0];
  if (!hit?._id) {
    return undefined;
  }

  const source = (hit._source ?? {}) as AdvisorySource;
  const themeTitle = source.theme_title?.trim();
  const narrative = source.narrative_markdown?.trim();
  if (!themeTitle || !narrative) {
    return undefined;
  }

  const reportIds = source.report_ids ?? [];
  const advisoryCategories = (source.filters?.categories ?? []) as ThreatCategory[];
  const advisoryRegions = (source.filters?.regions ?? []) as ThreatRegion[];

  const sourceReportsWithEnvHits = reportIds.filter((id) => reportIdsWithEnvHits.has(id)).length;

  const stale = isAdvisoryStaleForDashboard({
    advisoryCategories,
    advisoryRegions,
    advisoryTimeFrom: source.time_range?.from,
    advisoryTimeTo: source.time_range?.to,
    advisoryReportIds: reportIds,
    dashboardCategories: categories,
    dashboardRegions: regions,
    dashboardFrom: from,
    dashboardTo: to,
    scopedReportIds,
  });

  return {
    advisory_id: hit._id,
    theme_id: source.theme_id ?? hit._id,
    theme_title: themeTitle,
    narrative_markdown: narrative,
    recommended_actions: source.recommended_actions ?? [],
    report_ids: reportIds,
    generated_at: source['@timestamp'] ?? new Date().toISOString(),
    source_reports_with_env_hits: sourceReportsWithEnvHits,
    stale,
  };
};
