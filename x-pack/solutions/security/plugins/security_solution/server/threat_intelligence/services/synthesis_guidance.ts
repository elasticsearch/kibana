/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Shared synthesis analytic discipline — single source of truth used by:
 *   1. The Opus synthesis prompt (synthesize_correlations.ts) — interpolated verbatim.
 *   2. Triage/knn tool results — appended as `synthesis_guidance` so a caller
 *      that synthesizes itself follows the same taxonomy, calibration, and rules.
 *
 * Sections included (verbatim from SYNTHESIS_SYSTEM_INSTRUCTIONS):
 *   RELATIONSHIP TAXONOMY, CONFIDENCE CALIBRATION, EVIDENCE WEIGHTS,
 *   JUDGE REASONING GUIDANCE, BEHAVIORAL RULES.
 *
 * Sections deliberately excluded (pipeline-internal, irrelevant to a self-synth caller):
 *   CANDIDATE ACCOUNTING, LABEL RULE, OUTPUT FORMAT.
 */
export const SYNTHESIS_GUIDANCE_TEXT = `\
RELATIONSHIP TAXONOMY

Assess each candidate at one of three levels:

same_campaign — The new case and the candidate describe the same operational activity. They may be observed by different vendors, at different times, or from different vantage points, but the underlying intrusion, tooling deployment, and operational intent are the same.

same_actor — The new case and the candidate are different campaigns operated by the same threat actor or group. The operational activity is distinct, but persistent behavioral patterns tie them to a common operator.

shared_tradecraft — The new case and the candidate share techniques, tooling, or infrastructure patterns, but the overlap may reflect shared toolkits, commodity malware ecosystems, or common operational playbooks rather than a single actor.

CONFIDENCE CALIBRATION

high — Multiple independent behavioral indicators corroborate across at least two Diamond Model vertices. The shared patterns are specific enough that coincidence is unlikely.

moderate — Meaningful overlap exists on at least one vertex with supporting indicators on a second. You must state what additional evidence would elevate this to high confidence.

low — Surface-level similarity exists but the behavioral specificity is insufficient to distinguish this from other actors operating in the same space. You must explain why the similarity is weak.

EVIDENCE WEIGHTS

Each evidence item in \`evidence[]\` receives exactly one weight:

smoking_gun — Decisive, highly discriminating; coincidence implausible. The item alone would materially determine the relationship.
supporting — Corroborating; materially supports but is not alone decisive. Combines with other items to build confidence.
non_discriminatory — Present in both the new case and the candidate but generic; does NOT narrow the candidate set (e.g. "both target Windows", commodity malware, broadly used techniques).
counter — Argues against the proposed relationship; introduces doubt. Requires POSITIVE contradictory evidence (e.g. the same infrastructure role attributed to a different, confirmed actor; conflicting malware families in the same functional role). The absence of overlap, a missing indicator, or "X was not found in the candidate" is a GAP — never a counter or decisive_counter.
decisive_counter — Decisively refutes or rules out the relationship. Same positive-evidence requirement as counter, at a higher threshold.

Each item also names the Diamond Model vertex it belongs to.

JUDGE REASONING GUIDANCE

Weight a coherent multi-vertex attack SHAPE over isolated atomic artifacts — the strongest correlation is usually the cross-vertex pattern, not any single item.

Weight an indicator by its EXCLUSIVITY in real-world malicious use, not merely "tool vs. technique." A generic, independently-reimplemented technique is weak (→ non_discriminatory or counter). A rare, gated, or boutique tool CONFIRMED in-case is strong. An atomic code artifact is a tool-mark: distinctive and corroborating, but narrower than a behavioral-shape match.

VALUE OF INFORMATION: where an UNCONFIRMED indicator would materially change the assessment if confirmed, say so in that lead's \`gaps\` AND add a HIGH-priority next step to verify it.

BEHAVIORAL RULES

1. Evidence-first reasoning. Lead with specific behavioral evidence before stating confidence.
2. Cross-vertex corroboration must be explicit. Populate vertex_signal for all four vertices; use "high" only when specific evidence applies, "partial" for weak or inferred signal, "none" when absent.
3. Articulate the gap. For moderate and low confidence leads, state what evidence is missing.
4. No hallucinated linkage. Work only with the provided source material and candidate reports.
5. Unidirectional output. Produce affirmative matches or no-match statements only.
6. Probability language, not certainty language.
7. Graceful degradation on thin evidence. Never stretch a weak match.
7a. Do not treat absent capabilities as divergent evidence. A capability not mentioned in the candidate does not contradict the new case.
7b. Describe what the case evidence shows, not what happened to it.
8. Distinguish what the new case shows from what candidate reports claim.
8a. Extract and weight author-assessed confidence from candidate reports before reasoning about the relationship.
9. Resolve vendor tracking labels before reasoning. Elastic REF#### = intrusion sets. Mandiant UNC#### = uncategorized clusters. Microsoft weather names = actor groups. CrowdStrike animals = actor designations.
10. Format technical indicators. Wrap IOCs, file paths, commands, domains, package versions, and hashes in backtick code spans in all text fields — including both the lead \`bluf\` and the case-level \`synthesis.bluf\`.
11. Evidence per rated vertex. Every vertex you rate \`partial\` or \`high\` in vertex_signal MUST have at least one evidence item whose \`vertex\` matches it. If you cannot cite evidence for a vertex, rate it \`none\`. (e.g. if you rate infrastructure: partial, there must be an evidence[] item with vertex: infrastructure.)`;

/**
 * Caller-facing synthesis guidance block. Append to triage/knn depth results
 * so a caller that synthesizes the correlation itself follows our analytic
 * discipline and produces output compatible with the CorrelationFindings schema.
 *
 * `instructions` is the raw analytic discipline text (taxonomy, calibration,
 * evidence weighting, reasoning rules).
 *
 * `recommended_output` describes the expected output shape. Field names and
 * types match CorrelationFindings; candidates are referenced by whatever
 * identifiers the caller received (candidate_id or report_id) — no pipeline
 * labels.
 */
export const SYNTHESIS_GUIDANCE = {
  instructions: SYNTHESIS_GUIDANCE_TEXT,
  recommended_output: {
    leads: [
      {
        candidate_ids: ['<candidate_id or report_id>'],
        title: '<report title or cluster label>',
        relationship: 'same_campaign | same_actor | shared_tradecraft',
        confidence: 'high | moderate | low',
        vertex_signal: {
          adversary: 'high | partial | none',
          capability: 'high | partial | none',
          infrastructure: 'high | partial | none',
          victim: 'high | partial | none',
        },
        bluf: '<evidence-first one-sentence narrative — name the specific behavioral evidence first, state relationship second>',
        evidence: [
          {
            vertex: 'capability | infrastructure | adversary | victim',
            weight: 'smoking_gun | supporting | non_discriminatory | counter | decisive_counter',
            text: '<discrete observation — one per entry>',
          },
        ],
        gaps: '<what evidence is missing — required for moderate and low confidence; "none found" valid for high>',
      },
    ],
    no_match: [
      {
        id: '<candidate_id or report_id>',
        title: '<report title>',
      },
    ],
    synthesis: {
      bluf: '<case-level one-liner stating the basis of correlation>',
      correlation_signal: 'high | moderate | low | none',
      reasoning:
        '<overall correlation picture — state signal, name matched vertices, assess indicator overlap>',
      gaps: '<what the primary source material did or did not claim about the relationship>',
      next_steps: [{ priority: 'high | moderate', text: '<actionable investigative step>' }],
    },
  },
} as const;
