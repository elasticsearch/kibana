/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { THREAT_INTEL_ATTACHMENT_TYPES } from './attachment_type_ids';
import type { FindingCardPayload, MitreHeatmapPayload } from './attachment_payloads';
import type { ThreatCategory, ThreatRegion } from './constants';
import { buildReportTablePayloadFromSearch, type SearchReportHit } from './report_table_rows';
import type { ThreatIntelUiHint } from './ui_hints';

export const buildSearchReportsUiHints = ({
  params,
  reports,
  total,
}: {
  params: {
    query: string;
    time_range?: { from: string; to: string };
    categories?: ThreatCategory[];
    regions?: ThreatRegion[];
    sort_by?: string;
  };
  reports: SearchReportHit[];
  total: number;
}): ThreatIntelUiHint[] => {
  if (total === 0 || reports.length === 0) {
    return [];
  }
  return [
    {
      type: THREAT_INTEL_ATTACHMENT_TYPES.reportTable,
      payload: buildReportTablePayloadFromSearch({
        params,
        reports,
        attachmentLabel: `Threat intel: ${params.query}`,
      }),
    },
  ];
};

export const buildCoverageGapUiHints = (attachmentHint: {
  type: string;
  payload: MitreHeatmapPayload;
}): ThreatIntelUiHint[] => [
  {
    type: THREAT_INTEL_ATTACHMENT_TYPES.mitreHeatmap,
    payload: attachmentHint.payload,
  },
];

export const buildFindingCardUiHints = (
  hints: ReadonlyArray<{
    type: string;
    payload_partial: FindingCardPayload;
  }>
): ThreatIntelUiHint[] =>
  hints.map((hint) => ({
    type: THREAT_INTEL_ATTACHMENT_TYPES.findingCard,
    payload: hint.payload_partial,
  }));

export const withUiHints = <T extends object>({
  body,
  uiHints,
}: {
  body: T;
  uiHints: ThreatIntelUiHint[];
}): T & { ui_hints: ThreatIntelUiHint[] } => ({
  ...body,
  ui_hints: uiHints,
});
