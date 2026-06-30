/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { THREAT_INTEL_ATTACHMENT_TYPES } from './attachment_type_ids';
import type {
  FindingCardPayload,
  MitreHeatmapPayload,
  ReportTablePayload,
  SeverityTimelinePayload,
  SubscriptionConfirmationPayload,
} from './attachment_payloads';

/**
 * Declarative UI hint returned alongside public threat-intelligence API
 * responses. Payload shapes mirror Agent Builder attachment types in
 * `attachment_payloads.ts` so external hosts can render rich UI without
 * conversation-scoped attachment storage.
 */
export type ThreatIntelUiHint =
  | {
      readonly type: typeof THREAT_INTEL_ATTACHMENT_TYPES.reportTable;
      readonly payload: ReportTablePayload;
    }
  | {
      readonly type: typeof THREAT_INTEL_ATTACHMENT_TYPES.mitreHeatmap;
      readonly payload: MitreHeatmapPayload;
    }
  | {
      readonly type: typeof THREAT_INTEL_ATTACHMENT_TYPES.severityTimeline;
      readonly payload: SeverityTimelinePayload;
    }
  | {
      readonly type: typeof THREAT_INTEL_ATTACHMENT_TYPES.subscriptionConfirmation;
      readonly payload: SubscriptionConfirmationPayload;
    }
  | {
      readonly type: typeof THREAT_INTEL_ATTACHMENT_TYPES.findingCard;
      readonly payload: FindingCardPayload;
    };

export interface ThreatIntelUiHintsEnvelope {
  readonly ui_hints: ThreatIntelUiHint[];
}
