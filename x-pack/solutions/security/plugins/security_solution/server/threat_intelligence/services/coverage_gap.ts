/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger, SavedObjectsClientContract } from '@kbn/core/server';
import { SECURITY_SOLUTION_RULE_TYPE_IDS } from '@kbn/securitysolution-rules';
import { subtechniqueById, techniqueById } from '@kbn/securitysolution-mitre-catalog';
import {
  SEVERITY_LEVELS,
  THREAT_REPORTS_INDEX_PATTERN,
  type SeverityLevel,
  type SourceType,
} from '../../../common/threat_intelligence/hub';
import { buildSpaceFilterTerms } from '../lib/space_filter';
import {
  buildTechniqueCountsFromBehaviorsWithSeverityAgg,
  buildTechniqueCountsFromTtpsWithSeverityAgg,
  mergeTechniqueReportCounts,
  parseTechniqueCountsFromBehaviors,
  parseTechniqueCountsFromTtps,
  type EsTechniqueBehaviorBucket,
  type EsTechniqueTtpBucket,
} from '../lib/technique_report_counts';

/**
 * Domain capability module for the `coverage_gap` action.
 *
 * Joins ATT&CK techniques observed in recent threat reports against the
 * customer's Detection Engine rules (enabled and disabled) and returns
 * covered / enable-existing / create-rule counts plus per-technique
 * heatmap rows. Same shape is used by the internal HTTP route and the
 * Agent Builder tool wrapper.
 */

export type CoverageRecommendation = 'covered' | 'enable_existing' | 'create_rule';

export interface CoverageGapParams {
  time_range: { from: string; to: string };
  tags?: string[];
  source_types?: SourceType[];
  min_severity?: SeverityLevel;
  max_techniques?: number;
}

export interface CoverageGapTechniqueRow {
  technique_id: string;
  name: string;
  tactic: string;
  article_count: number;
  severity_max: SeverityLevel;
  top_actors: string[];
  has_coverage: boolean;
  matching_rule_count: number;
  matching_disabled_rule_count: number;
  coverage_recommendation: CoverageRecommendation;
  matching_disabled_rule_ids?: string[];
}

export interface CoverageGapResult {
  status: 'coverage_gap_evaluated';
  time_range: { from: string; to: string };
  counts: {
    total_techniques: number;
    covered: number;
    enable_existing: number;
    uncovered: number;
    total_rules_inspected: number;
  };
  techniques: CoverageGapTechniqueRow[];
  uncovered_techniques: string[];
  techniques_to_enable: string[];
  attachment_hint: {
    type: 'threat-intel-mitre-heatmap';
    mode: 'coverage';
    payload: {
      time_range_label: string;
      mode: 'coverage';
      techniques: CoverageGapTechniqueRow[];
    };
  };
  next_step: string;
}

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const tacticIdsForTechnique = (techniqueId: string): string[] => {
  const technique = techniqueById.get(techniqueId);
  if (technique) return [technique.tactics[0] ?? '<unmapped>'];
  const sub = subtechniqueById.get(techniqueId);
  if (sub) return [sub.tactics[0] ?? '<unmapped>'];
  return ['<unmapped>'];
};

const techniqueDisplayName = (techniqueId: string): string => {
  const technique = techniqueById.get(techniqueId);
  if (technique) return technique.name;
  const sub = subtechniqueById.get(techniqueId);
  if (sub) return sub.name;
  return techniqueId;
};

interface RuleThreatTechnique {
  id: string;
  subtechnique?: Array<{ id: string }>;
}

interface RuleThreatBlock {
  framework?: string;
  technique?: RuleThreatTechnique[];
}

const MAX_DISABLED_RULE_IDS_PER_TECHNIQUE = 10;

export interface TechniqueRuleCoverage {
  enabledCount: number;
  disabledCount: number;
  disabledRuleIds: string[];
}

