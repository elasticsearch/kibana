/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import {
  INDICATOR_REFERENCE_PREFIX,
  SEVERITY_LEVELS,
  THREAT_REPORTS_INDEX_PATTERN,
  type FlyoutInsightsRelatedReport,
  type FlyoutInsightsRequest,
  type FlyoutInsightsResponse,
  type RelatedReportJoinReason,
  type SeverityLevel,
} from '../../../common/threat_intelligence/hub';
import { buildSpaceFilterTerms } from '../lib/space_filter';

export type { FlyoutInsightsRequest, FlyoutInsightsResponse };

const DEFAULT_MAX_REPORTS = 10;
const MAX_REPORTS_CAP = 25;
const DISPLAY_TECHNIQUES_CAP = 8;

const isSeverityLevel = (value: unknown): value is SeverityLevel =>
  typeof value === 'string' && (SEVERITY_LEVELS as readonly string[]).includes(value);

export const parseReportIdFromIndicatorReference = (
  indicatorReference?: string
): string | undefined => {
  if (indicatorReference == null || indicatorReference.length === 0) {
    return undefined;
  }
  if (!indicatorReference.startsWith(INDICATOR_REFERENCE_PREFIX)) {
    return undefined;
  }
  const reportId = indicatorReference.slice(INDICATOR_REFERENCE_PREFIX.length);
  return reportId.length > 0 ? reportId : undefined;
};

interface ReportSource {
  '@timestamp'?: string;
  content?: { title?: string };
  source?: { type?: string; name?: string; url?: string };
  severity?: { level?: string };
  provenance?: {
    extracted_at?: string;
    environment_hits_total?: number;
  };
  extracted?: {
    ttps?: { techniques?: string[] };
    behaviors?: Array<{ technique_id?: string }>;
  };
}

interface ReportHit {
  _id: string;
  _source?: ReportSource;
}

const uniqueStrings = (values: readonly string[]): string[] => [...new Set(values)];

const behaviorTechniqueIds = (source?: ReportSource): string[] => {
  const fromBehaviors =
    source?.extracted?.behaviors
      ?.map((behavior) => behavior.technique_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0) ?? [];
  const fromTtps =
    source?.extracted?.ttps?.techniques?.filter(
      (id): id is string => typeof id === 'string' && id.length > 0
    ) ?? [];
  return uniqueStrings([...fromBehaviors, ...fromTtps]);
};

const mapReportHit = (
  hit: ReportHit,
  joinReason: RelatedReportJoinReason,
  matchedTechniqueIds?: string[]
): FlyoutInsightsRelatedReport => {
  const source = hit._source;
  const techniques = behaviorTechniqueIds(source).slice(0, DISPLAY_TECHNIQUES_CAP);
  const severityRaw = source?.severity?.level;
  const severity: SeverityLevel = isSeverityLevel(severityRaw) ? severityRaw : 'medium';

  return {
    report_id: hit._id,
    title: source?.content?.title?.trim() || hit._id,
    source: {
      type: source?.source?.type ?? 'unknown',
      name: source?.source?.name ?? 'unknown',
      ...(source?.source?.url ? { url: source.source.url } : {}),
    },
    severity,
    extracted_at: source?.provenance?.extracted_at ?? source?.['@timestamp'] ?? '',
    techniques,
    environment_hits_total: source?.provenance?.environment_hits_total ?? 0,
    join_reason: joinReason,
    ...(matchedTechniqueIds && matchedTechniqueIds.length > 0
      ? { matched_technique_ids: matchedTechniqueIds }
      : {}),
  };
};

const fetchReportById = async (
  esClient: ElasticsearchClient,
  spaceId: string,
  reportId: string
): Promise<FlyoutInsightsRelatedReport | undefined> => {
  try {
    const response = await esClient.search<ReportSource>({
      index: THREAT_REPORTS_INDEX_PATTERN,
      size: 1,
      ignore_unavailable: true,
      query: {
        bool: {
          filter: [buildSpaceFilterTerms(spaceId), { term: { _id: reportId } }],
        },
      },
    });

    const hit = response.hits.hits[0];
    if (!hit?._id) {
      return undefined;
    }

    return mapReportHit({ _id: hit._id, _source: hit._source }, 'ioc_reference');
  } catch {
    return undefined;
  }
};

