/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TelemetryProbeTier, IocType, SeverityLevel } from './constants';

/**
 * Public type-only contract for the Streams-side telemetry-probe
 * registry — the cross-team shape Layer 3 of the three-layer detection
 * model (Layer 1 atomic IOC lookup, Layer 2 behavioral rule proposal,
 * Layer 3 Streams KIs) will implement.
 *
 * **Why this file exists**: today the threat-intel plugin owns its own
 * probe implementations (`huntForThreat` for Tier 1, `huntBehavior` for
 * Tier 2) and chains them inside `huntOrchestrated`. Streams' upcoming
 * KI probes will replace those in-tree implementations with a generic
 * registry that any Kibana plugin can register against. Publishing the
 * contract *before* the Streams-side build starts means:
 *
 *   1. Threat-intel can keep evolving its services confident that the
 *      shape it returns won't break when the Streams registry lands —
 *      the in-tree services are tested against this exact contract.
 *   2. The Streams team has a single source of truth for what a
 *      probe must accept and return, with TSDoc tying every field to a
 *      concrete in-tree behaviour they can match.
 *   3. Code review can flag drift between the in-tree services and the
 *      contract directly (e.g. if `huntForThreat` grows a new
 *      response field that isn't on `TelemetryProbeResult`).
 *
 * **Stability**: this module is type-only and intentionally has no
 * runtime exports. The full RFC describing the registration model and
 * the Layer-3 contract lives at
 * `docs/rfcs/0001_streams_layer3_grounded_hypothesis_flow.md`.
 *
 * **In-tree mappings** (see RFC §3):
 *
 *   | Layer / Tier | In-tree implementation     | Contract entry-point      |
 *   |--------------|----------------------------|---------------------------|
 *   | Tier 1       | `services/hunt_for_threat` | `TelemetryProbe.run({tier:1})` |
 *   | Tier 2       | `services/hunt_behavior`   | `TelemetryProbe.run({tier:2})` |
 *   | Layer 3 KI   | (Streams-side, planned)    | `TelemetryProbe.run({tier:1\|2})` |
 *
 * Each in-tree service has a TSDoc back-reference to this module so
 * type drift surfaces in code review.
 */

/**
 * Minimal runtime context every probe gets. The threat-intel
 * orchestrator already passes the equivalent shape to its services;
 * the Streams registry will materialise this from the request scope
 * and pass it through to each registered probe.
 *
 * Deliberately uses `unknown`-typed handles instead of concrete
 * `ElasticsearchClient` / `Logger` / `ScopedModel` types here:
 *
 *   - This file lives in `common/` (no server-side type deps).
 *   - The Streams team can pin to its own concrete types in the
 *     registry implementation while keeping this contract portable.
 *   - In-tree consumers cast the unknowns at the implementation
 *     boundary — see the matching adapter in each service file.
 */
export interface TelemetryProbeContext {
  /** `ElasticsearchClient` from `@kbn/core/server`. */
  esClient: unknown;
  /** `Logger` from `@kbn/core/server`. */
  logger: unknown;
  /** Active Kibana space id; `'*'` means "all spaces". */
  spaceId: string;
  /**
   * Scoped GenAI model handle. `undefined` when no default connector
   * is configured — Tier 2 probes MUST gracefully degrade in this case
   * (return `status: 'no_inference'`) rather than throwing.
   */
  model?: unknown;
}

/**
 * Input to a single probe invocation. Matches the union of inputs that
 * the existing `huntForThreat` and `huntBehavior` services already
 * accept, normalised so a registry caller can pass the same payload to
 * either probe without re-shaping.
 */
export interface TelemetryProbeInput {
  /**
   * Report id whose `extracted.iocs` / `extracted.ttps.techniques` /
   * `content.body_text` the probe can resolve from. Required for
   * any probe that needs report provenance.
   */
  report_id?: string;
  /**
   * Explicit IOC set. When provided, the probe MUST NOT re-fetch from
   * the report — this is the override path used by ad-hoc analyst
   * invocations and the `extract_iocs` upstream tool.
   */
  iocs?: ReadonlyArray<{ type: IocType; value: string }>;
  /** Explicit ATT&CK technique ids. Same override semantics as `iocs`. */
  techniques?: readonly string[];
  /**
   * Free-form report text — only consumed by Tier 2 probes. Tier 1
   * probes MUST ignore this field.
   */
  text?: string;
  /**
   * Inclusive time window. Probes that don't search time-series data
   * (the LLM proposal path) MUST ignore this field rather than error
   * — the orchestrator may pass it through unconditionally.
   */
  time_range?: { from: string; to: string };
}

/**
 * Discriminator for the probe's outcome. Closed enum on the wire — the
 * dashboard / agent narrative reads this directly so additions need a
 * matching UI update.
 *
 *   - `matched`               : probe found one or more environment
 *                               matches (Tier 1) or produced one or
 *                               more behavioral candidates (Tier 2).
 *   - `no_match`              : probe ran successfully but found
 *                               nothing — distinct from
 *                               `no_searchable_input`.
 *   - `no_searchable_input`   : probe couldn't run because the input
 *                               was insufficient (e.g. no IOCs after
 *                               resolution).
 *   - `no_inference`          : Tier 2 only — probe needs a GenAI
 *                               connector and none was configured.
 *   - `error`                 : probe encountered a non-recoverable
 *                               error. The orchestrator MUST treat
 *                               this as fail-soft for that probe and
 *                               continue with the remaining ones.
 */
