/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IocType, SeverityLevel, ThreatCategory, ThreatRegion } from './constants';

/**
 * Shared payload shapes for the four Phase A attachment types. Defined in
 * `common/` (no zod, no server-only imports) so the browser renderers can
 * reuse them without dragging server dependencies into the browser bundle.
 *
 * The server-side zod schemas live in
 * `server/agent_builder/attachments/types.ts` and are kept in sync with these
 * types — when editing one, edit the other.
 */

/**
 * `mode: 'reports'` is the legacy color-by-report-count heatmap.
 *
 * `mode: 'coverage'` re-uses the same renderer with a coverage-gap framing:
 * each technique row carries a `has_coverage` flag (derived by the
 * `threat_intel.coverage_gap` tool by joining extracted techniques against
 * SIEM rules) and the cell color shifts to red for uncovered techniques,
 * green for covered ones, and warning for techniques with only disabled
 * rules. Same data shape, different lens.
 */
export type CoverageRecommendation = 'covered' | 'enable_existing' | 'create_rule';

export interface MitreHeatmapTechniqueRow {
  technique_id: string;
  name: string;
  tactic: string;
  article_count: number;
  severity_max: SeverityLevel;
  top_actors: string[];
  has_coverage?: boolean;
  matching_rule_count?: number;
  matching_disabled_rule_count?: number;
  coverage_recommendation?: CoverageRecommendation;
  matching_disabled_rule_ids?: string[];
}

export interface MitreHeatmapPayload {
  attachmentLabel?: string;
  time_range_label: string;
  mode?: 'reports' | 'coverage';
  techniques: MitreHeatmapTechniqueRow[];
}

/** Mirrors the filters passed to `threat_intel.search_reports` for canvas hub fetch. */
export interface ReportTableScope {
  query: string;
  time_range?: { from: string; to: string };
  categories?: ThreatCategory[];
  regions?: ThreatRegion[];
}

export interface ReportTablePayload {
  attachmentLabel?: string;
  time_range_label: string;
  /** When set, the AB canvas loads the full Intelligence Hub for this scope. */
  scope?: ReportTableScope;
  reports: Array<{
    report_id: string;
    title: string;
    source: { type: string; name: string; url?: string };
    severity: SeverityLevel;
    /** ISO-8601 ingest/publish time for card timestamps. */
    published_at?: string;
    categories?: ThreatCategory[];
    techniques: string[];
    iocs: Array<{ type: IocType; value: string }>;
    environment_hits_total?: number;
    related_reports?: {
      count: number;
      top_ids: string[];
    };
  }>;
}

export interface SeverityTimelinePayload {
  attachmentLabel?: string;
  time_range_label: string;
  points: Array<{
    report_id: string;
    '@timestamp': string;
    severity: SeverityLevel;
    severity_score: number;
    title: string;
    source_name: string;
  }>;
}

/**
 * The subscription-confirmation card is now an editable form — the agent
 * proposes initial values and the user can tweak them in place before
 * submitting. Submission posts directly to
 * `SUBMIT_SUBSCRIPTION_API_PATH`, bypassing a second agent round-trip.
 *
 * `template_id` is optional and surfaces which template (if any) populated
 * the initial values so the renderer can show "based on Daily Threat
 * Debrief". The form remains editable regardless of template provenance.
 */
export interface SubscriptionConfirmationPayload {
  attachmentLabel?: string;
  tags: string[];
  severity_threshold: SeverityLevel;
  schedule_rrule: string;
  delivery: { type: 'email' | 'slack'; target: string; connector_id?: string };
  human_summary: string;
  template_id?: string;
}

/**
 * Single analyst-ready behavioral finding extracted by `hunt_behavior` and
 * rendered inline as a card with three action buttons (Deploy / Dismiss /
 * Investigate). The card carries everything the renderer needs to:
 *
 * - Show the finding in chat (technique, evidence quote, source report).
 * - Hand off the `proposed_esql_rule` body to the Detection Engine rule
 *   creation page so the analyst can deploy a durable rule.
 * - Open a pre-populated Case so the finding has a tracking artifact even
 *   if the analyst defers rule creation.
 *
 * `finding_id` MUST be stable across regenerations of the same
 * `(report_id, technique_id)` pair so the client-side dismiss state can
 * survive re-renders.
 */
export interface FindingCardPayload {
  attachmentLabel?: string;
  finding_id: string;
  report_id: string;
  report_title: string;
  report_source_name: string;
  report_source_url?: string;
  technique_id: string;
  technique_name: string;
  parent_technique_id?: string;
  tactics: string[];
  severity: SeverityLevel;
  confidence: number;
  evidence_quote: string;
  proposed_esql_rule: string;
  rule_name: string;
  risk_score: number;
}
