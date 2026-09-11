/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { severitySchema } from './common_schemas';
import { significantEventStatusSchema } from './events';
import {
  MAX_ID_LENGTH,
  MAX_MEDIUM_STRING_LENGTH,
  MAX_SHORT_STRING_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_TIMESTAMP_LENGTH,
  MAX_TITLE_LENGTH,
} from './constants';

/**
 * Name of the `tool_ui` custom event emitted by the investigation agent's progress-report
 * tool. Consumers follow the agent execution's event stream and filter for this event to
 * receive live, schema-typed updates while the investigation is still running. Every emission
 * carries the FULL current investigation state (never a delta) — see
 * {@link investigationStateSchema}.
 */
export const INVESTIGATION_PROGRESS_UI_EVENT = 'investigation_progress' as const;

/**
 * Name of the step in `investigation_workflow.yaml` whose structured output holds the final
 * investigation state. Consumers reading the persisted result off a workflow execution look up
 * the step execution with this `stepId` — keep it in sync with the step name in the YAML.
 */
export const INVESTIGATE_STEP_ID = 'investigate' as const;

export type InvestigationRunStatus = 'pending' | 'complete' | 'failed' | 'unavailable';

/**
 * A source file the agent read, recorded as parts rather than a URL so that consumers — not the
 * model — decide what is safe to link.
 *
 * `source` records how the code was reached, for provenance; it deliberately does NOT decide
 * whether a link can be built.
 */
const investigationEvidenceCodeSchema = z.object({
  /**
   * How this reference was obtained: `github_connector` for a GitHub connector, `code_search` for
   * Semantic Code Search. Model-reported, so treat it as advisory — it selects which URL shape a
   * consumer may build, never as proof of where the code lives.
   */
  source: z.enum(['github_connector', 'code_search']),
  /** Repository in `owner/name` form, e.g. `elastic/kibana`. */
  repo: z.string().max(MAX_SHORT_STRING_LENGTH),
  /** Repository-relative file path, e.g. `src/recommendationservice/recommendation_server.py`. */
  path: z.string().max(MAX_MEDIUM_STRING_LENGTH),
  /**
   * Hostname the code can be browsed on, taken from the origin of the URL the tool itself
   * returned — never inferred from `repo`. Absent when the tool reported no browsable location,
   * as Semantic Code Search does: it records a bare `owner/repo` with no remote.
   */
  host: z.string().max(MAX_SHORT_STRING_LENGTH).optional(),
  /**
   * Commit SHA the file was read at. GitHub resolves a branch name to a SHA in the URLs it
   * returns, so this is normally available without asking the model to look it up. Absent when the
   * tool reported no revision — in which case no link is built, because a branch-pinned link
   * drifts away from the code the investigation actually saw.
   */
  ref: z.string().max(MAX_SHORT_STRING_LENGTH).optional(),
});
export type InvestigationEvidenceCode = z.infer<typeof investigationEvidenceCodeSchema>;

/**
 * One observation supporting a claim the investigation makes, together with pointers back to the
 * concrete artefacts it rests on, so a reader can verify it instead of trusting it.
 *
 */
const investigationEvidenceSchema = z.object({
  /** What was observed and why it bears on the claim. Doubles as the label for its link. */
  description: z.string().max(MAX_TEXT_LENGTH),
  /** The exact ES|QL query executed to gather this evidence, when one was run. */
  esql_query: z.string().max(MAX_TEXT_LENGTH).optional(),
  /**
   * Absolute time window `esql_query` was evaluated over, as ISO 8601 timestamps. Required for
   * the query to be openable: the agent's queries embed absolute bounds in their WHERE clauses,
   * so handing Discover the query without its window would apply Discover's own default range on
   * top and land the reader on zero rows. Without it, consumers show the query but do not link it.
   */
  time_range: z
    .object({
      from: z.string().max(MAX_TIMESTAMP_LENGTH),
      to: z.string().max(MAX_TIMESTAMP_LENGTH),
    })
    .optional(),
  /** The source file backing this evidence, when the agent read code. */
  code: investigationEvidenceCodeSchema.optional(),
});
export type InvestigationEvidence = z.infer<typeof investigationEvidenceSchema>;

/** Max entity entries in the impact block. Keep in sync with the YAML maxItems. */
export const MAX_IMPACT_ENTITIES = 10;

export const investigationImpactEntitySchema = z.object({
  /** Human-readable name — service name, host, or component. Prefer service names. */
  name: z.string().max(MAX_TITLE_LENGTH),
  /** Entity category. Prefer "service"; use "host", "database", etc. only when no service applies. */
  type: z.string().max(MAX_ID_LENGTH).optional(),
  /** KI feature_id when this entity is backed by a Knowledge Indicator. */
  feature_id: z.string().max(MAX_ID_LENGTH).optional(),
  stream_name: z.string().max(MAX_ID_LENGTH).optional(),
  /**
   * One evidence artifact linking this entity to the investigation — the query that shows
   * the failure signal. Same shape as hypothesis evidence; prefer esql_query + time_range
   * so the UI can render a chart.
   */
  evidence: investigationEvidenceSchema.optional(),
});
export type InvestigationImpactEntity = z.infer<typeof investigationImpactEntitySchema>;