const searchTechniqueOverlapReports = async (
  esClient: ElasticsearchClient,
  spaceId: string,
  techniqueIds: string[],
  excludeReportId: string | undefined,
  maxReports: number,
  requireEnvironmentHits: boolean
): Promise<FlyoutInsightsRelatedReport[]> => {
  const filter: Array<Record<string, unknown>> = [
    buildSpaceFilterTerms(spaceId),
    {
      nested: {
        path: 'extracted.behaviors',
        query: {
          terms: { 'extracted.behaviors.technique_id': techniqueIds },
        },
      },
    },
  ];

  if (requireEnvironmentHits) {
    filter.push({ range: { 'provenance.environment_hits_total': { gt: 0 } } });
  }

  const mustNot: Array<Record<string, unknown>> = [];
  if (excludeReportId) {
    mustNot.push({ term: { _id: excludeReportId } });
  }

  const response = await esClient.search<ReportSource>({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size: maxReports,
    ignore_unavailable: true,
    query: {
      bool: {
        filter,
        ...(mustNot.length > 0 ? { must_not: mustNot } : {}),
      },
    },
    _source: [
      'content.title',
      'source',
      'severity',
      'provenance',
      'extracted.behaviors',
      'extracted.ttps.techniques',
      '@timestamp',
    ],
    sort: [
      { 'provenance.environment_hits_total': { order: 'desc', missing: '_last' } },
      { 'severity.score': { order: 'desc', missing: '_last' } },
      { '@timestamp': { order: 'desc' } },
    ],
  });

  const hits = response.hits.hits as ReportHit[];

  return hits.map((hit) => {
    const matched = behaviorTechniqueIds(hit._source).filter((id) => techniqueIds.includes(id));
    return mapReportHit(hit, 'technique_overlap', uniqueStrings(matched));
  });
};

/**
 * Joins the current alert to threat reports using Layer 1 (indicator reference)
 * and Layer 2 (MITRE technique overlap on `extracted.behaviors`).
 */
export const flyoutInsights = async (
  esClient: ElasticsearchClient,
  spaceId: string,
  params: FlyoutInsightsRequest
): Promise<FlyoutInsightsResponse> => {
  const maxReports = Math.min(params.max_reports ?? DEFAULT_MAX_REPORTS, MAX_REPORTS_CAP);
  const techniqueIds = uniqueStrings(params.technique_ids ?? []);
  const requireEnvironmentHits = params.require_environment_hits === true;

  const layer1ReportId = parseReportIdFromIndicatorReference(params.indicator_reference);
  const relatedReports: FlyoutInsightsRelatedReport[] = [];
  let layer1Resolved = false;

  if (layer1ReportId) {
    const layer1Report = await fetchReportById(esClient, spaceId, layer1ReportId);
    if (layer1Report) {
      relatedReports.push(layer1Report);
      layer1Resolved = true;
    }
  }

  let techniqueOverlap: FlyoutInsightsRelatedReport[] = [];
  if (techniqueIds.length > 0) {
    techniqueOverlap = await searchTechniqueOverlapReports(
      esClient,
      spaceId,
      techniqueIds,
      layer1Resolved ? layer1ReportId : undefined,
      maxReports,
      requireEnvironmentHits
    );
    relatedReports.push(...techniqueOverlap);
  }

  return {
    status: 'ok',
    ...(layer1ReportId ? { layer_1_report_id: layer1ReportId } : {}),
    related_reports: relatedReports,
    meta: {
      layer_1_resolved: layer1Resolved,
      technique_overlap_count: techniqueOverlap.length,
      reports_returned: relatedReports.length,
    },
  };
};
