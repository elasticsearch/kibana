/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  FindingCardPayload,
  MitreHeatmapPayload,
  ReportTablePayload,
} from './attachment_payloads';
import { THREAT_INTEL_ATTACHMENT_TYPES } from './attachment_type_ids';
import {
  buildCoverageGapUiHints,
  buildFindingCardUiHints,
  buildSearchReportsUiHints,
} from './ui_hints_builders';

describe('threat intelligence ui_hints builders', () => {
  it('buildSearchReportsUiHints returns empty when no hits', () => {
    expect(
      buildSearchReportsUiHints({
        params: { query: 'ransomware' },
        reports: [],
        total: 0,
      })
    ).toEqual([]);
  });

  it('buildSearchReportsUiHints returns report table payload', () => {
    const hints = buildSearchReportsUiHints({
      params: { query: 'ransomware', time_range: { from: 'now-7d', to: 'now' } },
      total: 1,
      reports: [
        {
          report_id: 'r1',
          content: { title: 'Test report' },
          source: { type: 'rss', name: 'Feed' },
          severity: { level: 'high' },
          extracted: { ttps: { techniques: ['T1059'] } },
          '@timestamp': '2026-01-01T00:00:00Z',
        },
      ],
    });
    expect(hints).toHaveLength(1);
    expect(hints[0].type).toBe(THREAT_INTEL_ATTACHMENT_TYPES.reportTable);
    expect((hints[0].payload as ReportTablePayload).reports[0].title).toBe('Test report');
  });

  it('buildCoverageGapUiHints maps heatmap attachment_hint', () => {
    const hints = buildCoverageGapUiHints({
      type: 'threat-intel-mitre-heatmap',
      payload: {
        time_range_label: 'Last 7 days',
        mode: 'coverage',
        techniques: [
          {
            technique_id: 'T1059',
            name: 'Command and Scripting Interpreter',
            tactic: 'execution',
            article_count: 3,
            severity_max: 'high',
            top_actors: [],
            coverage_recommendation: 'create_rule',
          },
        ],
      },
    });
    expect(hints[0].type).toBe(THREAT_INTEL_ATTACHMENT_TYPES.mitreHeatmap);
    expect((hints[0].payload as MitreHeatmapPayload).mode).toBe('coverage');
  });

  it('buildFindingCardUiHints maps attachment_hints', () => {
    const hints = buildFindingCardUiHints([
      {
        type: 'threat-intel-finding-card',
        payload_partial: {
          finding_id: 'f1',
          report_id: 'r1',
          report_title: 'Report',
          report_source_name: 'Vendor',
          technique_id: 'T1059',
          technique_name: 'Command and Scripting Interpreter',
          tactics: ['execution'],
          severity: 'high',
          confidence: 0.9,
          evidence_quote: 'Evidence',
          proposed_esql_rule: 'FROM logs',
          rule_name: 'Rule',
          risk_score: 70,
        },
      },
    ]);
    expect(hints[0].type).toBe(THREAT_INTEL_ATTACHMENT_TYPES.findingCard);
    expect((hints[0].payload as FindingCardPayload).technique_id).toBe('T1059');
  });
});
