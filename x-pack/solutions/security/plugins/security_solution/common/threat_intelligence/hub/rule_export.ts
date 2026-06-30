/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IocType, SeverityLevel } from './constants';

/**
 * ES|QL rule export for behaviors extracted by `hunt_behavior`. The Elastic
 * Detection Engine handoff is the canonical durable output (Layer 2 in the
 * three-layer model); the generated query is a starting point that needs
 * human refinement against the customer's actual index pattern + ECS field
 * schema before enabling.
 *
 * This helper is pure and lives in `common/` so it can be unit-tested
 * without spinning up the agent runtime.
 */

export interface BehaviorExport {
  technique_id: string;
  technique_name: string;
  parent_technique_id?: string;
  tactic_ids: readonly string[];
  evidence_quote: string;
  confidence: number;
  severity?: SeverityLevel;
  report_id?: string;
}

/**
 * Detection-Engine risk score mapping used by both `proposedEsqlRule` (for
 * the in-file rule comment) and `hunt_behavior` (to enrich the per-behavior
 * `attachment_hint` so the renderer doesn't have to recompute it).
 */
export const severityToRiskScore = (severity: SeverityLevel | undefined): number => {
  switch (severity) {
    case 'critical':
      return 90;
    case 'high':
      return 73;
    case 'medium':
      return 47;
    case 'low':
    default:
      return 21;
  }
};

/**
 * Default severity inferred from LLM confidence. This is intentionally
 * coarse — the analyst can override on the finding card or on the rule
 * create page. The boundaries match the LLM-threshold gate
 * (`hunt_behavior` drops <0.5 candidates) so the lowest bucket is "low".
 */
export const severityFromConfidence = (confidence: number): SeverityLevel => {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.65) return 'medium';
  return 'low';
};

export const sanitizeRuleName = (
  techniqueId: string,
  techniqueName: string,
  reportId?: string
): string => {
  const base = `${techniqueId}: ${techniqueName}`;
  return reportId ? `${base} (${reportId.slice(0, 12)})` : base;
};

/**
 * Skeleton ES|QL detection. The actual query needs human refinement against
 * the customer's index pattern + field schema — we deliberately scope to the
 * common Elastic ECS event index pattern and emit a parameterized search so
 * the rule fires on raw evidence quotes from the report. Tunes follow.
 */
export const proposedEsqlRule = (b: BehaviorExport): string => {
  const ruleName = sanitizeRuleName(b.technique_id, b.technique_name, b.report_id);
  const severity = b.severity ?? 'medium';
  return [
    `// Generated from threat_intel.hunt_behavior — refine the FROM clause and the`,
    `// WHERE predicate against the customer's actual ECS field schema before enabling.`,
    `// rule_name: ${ruleName}`,
    `// severity: ${severity}  risk_score: ${severityToRiskScore(severity)}`,
    `// mitre_attack: ${b.technique_id}${
      b.parent_technique_id ? ` (parent ${b.parent_technique_id})` : ''
    }`,
    `// tactics: ${b.tactic_ids.join(', ') || '<unmapped>'}`,
    `FROM logs-*,traces-*`,
    `| WHERE event.action IS NOT NULL`,
    `| WHERE TO_LOWER(message) LIKE "*${b.technique_name.toLowerCase()}*"`,
    `| KEEP @timestamp, host.name, user.name, process.name, event.action, message`,
    `| LIMIT 100`,
  ].join('\n');
};

/**
 * Atomic IOC → ES|QL rule export. Tier 1 of the tradecraft model: when
 * an IOC actually matched in the environment, this helper proposes a
 * one-line durable rule that catches the exact ECS-field pattern that
 * produced the match. Distinct from `proposedEsqlRule` above (which is
 * the Tier 2 behavioral path).
 *
 * Pure and isomorphic — lives in `common/` so the UI can re-render the
 * proposed body in the analyst's review surface without re-fetching
 * from the server. The server's `services/hunt_orchestrator.ts`
 * attaches the result of {@link proposeAtomicEsqlFromIocs} as
 * `proposed_atomic_rules` on every Tier 1 hit, giving the LLM both
 * atomic and behavioral candidates to choose between when handing off
 * to `security.create_detection_rule`.
 */

export interface AtomicIocExport {
  ioc_type: IocType;
  ioc_value: string;
  report_id?: string;
}

export interface AtomicEsqlProposal {
  finding_id: string;
  rule_name: string;
  ioc_type: IocType;
  ioc_value: string;
  esql: string;
  severity: SeverityLevel;
  risk_score: number;
}

/**
 * Per-IOC-type ECS field set. Mirrors `buildIocShould` in
 * `services/hunt_for_threat.ts` so the proposed ES|QL `WHERE` clause
 * inspects exactly the fields the Tier 1 hunt searched on — meaning
 * the rule, once enabled, will catch the same documents Tier 1 just
 * matched (no recall drift between the hunt and the durable rule).
 */