export interface TechniqueCoverageFields {
  has_coverage: boolean;
  matching_rule_count: number;
  matching_disabled_rule_count: number;
  coverage_recommendation: CoverageRecommendation;
  matching_disabled_rule_ids?: string[];
}

const emptyTechniqueCoverage = (): TechniqueRuleCoverage => ({
  enabledCount: 0,
  disabledCount: 0,
  disabledRuleIds: [],
});

const recordTechniqueOnRule = (
  coverageByTechnique: Map<string, TechniqueRuleCoverage>,
  techniqueId: string,
  ruleId: string,
  enabled: boolean
): void => {
  const entry = coverageByTechnique.get(techniqueId) ?? emptyTechniqueCoverage();
  if (enabled) {
    entry.enabledCount += 1;
  } else {
    entry.disabledCount += 1;
    if (entry.disabledRuleIds.length < MAX_DISABLED_RULE_IDS_PER_TECHNIQUE) {
      entry.disabledRuleIds.push(ruleId);
    }
  }
  coverageByTechnique.set(techniqueId, entry);
};

export const coverageRecommendationFor = (
  entry: TechniqueRuleCoverage | undefined
): CoverageRecommendation => {
  if (!entry || (entry.enabledCount === 0 && entry.disabledCount === 0)) {
    return 'create_rule';
  }
  if (entry.enabledCount > 0) {
    return 'covered';
  }
  return 'enable_existing';
};

export const techniqueCoverageFields = (
  techniqueId: string,
  coverageByTechnique: Map<string, TechniqueRuleCoverage>
): TechniqueCoverageFields => {
  const ruleCoverage = coverageByTechnique.get(techniqueId);
  const recommendation = coverageRecommendationFor(ruleCoverage);
  const disabledRuleIds = ruleCoverage?.disabledRuleIds;
  return {
    has_coverage: recommendation === 'covered',
    matching_rule_count: ruleCoverage?.enabledCount ?? 0,
    matching_disabled_rule_count: ruleCoverage?.disabledCount ?? 0,
    coverage_recommendation: recommendation,
    ...(recommendation === 'enable_existing' && disabledRuleIds?.length
      ? { matching_disabled_rule_ids: disabledRuleIds }
      : {}),
  };
};

export const enrichTechniquesWithRuleCoverage = (
  techniques: Array<{ technique_id: string; report_count: number }>,
  coverageByTechnique: Map<string, TechniqueRuleCoverage>
): Array<{ technique_id: string; report_count: number } & TechniqueCoverageFields> =>
  techniques.map(({ technique_id, report_count }) => ({
    technique_id,
    report_count,
    ...techniqueCoverageFields(technique_id, coverageByTechnique),
  }));

export const coverageSummaryForTechniques = (
  techniques: Array<{ coverage_recommendation: CoverageRecommendation }>
): { covered: number; enable_existing: number; uncovered: number } => ({
  covered: techniques.filter((t) => t.coverage_recommendation === 'covered').length,
  enable_existing: techniques.filter((t) => t.coverage_recommendation === 'enable_existing').length,
  uncovered: techniques.filter((t) => t.coverage_recommendation === 'create_rule').length,
});

/**
 * Walks `params.threat[].technique[]` (and `.subtechnique[]`) on every
 * SIEM rule (enabled and disabled) and returns per-technique counts so
 * callers can distinguish active coverage from dormant rules that only
 * need to be re-enabled. Sub-technique IDs are normalized so they can be
 * joined directly against the in-wild technique IDs from the threat-reports
 * data stream.
 */