export type TelemetryProbeStatus =
  | 'matched'
  | 'no_match'
  | 'no_searchable_input'
  | 'no_inference'
  | 'error';

/**
 * One concrete artifact the probe surfaced.
 *
 *   - Tier 1 / Layer 3 atomic probes: one match per matching event /
 *     alert document, with `ref.index` / `ref.id` pointing at the raw
 *     evidence.
 *   - Tier 2 / Layer 3 LLM probes: one match per proposed behavior /
 *     rule, with `ref` synthesised (`index: 'proposed'`, `id` =
 *     finding id).
 *
 * The bag of extra fields (the index signature) carries probe-specific
 * details — affected hosts, severity, evidence quote, etc. Consumers
 * MUST tolerate unknown fields.
 */
export interface TelemetryProbeMatch {
  ref: { index: string; id: string };
  [field: string]: unknown;
}

/**
 * Proposed durable detection rule emitted by a probe. Both Tier 1
 * (atomic IOC → ES|QL) and Tier 2 (behavioral → ES|QL) probes use the
 * same shape so the LLM has a uniform target schema when deciding
 * which rules to hand off to `security.create_detection_rule`.
 *
 * Matches the in-tree `AtomicEsqlProposal` and `BehaviorExport`
 * + `proposedEsqlRule` outputs.
 */
export interface TelemetryProbeProposedRule {
  /** Stable per-(report,probe) finding id. */
  finding_id: string;
  rule_name: string;
  esql: string;
  severity: SeverityLevel;
  risk_score: number;
  /**
   * Optional ATT&CK technique id this rule maps to. Required when the
   * rule was synthesised from a behavioral candidate (Tier 2 / Layer 3
   * LLM); optional when the rule is a pure atomic IOC match.
   */
  technique_id?: string;
}

/**
 * Aggregated probe output. Drop-in replacement for the existing
 * `HuntForThreatResult` / `HuntBehaviorResult` shapes (the in-tree
 * services satisfy this contract by construction — see the back-refs
 * in each service file).
 */
export interface TelemetryProbeResult {
  /** Unique probe identifier — matches `TelemetryProbe.id`. */
  probe_id: string;
  /** Tier discriminator (1 atomic / 2 corroboration). */
  tier: TelemetryProbeTier;
  status: TelemetryProbeStatus;
  /** One entry per surfaced match. Empty when `status !== 'matched'`. */
  matches: TelemetryProbeMatch[];
  /**
   * Free-form aggregations — `affected_hosts`, `affected_users`,
   * `per_index` etc. The orchestrator renders these for the analyst.
   * Probes MAY add fields; consumers MUST tolerate unknown ones.
   */
  aggregates?: Record<string, unknown>;
  /**
   * Proposed durable rules. Present when the probe is in the Tier 1
   * atomic-rule path (one rule per IOC) OR the Tier 2 behavioral path
   * (one rule per high-confidence behavior).
   */
  proposed_rules?: TelemetryProbeProposedRule[];
  /**
   * Operator-facing summary / "what to do next" hint, threaded into
   * the agent's narrative step.
   */
  message?: string;
  next_step?: string;
}

/**
 * The probe itself. Pure interface — every Kibana plugin that
 * registers against the Streams KI registry implements this and only
 * this.
 */
export interface TelemetryProbe {
  /**
   * Unique probe id. By convention `<plugin_namespace>.<probe>`, e.g.
   * `threat_intel.hunt_for_threat`. Re-using a published id is a hard
   * error — the registry MUST reject the second `register()` call.
   */
  id: string;
  /** Tier discriminator — see `TelemetryProbeTier` for semantics. */
  tier: TelemetryProbeTier;
  /**
   * One-line human-readable description, surfaced by the registry
   * `list()` API and by the agent narrative ("Telemetry probe
   * `<id>` matched: <message>").
   */
  description: string;
  /**
   * The probe's runtime entry point. MUST NOT throw on input-level
   * failures (no IOCs, no inference, etc.) — return a structured
   * status instead. The orchestrator distinguishes graceful no-input
   * paths from genuine errors when stitching multiple probes together.
   */
  run(context: TelemetryProbeContext, input: TelemetryProbeInput): Promise<TelemetryProbeResult>;
}

/**
 * Registry API the Streams team will publish from
 * `@kbn/streams-server` (working name). Plugins register probes during
 * their `setup` lifecycle; the orchestrator queries the registry at
 * call time.
 */
export interface TelemetryProbeRegistry {
  /** Throws on duplicate id. */
  register(probe: TelemetryProbe): void;
  /** Returns all registered probes, optionally filtered by tier. */
  list(filter?: { tier?: TelemetryProbeTier }): TelemetryProbe[];
  /** Returns `undefined` when the id is unknown. */
  get(id: string): TelemetryProbe | undefined;
}
