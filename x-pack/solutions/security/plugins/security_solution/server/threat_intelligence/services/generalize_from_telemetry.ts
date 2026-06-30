/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';
import { z } from '@kbn/zod/v4';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { ScopedModel } from '@kbn/agent-builder-server';
import { subtechniqueById, tacticsToIds, techniqueById } from '@kbn/securitysolution-mitre-catalog';
import { buildReportContent } from '../adapters/text';
import {
  THREAT_REPORTS_DATA_STREAM,
  proposedEsqlRule,
  sanitizeRuleName,
  severityToRiskScore,
  severityFromConfidence,
  type SeverityLevel,
} from '../../../common/threat_intelligence/hub';

/**
 * Domain capability module for the `generalize_from_telemetry` action
 * (Phase C — closes the brittle-alert → durable-behavioral-rule loop).
 *
 * Walks an analyst-question + alert-sample bundle through the same ATT&CK
 * catalog validation as `hunt_behavior`, persists a synthetic
 * `source.type: 'telemetry'` report so downstream tooling (`coverage_gap`,
 * `search_reports`, dashboard) sees the finding, and returns the same
 * behaviors + attachment_hints shape for downstream rendering.
 */

export interface GeneralizeFromTelemetryAlertSample {
  alert_id: string;
  rule_name?: string;
  technique_ids?: string[];
  summary: string;
}

export interface GeneralizeFromTelemetryParams {
  question: string;
  alerts: GeneralizeFromTelemetryAlertSample[];
  llm_confidence_threshold?: number;
  persist_synthetic_report?: boolean;
}

export interface GeneralizeValidatedBehavior {
  technique_id: string;
  evidence_quote: string;
  llm_confidence: number;
  confidence: number;
  technique_name: string;
  reference: string;
  tactic_ids: string[];
  parent_technique_id?: string;
  proposed_esql_rule: string;
  rule_name: string;
  severity: SeverityLevel;
  risk_score: number;
  finding_id: string;
}

export interface GeneralizeFromTelemetryAttachmentHint {
  type: 'threat-intel-finding-card';
  payload_partial: {
    finding_id: string;
    report_id: string;
    report_title: string;
    report_source_name: string;
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
  };
}

export type GeneralizeFromTelemetryStatus =
  | 'no_behaviors_found'
  | 'no_behaviors_validated'
  | 'behaviors_proposed';

export interface GeneralizeFromTelemetryResult {
  status: GeneralizeFromTelemetryStatus;
  synthetic_report_id?: string;
  behaviors: GeneralizeValidatedBehavior[];
  attachment_hints: GeneralizeFromTelemetryAttachmentHint[];
  dropped_unknown_ids?: string[];
  message?: string;
  next_step: string;
}

const candidateBehaviorSchema = z.object({
  technique_id: z.string().describe('Canonical ATT&CK ID (e.g. "T1566.001", "T1059.003").'),
  evidence_quote: z
    .string()
    .describe('Verbatim quote from one of the alert summaries justifying the mapping.'),
  llm_confidence: z.number().min(0).max(1).describe('0.0-1.0 confidence in this mapping.'),
});

export const generalizeFromTelemetryLlmExtractionSchema = z.object({
  candidates: z.array(candidateBehaviorSchema).default([]),
});

type CandidateBehavior = z.infer<typeof candidateBehaviorSchema>;

const EXTRACTION_PROMPT = `You are a detection engineer. Given a set of recent alert samples
that share a common adversary tactic, identify the underlying MITRE ATT&CK *behavior* (not
just the static identifier the alerts matched on). The goal is to propose a behavioral
detection that would still fire if the adversary rotated hashes, domains, or IPs.

For each candidate technique, return:
- technique_id: the canonical ATT&CK ID
- evidence_quote: a verbatim 1-3 sentence quote from one of the alert summaries that
  justifies the mapping
- llm_confidence: 0.0-1.0 estimate of confidence`;

const summarizeAlerts = (alerts: GeneralizeFromTelemetryAlertSample[]): string =>
  alerts
    .map(
      (a, idx) =>
        `--- ALERT ${idx + 1} (id=${a.alert_id}${a.rule_name ? `, rule="${a.rule_name}"` : ''}${
          a.technique_ids?.length ? `, existing_technique_ids=[${a.technique_ids.join(',')}]` : ''
        }) ---\n${a.summary}`
    )
    .join('\n\n');