export const collectRuleCoverageByTechnique = async (
  savedObjectsClient: SavedObjectsClientContract
): Promise<Map<string, TechniqueRuleCoverage>> => {
  const coverageByTechnique = new Map<string, TechniqueRuleCoverage>();
  const filter = SECURITY_SOLUTION_RULE_TYPE_IDS.map(
    (id) => `alert.attributes.alertTypeId:"${id}"`
  ).join(' OR ');

  let page = 1;
  const perPage = 200;
  // Saved-objects find caps at 10k results — 10 pages * 200/page = 2k rules
  // is well above realistic deployments and bounds tail latency.
  while (page <= 10) {
    const response = await savedObjectsClient.find<{
      enabled?: boolean;
      params?: { threat?: RuleThreatBlock[] };
    }>({
      type: 'alert',
      page,
      perPage,
      filter,
    });

    for (const rule of response.saved_objects) {
      const ruleEnabled = rule.attributes?.enabled === true;
      const threatBlocks = rule.attributes?.params?.threat ?? [];
      for (const block of threatBlocks) {
        for (const tech of block.technique ?? []) {
          if (tech.id) {
            recordTechniqueOnRule(coverageByTechnique, tech.id, rule.id, ruleEnabled);
          }
          for (const sub of tech.subtechnique ?? []) {
            if (sub.id) {
              recordTechniqueOnRule(coverageByTechnique, sub.id, rule.id, ruleEnabled);
            }
          }
        }
      }
    }

    if (response.saved_objects.length < perPage) break;
    page += 1;
  }

  return coverageByTechnique;
};