const IOC_FIELD_MAP: Record<IocType, readonly string[]> = {
  ip: ['source.ip', 'destination.ip', 'host.ip', 'client.ip', 'server.ip'],
  domain: ['dns.question.name', 'destination.domain', 'url.domain'],
  url: ['url.full', 'url.original'],
  hash: ['file.hash.md5', 'file.hash.sha1', 'file.hash.sha256'],
  email: ['user.email', 'source.user.email'],
  cidr: ['source.ip', 'destination.ip'],
  wallet: [],
} as const;

/**
 * Sanitised one-line rule name. Truncates the IOC value at 16 chars so
 * a 64-char SHA-256 doesn't blow up the rule name when surfaced in
 * dashboards.
 */
const buildAtomicRuleName = (iocType: IocType, iocValue: string, reportId?: string): string => {
  const trimmed = iocValue.length > 16 ? `${iocValue.slice(0, 13)}…` : iocValue;
  const base = `Atomic IOC match — ${iocType}: ${trimmed}`;
  return reportId ? `${base} (${reportId.slice(0, 12)})` : base;
};

const buildAtomicFindingId = (iocType: IocType, iocValue: string, reportId?: string): string =>
  `${reportId ?? 'anon'}:atomic:${iocType}:${iocValue}`;

/**
 * Render the ES|QL body. Atomic IOC matches are high-confidence by
 * definition (the IOC came from a vetted source AND fired in the
 * environment), so we default to severity=high and risk_score=73; the
 * analyst can lower on the review surface. The KEEP list mirrors the
 * `_source` projection that `hunt_for_threat` uses on its search so the
 * rule's preview surface looks identical to what the analyst already
 * inspected.
 */
export const proposedAtomicEsqlRule = (ioc: AtomicIocExport): AtomicEsqlProposal => {
  const fields = IOC_FIELD_MAP[ioc.ioc_type];
  const ruleName = buildAtomicRuleName(ioc.ioc_type, ioc.ioc_value, ioc.report_id);
  const severity: SeverityLevel = 'high';
  // `==` per ES|QL syntax. String literals are double-quoted. The
  // generated body is meant to be a starting point; the analyst will
  // typically narrow the FROM clause to the integration the IOC came
  // from before enabling.
  const wherePredicate = fields.map((field) => `${field} == "${ioc.ioc_value}"`).join(' OR ');
  const esql = [
    `// Generated from threat_intel.hunt_orchestrated (Tier 1 atomic IOC match).`,
    `// Refine the FROM clause to the specific integration(s) producing the matches`,
    `// before enabling — the WHERE list mirrors hunt_for_threat's per-IOC ECS fields.`,
    `// rule_name: ${ruleName}`,
    `// severity: ${severity}  risk_score: ${severityToRiskScore(severity)}`,
    `// ioc_type: ${ioc.ioc_type}  ioc_value: ${ioc.ioc_value}`,
    `FROM logs-*,traces-*,.alerts-security.*`,
    `| WHERE ${wherePredicate}`,
    `| KEEP @timestamp, host.name, user.name, source.ip, destination.ip, url.full, ` +
      `file.hash.sha256, event.dataset`,
    `| LIMIT 100`,
  ].join('\n');
  return {
    finding_id: buildAtomicFindingId(ioc.ioc_type, ioc.ioc_value, ioc.report_id),
    rule_name: ruleName,
    ioc_type: ioc.ioc_type,
    ioc_value: ioc.ioc_value,
    esql,
    severity,
    risk_score: severityToRiskScore(severity),
  };
};

const ATOMIC_PROPOSAL_HARD_CAP = 20;

/**
 * Build atomic ES|QL proposals from a Tier 1 resolved IOC set.
 *
 * De-duplicates on `(ioc_type, ioc_value)` so the same IOC appearing
 * twice in a report (e.g. once as a raw value and once defanged) maps
 * to a single proposal. Capped at 20 proposals — the orchestrator's
 * caller usually only acts on the top few; more is noise in the LLM
 * context window.
 */
export const proposeAtomicEsqlFromIocs = (
  iocs: ReadonlyArray<{ type: IocType; value: string }>,
  reportId?: string
): AtomicEsqlProposal[] => {
  const seen = new Set<string>();
  const proposals: AtomicEsqlProposal[] = [];
  for (const ioc of iocs) {
    const hasValidValue = ioc && typeof ioc.value === 'string' && ioc.value.length > 0;
    const hasKnownType = hasValidValue && IOC_FIELD_MAP[ioc.type] !== undefined;
    if (hasKnownType) {
      const key = `${ioc.type}:${ioc.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        proposals.push(
          proposedAtomicEsqlRule({
            ioc_type: ioc.type,
            ioc_value: ioc.value,
            report_id: reportId,
          })
        );
        if (proposals.length >= ATOMIC_PROPOSAL_HARD_CAP) break;
      }
    }
  }
  return proposals;
};
