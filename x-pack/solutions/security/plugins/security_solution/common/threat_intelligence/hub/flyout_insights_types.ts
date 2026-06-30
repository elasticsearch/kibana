/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SeverityLevel } from './constants';

/**
 * Shared request/response shapes for the alert flyout insights endpoint
 * (`FLYOUT_INSIGHTS_API_PATH`). Defined in `common/` so the server route and
 * the public flyout hook share a single source of truth.
 */

export type RelatedReportJoinReason = 'ioc_reference' | 'technique_overlap';

export interface FlyoutInsightsRequest {
  /** Alert document `_id` — informational; not used for ES joins in P0 */
  alert_id: string;
  rule_type?: string;
  /**
   * Layer 1 join key (`kibana.alert.threat.indicator.reference`).
   * Expected form: `threat-report:<report_id>`.
   */
  indicator_reference?: string;
  /** Layer 2 join keys from rule MITRE technique fields (deduped). */
  technique_ids?: string[];
  /** Cap on technique-overlap reports. Default 10, max 25. */
  max_reports?: number;
  /** When true, only reports with `provenance.environment_hits_total > 0`. */
  require_environment_hits?: boolean;
}

export interface FlyoutInsightsRelatedReport {
  report_id: string;
  title: string;
  source: {
    type: string;
    name: string;
    url?: string;
  };
  severity: SeverityLevel;
  /** ISO-8601 — `provenance.extracted_at` or `@timestamp` fallback */
  extracted_at: string;
  techniques: string[];
  environment_hits_total: number;
  join_reason: RelatedReportJoinReason;
  matched_technique_ids?: string[];
}

export interface FlyoutInsightsResponse {
  status: 'ok';
  layer_1_report_id?: string;
  related_reports: FlyoutInsightsRelatedReport[];
  meta: {
    layer_1_resolved: boolean;
    technique_overlap_count: number;
    reports_returned: number;
  };
}