export const investigationImpactSchema = z.object({
  entities: z.array(investigationImpactEntitySchema).max(MAX_IMPACT_ENTITIES),
});
export type InvestigationImpact = z.infer<typeof investigationImpactSchema>;

/** Max evidence entries per hypothesis. Keep in sync with the YAML maxItems. */
export const MAX_HYPOTHESIS_EVIDENCE = 3;

const investigationHypothesisStatusSchema = z.enum(['investigating', 'dismissed', 'confirmed']);

export const investigationHypothesisSchema = z.object({
  /** The candidate cause under consideration. */
  candidate: z.string().max(MAX_TEXT_LENGTH),
  /** Current confidence in this specific hypothesis. */
  confidence: z.number().min(0).max(1),
  status: investigationHypothesisStatusSchema,
  /** Why this hypothesis was dismissed/confirmed, or the current reasoning while investigating. */
  reason: z.string().max(MAX_TEXT_LENGTH).optional(),
  /**
   * What the verdict rests on.
   */
  evidence: z.array(investigationEvidenceSchema).max(MAX_HYPOTHESIS_EVIDENCE).optional(),
});
export type InvestigationHypothesis = z.infer<typeof investigationHypothesisSchema>;

/** Max recommendation entries a current investigation can emit. Keep in sync with YAML maxItems. */
export const MAX_RECOMMENDATIONS = 3;

const investigationItemConfidenceSchema = z.number().min(0).max(1);

const sortByConfidence = <T extends { confidence: number }>(items: T[]): T[] =>
  [...items].sort((first, second) => second.confidence - first.confidence);

/**
 * One concrete, actionable step to resolve or mitigate the issue — a command, config change, or
 * code fix, rather than general advice like "investigate further". Structured so consumers can
 * render a "Try next" list without parsing prose for headings and bullets.
 */
export const investigationRecommendationSchema = z.object({
  /** The action itself, stated concretely (e.g. "Revert the pool-size config change"). */
  title: z.string().max(MAX_MEDIUM_STRING_LENGTH),
  /** How strongly the findings support that this action will resolve or mitigate the confirmed problem. */
  confidence: investigationItemConfidenceSchema,
  /** Why this step helps, or detail needed to carry it out, when the title alone isn't enough. */
  description: z.string().max(MAX_TEXT_LENGTH).optional(),
  /** A command, config snippet, or code change backing this step, when one applies. Raw source,
   * not a fenced markdown block — consumers decide how to render it. */
  code: z.string().max(MAX_TEXT_LENGTH).optional(),
});
export type InvestigationRecommendation = z.infer<typeof investigationRecommendationSchema>;

/** Max blind spot entries a current investigation can emit. Keep in sync with YAML maxItems. */
export const MAX_BLIND_SPOTS = 3;

/**
 * A signal the agent wanted but could not access (e.g. missing instrumentation) — an actionable
 * knowledge gap, not an incident-specific fact. Structured so consumers don't have to split a
 * "title · description" sentence themselves.
 */
export const investigationBlindSpotSchema = z.object({
  /** The missing data source or access, named concisely (e.g. "No traces for the cart service"). */
  title: z.string().max(MAX_MEDIUM_STRING_LENGTH),
  /** How strongly the findings support that closing this gap would materially improve the investigation. */
  confidence: investigationItemConfidenceSchema,
  /** Why this gap mattered to the investigation. */
  description: z.string().max(MAX_TEXT_LENGTH),
});
export type InvestigationBlindSpot = z.infer<typeof investigationBlindSpotSchema>;

/** Max evidence entries per trigger-feedback proposal. Keep in sync with the YAML maxItems. */
export const MAX_TRIGGER_FEEDBACK_EVIDENCE = 10;

/** Max number of field-change proposals an investigation can emit as trigger feedback. */
export const MAX_TRIGGER_FEEDBACK = 3;

/**
 * Shared base fields for every event-update branch. Spread directly into each `z.object` call
 * (never `.extend` a shared base) so `z.toJSONSchema` emits standalone objects without `allOf`
 * wrapping — the workflow `JsonModelShapeSchema` does not allow `allOf`.
 */
const significantEventUpdateBase = {
  /** Why this field should change, referencing the confirmed findings (1–2 sentences). */
  reason: z.string().max(MAX_TEXT_LENGTH),
  evidence: z.array(investigationEvidenceSchema).min(1).max(MAX_TRIGGER_FEEDBACK_EVIDENCE),
};