export const coverageGap = async (
  esClient: ElasticsearchClient,
  savedObjectsClient: SavedObjectsClientContract,
  logger: Logger,
  spaceId: string,
  params: CoverageGapParams
): Promise<CoverageGapResult> => {
  const {
    time_range: timeRange,
    tags,
    source_types: sourceTypes,
    min_severity: minSeverity,
    max_techniques: maxTechniques = 50,
  } = params;

  const filters: Array<Record<string, unknown>> = [
    buildSpaceFilterTerms(spaceId),
    { range: { '@timestamp': { gte: timeRange.from, lte: timeRange.to } } },
  ];
  if (tags?.length) filters.push({ terms: { tags } });
  if (sourceTypes?.length) filters.push({ terms: { 'source.type': sourceTypes } });
  if (minSeverity) {
    const allowed = SEVERITY_LEVELS.filter(
      (level) => SEVERITY_RANK[level] >= SEVERITY_RANK[minSeverity]
    );
    filters.push({ terms: { 'severity.level': allowed } });
  }

  interface AggregationResponse {
    aggregations?: {
      techniques_from_behaviors?: {
        techniques: {
          buckets: Array<
            EsTechniqueBehaviorBucket & {
              severity_on_reports?: {
                severity_max: { buckets: Array<{ key: string; doc_count: number }> };
              };
            }
          >;
        };
      };
      techniques_from_ttps?: {
        buckets: Array<
          EsTechniqueTtpBucket & {
            severity_max?: { buckets: Array<{ key: string; doc_count: number }> };
          }
        >;
      };
    };
  }

  const aggregation = (await esClient.search({
    index: THREAT_REPORTS_INDEX_PATTERN,
    size: 0,
    query: { bool: { filter: filters } },
    aggs: {
      techniques_from_behaviors: buildTechniqueCountsFromBehaviorsWithSeverityAgg(
        maxTechniques * 2,
        SEVERITY_LEVELS.length
      ),
      techniques_from_ttps: buildTechniqueCountsFromTtpsWithSeverityAgg(
        maxTechniques * 2,
        SEVERITY_LEVELS.length
      ),
    },
  })) as AggregationResponse;

  let coverageByTechnique: Map<string, TechniqueRuleCoverage>;
  try {
    coverageByTechnique = await collectRuleCoverageByTechnique(savedObjectsClient);
  } catch (err) {
    logger.warn(`coverage_gap rule walk failed: ${(err as Error).message}`);
    // Degrade gracefully — emit the in-wild techniques without coverage flags
    // so the agent can still narrate "here's what's hot in the window".
    coverageByTechnique = new Map();
  }

  const behaviorBuckets =
    aggregation.aggregations?.techniques_from_behaviors?.techniques?.buckets ?? [];
  const ttpBuckets = aggregation.aggregations?.techniques_from_ttps?.buckets ?? [];

  const reportCounts = mergeTechniqueReportCounts(
    parseTechniqueCountsFromBehaviors(behaviorBuckets),
    parseTechniqueCountsFromTtps(ttpBuckets)
  );

  const severityForTechnique = (techniqueId: string): SeverityLevel => {
    const severityFromBuckets = (
      sevBuckets: Array<{ key: string; doc_count: number }> | undefined
    ): SeverityLevel | undefined => {
      const found = (sevBuckets ?? [])
        .map((sb) => sb.key as SeverityLevel)
        .filter((s): s is SeverityLevel => (SEVERITY_LEVELS as readonly string[]).includes(s));
      if (found.length === 0) {
        return undefined;
      }
      return found.reduce((max, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[max] ? s : max), found[0]);
    };

    const behaviorBucket = behaviorBuckets.find((b) => b.key === techniqueId);
    const ttpBucket = ttpBuckets.find((b) => b.key === techniqueId);
    return (
      severityFromBuckets(behaviorBucket?.severity_on_reports?.severity_max?.buckets) ??
      severityFromBuckets(ttpBucket?.severity_max?.buckets) ??
      'medium'
    );
  };

  const techniqueRows: CoverageGapTechniqueRow[] = [...reportCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTechniques)
    .map(([techniqueId, articleCount]) => ({
      technique_id: techniqueId,
      name: techniqueDisplayName(techniqueId),
      tactic: tacticIdsForTechnique(techniqueId)[0] ?? '<unmapped>',
      article_count: articleCount,
      severity_max: severityForTechnique(techniqueId),
      top_actors: [],
      ...techniqueCoverageFields(techniqueId, coverageByTechnique),
    }));

  const coveredRows = techniqueRows.filter((row) => row.coverage_recommendation === 'covered');
  const enableExistingRows = techniqueRows.filter(
    (row) => row.coverage_recommendation === 'enable_existing'
  );
  const uncoveredRows = techniqueRows.filter(
    (row) => row.coverage_recommendation === 'create_rule'
  );

  const totalRulesInspected = [...coverageByTechnique.values()].reduce(
    (sum, entry) => sum + entry.enabledCount + entry.disabledCount,
    0
  );

  const nextStep = (() => {
    if (uncoveredRows.length === 0 && enableExistingRows.length === 0) {
      return (
        'Every technique observed in this window is already covered by an enabled ' +
        'SIEM rule. Render the heatmap with mode="coverage" so the user can confirm.'
      );
    }
    const parts: string[] = [];
    if (enableExistingRows.length > 0) {
      parts.push(
        'For techniques with `coverage_recommendation: "enable_existing"`, recommend ' +
          'enabling the existing disabled Detection Engine rule(s) listed in ' +
          '`matching_disabled_rule_ids` via the rules bulk-enable API — do NOT create ' +
          'a duplicate rule.'
      );
    }
    if (uncoveredRows.length > 0) {
      parts.push(
        'For techniques with `coverage_recommendation: "create_rule"`, call ' +
          '`threat_intel.hunt_behavior` on the underlying reports and propose a new ' +
          'Detection Engine rule via `security.create_detection_rule`.'
      );
    }
    parts.push('Render the heatmap with mode="coverage".');
    return parts.join(' ');
  })();

  return {
    status: 'coverage_gap_evaluated',
    time_range: timeRange,
    counts: {
      total_techniques: techniqueRows.length,
      covered: coveredRows.length,
      enable_existing: enableExistingRows.length,
      uncovered: uncoveredRows.length,
      total_rules_inspected: totalRulesInspected,
    },
    techniques: techniqueRows,
    uncovered_techniques: uncoveredRows.map((row) => row.technique_id),
    techniques_to_enable: enableExistingRows.map((row) => row.technique_id),
    attachment_hint: {
      type: 'threat-intel-mitre-heatmap',
      mode: 'coverage',
      payload: {
        time_range_label: `${timeRange.from} → ${timeRange.to}`,
        mode: 'coverage',
        techniques: techniqueRows,
      },
    },
    next_step: nextStep,
  };
};