const buildFindingId = (techniqueId: string, sampleHash: string): string =>
  `telemetry:${sampleHash.slice(0, 12)}:${techniqueId}`;

export const generalizeFromTelemetry = async (
  esClient: ElasticsearchClient,
  model: ScopedModel,
  logger: Logger,
  spaceId: string,
  params: GeneralizeFromTelemetryParams
): Promise<GeneralizeFromTelemetryResult> => {
  const {
    question,
    alerts,
    llm_confidence_threshold: llmThreshold = 0.5,
    persist_synthetic_report: persistSynthetic = true,
  } = params;

  const alertSummary = summarizeAlerts(alerts);
  const sampleHash = createHash('sha256')
    .update(
      alerts
        .map((a) => a.alert_id)
        .sort()
        .join(',')
    )
    .digest('hex');

  const structured = model.chatModel.withStructuredOutput(
    generalizeFromTelemetryLlmExtractionSchema
  );
  const result = (await structured.invoke(
    `${EXTRACTION_PROMPT}\n\n--- ANALYST QUESTION ---\n${question}\n\n--- ALERT SAMPLES ---\n${alertSummary}`
  )) as z.infer<typeof generalizeFromTelemetryLlmExtractionSchema>;

  const candidates: CandidateBehavior[] = (result.candidates ?? [])
    .map((c) => ({
      technique_id: c.technique_id.toUpperCase().trim(),
      evidence_quote: c.evidence_quote.trim(),
      llm_confidence: Math.max(0, Math.min(1, c.llm_confidence)),
    }))
    .filter((c) => c.llm_confidence >= llmThreshold);

  if (candidates.length === 0) {
    return {
      status: 'no_behaviors_found',
      behaviors: [],
      attachment_hints: [],
      message:
        'No behavioral candidates passed the LLM-confidence threshold. The alert ' +
        'sample may be too small or describe an IOC-only signal. Try widening the ' +
        'search and including more alert samples.',
      next_step: 'Lower `llm_confidence_threshold` or include more alert samples.',
    };
  }

  const validated: GeneralizeValidatedBehavior[] = [];
  const droppedIds: string[] = [];

  for (const candidate of candidates) {
    const technique = techniqueById.get(candidate.technique_id);
    const subtechnique = technique ? undefined : subtechniqueById.get(candidate.technique_id);

    if (technique) {
      const tacticIds = tacticsToIds(technique.tactics);
      const severity = severityFromConfidence(candidate.llm_confidence);
      validated.push({
        ...candidate,
        confidence: candidate.llm_confidence,
        technique_name: technique.name,
        reference: technique.reference,
        tactic_ids: tacticIds,
        proposed_esql_rule: proposedEsqlRule({
          technique_id: candidate.technique_id,
          technique_name: technique.name,
          tactic_ids: tacticIds,
          evidence_quote: candidate.evidence_quote,
          confidence: candidate.llm_confidence,
          severity,
        }),
        rule_name: sanitizeRuleName(
          candidate.technique_id,
          technique.name,
          `telemetry:${sampleHash.slice(0, 8)}`
        ),
        severity,
        risk_score: severityToRiskScore(severity),
        finding_id: buildFindingId(candidate.technique_id, sampleHash),
      });
    } else if (subtechnique) {
      const tacticIds = tacticsToIds(subtechnique.tactics);
      const severity = severityFromConfidence(candidate.llm_confidence);
      validated.push({
        ...candidate,
        confidence: candidate.llm_confidence,
        technique_name: subtechnique.name,
        reference: subtechnique.reference,
        tactic_ids: tacticIds,
        parent_technique_id: subtechnique.techniqueId,
        proposed_esql_rule: proposedEsqlRule({
          technique_id: candidate.technique_id,
          technique_name: subtechnique.name,
          parent_technique_id: subtechnique.techniqueId,
          tactic_ids: tacticIds,
          evidence_quote: candidate.evidence_quote,
          confidence: candidate.llm_confidence,
          severity,
        }),
        rule_name: sanitizeRuleName(
          candidate.technique_id,
          subtechnique.name,
          `telemetry:${sampleHash.slice(0, 8)}`
        ),
        severity,
        risk_score: severityToRiskScore(severity),
        finding_id: buildFindingId(candidate.technique_id, sampleHash),
      });
    } else {
      droppedIds.push(candidate.technique_id);
    }
  }

  // Persist the synthetic `source.type: 'telemetry'` row so the finding
  // shows up in downstream tools. Best-effort: a failed write is logged
  // but the result still carries the behaviors so the analyst is unblocked.
  let syntheticReportId: string | undefined;
  if (persistSynthetic && validated.length > 0) {
    const now = new Date().toISOString();
    const title = `Generalized from ${alerts.length} alerts: ${validated[0].technique_name}`;
    const bodyText =
      `Analyst question: ${question}\n\n` +
      `Behavior(s) extracted: ${validated.map((b) => b.technique_id).join(', ')}\n\n` +
      `Source alert sample (${alerts.length}):\n${alertSummary}`;
    try {
      const indexResponse = await esClient.index({
        index: THREAT_REPORTS_DATA_STREAM,
        document: {
          '@timestamp': now,
          content_fingerprint: sampleHash,
          space_id: spaceId,
          source: {
            type: 'telemetry',
            name: 'Telemetry generalization',
            adapter_id: 'telemetry:generalize_from_telemetry',
          },
          content: buildReportContent({ title, bodyText, language: 'en' }),
          severity: {
            level: validated[0].severity,
            score: severityToRiskScore(validated[0].severity),
          },
          extracted: {
            behaviors: validated.map((b) => ({
              id: b.finding_id,
              technique_id: b.technique_id,
              description: b.evidence_quote,
              telemetry_targets: [],
              llm_confidence: b.confidence,
              confidence: b.confidence,
            })),
            ttps: {
              techniques: validated.map((b) => b.technique_id),
            },
          },
          provenance: {
            ingested_at: now,
            extracted_at: now,
            extraction_method: 'generalize_from_telemetry_v1',
            source_doc_ref: {
              index: '.alerts-security.alerts-*',
              id: alerts.map((a) => a.alert_id).join(','),
            },
          },
        },
      });
      syntheticReportId = indexResponse._id;
    } catch (err) {
      logger.warn(
        `generalize_from_telemetry: failed to persist synthetic report: ${(err as Error).message}`
      );
    }
  }

  const attachmentHints: GeneralizeFromTelemetryAttachmentHint[] = validated.map((b) => ({
    type: 'threat-intel-finding-card' as const,
    payload_partial: {
      finding_id: b.finding_id,
      report_id: syntheticReportId ?? '',
      report_title: `Telemetry generalization (${alerts.length} alerts)`,
      report_source_name: 'Telemetry generalization',
      technique_id: b.technique_id,
      technique_name: b.technique_name,
      ...(b.parent_technique_id && { parent_technique_id: b.parent_technique_id }),
      tactics: b.tactic_ids,
      severity: b.severity,
      confidence: b.confidence,
      evidence_quote: b.evidence_quote,
      proposed_esql_rule: b.proposed_esql_rule,
      rule_name: b.rule_name,
      risk_score: b.risk_score,
    },
  }));

  return {
    status: validated.length === 0 ? 'no_behaviors_validated' : 'behaviors_proposed',
    synthetic_report_id: syntheticReportId,
    behaviors: validated,
    attachment_hints: attachmentHints,
    ...(droppedIds.length > 0 && { dropped_unknown_ids: droppedIds }),
    next_step:
      validated.length === 0
        ? 'No candidates matched the canonical ATT&CK catalog. Provide more alert ' +
          'samples or lower the LLM-confidence threshold.'
        : 'For each behavior, emit a `threat-intel-finding-card` attachment built ' +
          'from the matching entry in `attachment_hints`. The card carries Deploy ' +
          '/ Dismiss / Investigate buttons. When `security.create_detection_rule` ' +
          'is available, also call it for the highest-confidence behavior with ' +
          'the same evidence quote and proposed_esql_rule body.',
  };
};
