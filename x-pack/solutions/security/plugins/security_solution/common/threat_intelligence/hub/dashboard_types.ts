/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoverageRecommendation } from './attachment_payloads';
import type { SeverityLevel, ThreatCategory, ThreatRegion } from './constants';

/**
 * Latest cross-report advisory row from `.kibana-threat-intel-advisories`
 * for the Intelligence Hub executive summary panel.
 */
export interface DashboardLatestAdvisory {
  advisory_id: string;
  theme_id: string;
  theme_title: string;
  narrative_markdown: string;
  recommended_actions: string[];
  report_ids: string[];
  generated_at: string;
  /** Source reports in the advisory that have correlated env hits in the current overview scope. */
  source_reports_with_env_hits: number;
  /** True when Hub filters or time range no longer match how the advisory was produced. */
  stale: boolean;
}

/**
 * Shared response shape for the visual dashboard overview endpoint
 * (`DASHBOARD_OVERVIEW_API_PATH`). Defined in `common/` so the server route
 * and the public dashboard panels share a single source of truth.
 */
export interface DashboardOverviewResponse {
  time_range_label: string;
  stats_ribbon: {
    total_reports: number;
    critical_reports: number;
    high_reports: number;
    affects_you_total: number;
    /** Distinct `source.name` values in the overview query scope (time + filters). */
    distinct_source_count: number;
  };
  by_category: Array<{
    category: ThreatCategory | '<unknown>';
    report_count: number;
  }>;
  by_region: Array<{
    region: ThreatRegion | '<unknown>';
    report_count: number;
    affects_you: boolean;
  }>;
  severity_timeline: Array<{
    bucket: string;
    low: number;
    medium: number;
    high: number;
    critical: number;
  }>;
  top_techniques: Array<{
    technique_id: string;
    report_count: number;
    has_coverage: boolean;
    matching_rule_count: number;
    matching_disabled_rule_count: number;
    coverage_recommendation: CoverageRecommendation;
    matching_disabled_rule_ids?: string[];
  }>;
  coverage_summary: {
    covered: number;
    enable_existing: number;
    uncovered: number;
  };
  recent_articles: Array<{
    report_id: string;
    title: string;
    source_name: string;
    /** Per-report upstream URL (`source.url` on the indexed document). */
    source_url?: string;
    severity: SeverityLevel;
    '@timestamp': string;
    environment_hits_total: number;
    categories: ThreatCategory[];
    regions: ThreatRegion[];
  }>;
  environment_impact: {
    /** Sum of `provenance.environment_hits_total` across reports in scope. */
    total_hits: number;
    layer_1_hits: number;
    layer_2_hits: number;
    /** Reports with at least one correlated detection-engine alert. */
    reports_with_hits: number;
    top_reports: Array<{
      report_id: string;
      title: string;
      environment_hits_total: number;
      layer_1_hits: number;
      layer_2_hits: number;
    }>;
  };
  /** Most recent persisted advisory for the current space, if any. */
  latest_advisory?: DashboardLatestAdvisory;
}