/**
 * One proposed change to a trigger's field, produced by the investigation agent.
 * The `field` discriminator identifies which significant-event attribute is being proposed;
 * `from`/`to` are typed per field (enum for severity/status, free text for summary).
 *
 * Each entry is self-contained: `from` records what the value was before this investigation ran
 * (populated from `inputs.context`), so the UI never needs to thread prior state from elsewhere.
 *
 * Returned as feedback to the trigger owner. The investigation workflow records the completed
 * investigation but does not apply these proposals directly; `reason`/`evidence` persist only here
 * in the workflow execution's structured output.
 */
export const triggerFeedbackSchema = z.discriminatedUnion('field', [
  z.object({
    field: z.literal('severity'),
    from: severitySchema,
    to: severitySchema,
    ...significantEventUpdateBase,
  }),
  z.object({
    field: z.literal('summary'),
    from: z.string().max(MAX_TEXT_LENGTH),
    to: z.string().min(1).max(MAX_TEXT_LENGTH),
    ...significantEventUpdateBase,
  }),
  z.object({
    field: z.literal('status'),
    from: significantEventStatusSchema,
    to: significantEventStatusSchema,
    ...significantEventUpdateBase,
  }),
]);
export type TriggerFeedback = z.infer<typeof triggerFeedbackSchema>;

/** Max hypotheses an investigation can track. Keep in sync with the YAML maxItems. */
export const MAX_HYPOTHESES = 50;

/**
 * Full state of an investigation at a point in time. This is the ONE schema shared by:
 * - every `investigation_progress` `tool_ui` event emitted while the investigation runs (always
 *   the complete current state, never a delta — so the latest event alone is enough to render), and
 * - the `investigate` step's final structured output in `investigation_workflow.yaml` (kept in
 *   sync with this schema by hand — cross-reference the comment there).
 *
 * Because both paths share this shape, a consumer renders identically whether it's following the
 * live stream or reading the persisted final result.
 */
export const investigationStateSchema = z.object({
  /** Current ("what's happening now") or final narrative summary of the investigation. */
  summary: z.string().max(MAX_TEXT_LENGTH),
  hypotheses: z.array(investigationHypothesisSchema).max(MAX_HYPOTHESES),
  /**
   * The final answer — the mechanism/root-cause narrative, as plain prose (no markdown headings
   * or bullet lists). Populated once a hypothesis is `confirmed`; absent while still
   * investigating. Actionable steps belong in `recommendations`, not here.
   */
  conclusion: z.string().max(MAX_TEXT_LENGTH).optional(),
  /**
   * How severe the investigated situation turned out to be, on the shared severity tier scale
   * (see {@link severitySchema}). Set for every investigation whatever triggered it — an alert, a
   * significant event, or a free-form issue — and rated from what the run confirmed, never copied
   * from a severity the trigger already carried.
   *
   * Distinct from a `trigger_feedback` entry with `field: 'severity'`, which exists only
   * for significant-event runs and rates that one event rather than the whole situation.
   *
   * Optional for the same reason `conclusion` is: the agent settles it at the end, so live progress
   * reports carry it only once they reach that point, and investigations persisted before this
   * field existed still parse. The instructions require the final output to set it, so an absent
   * severity in a completed result means unrated, not low.
   */
  severity: severitySchema
    .describe(
      'How severe the investigated situation is, rated on the tier ladder in the investigator instructions from what the investigation confirmed.'
    )
    .optional(),
  /** Concrete, actionable steps to resolve or mitigate the issue. */
  recommendations: z
    .array(investigationRecommendationSchema)
    .max(MAX_RECOMMENDATIONS)
    .overwrite(sortByConfidence)
    .optional(),
  /**
   * Actionable knowledge gaps discovered during the investigation. Replaces the legacy free-text
   * `gaps_found` string array, which this schema ignores.
   */
  blind_spots: z
    .array(investigationBlindSpotSchema)
    .max(MAX_BLIND_SPOTS)
    .overwrite(sortByConfidence)
    .optional(),
  /**
   * Optional list of field-change proposals returned as feedback to the trigger. Each entry names
   * the significant-event field being proposed (`severity`, `summary`, or `status`) along with the
   * old and new values, a one-or-two-sentence reason tied to the confirmed findings, and the
   * evidence backing the proposal. Omit the array (or omit a field's entry) when no change is
   * warranted for that field. The workflow does not apply these proposals directly.
   */
  trigger_feedback: z.array(triggerFeedbackSchema).max(MAX_TRIGGER_FEEDBACK).optional(),
  /**
   * Structured account of which services or components were impacted. Optional so existing
   * persisted investigations remain valid. Seeded from alert grouping or sig event causal
   * features; finalized after hypotheses settle. At most 10 entries; service-level preferred.
   */
  impact: investigationImpactSchema.optional(),
  /** Optional static JSX string for visual rendering in the investigation canvas. */
  canvas: z.string().max(100_000).optional(),
});
export type InvestigationState = z.infer<typeof investigationStateSchema>;
