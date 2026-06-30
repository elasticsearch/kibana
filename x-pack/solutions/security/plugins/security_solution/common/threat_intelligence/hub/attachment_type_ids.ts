/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Agent Builder attachment type ids for threat intelligence.
 *
 * Shared in `common/` so public API `ui_hints` and external clients (Cursor,
 * Claude) use the same identifiers as Kibana's `AttachmentTypeDefinition`
 * registrations without importing server code.
 */
export const THREAT_INTEL_ATTACHMENT_TYPES = {
  mitreHeatmap: 'threat-intel-mitre-heatmap',
  reportTable: 'threat-intel-report-table',
  severityTimeline: 'threat-intel-severity-timeline',
  subscriptionConfirmation: 'threat-intel-subscription-confirmation',
  findingCard: 'threat-intel-finding-card',
} as const;

export type ThreatIntelAttachmentType =
  (typeof THREAT_INTEL_ATTACHMENT_TYPES)[keyof typeof THREAT_INTEL_ATTACHMENT_TYPES];
