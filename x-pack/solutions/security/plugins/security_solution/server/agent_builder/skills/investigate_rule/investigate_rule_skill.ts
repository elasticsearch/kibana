/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType } from '@kbn/agent-builder-common/tools';
import { ATTACHMENT_REF_ACTOR } from '@kbn/agent-builder-common/attachments';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { SkillDefinition } from '@kbn/agent-builder-server/skills';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { z } from '@kbn/zod/v4';
import { SECURITY_ALERTS_TOOL_ID } from '../../tools';
import { SecurityAgentBuilderAttachments } from '../../../../common/constants';

const SKILL_CONTENT = `# investigate-rule Skill

## When to Use This Skill

Use this skill when the user asks why a **specific** detection rule is generating
too many alerts, why alerts seem like false positives, or how to reduce noise
from that rule — whether or not a rule attachment is already present:

- "Why is this rule firing so much?"
- "Most of these alerts seem like false positives."
- "How do I reduce noise from this rule?"
- "This host keeps triggering the rule but it's expected behavior."

The rule must be identified by an existing rule attachment, an exact detection
\`rule_id\`, an exact rule name, or an explicit selection from prior \`find-security-rules\`
results (for example, "investigate the first one" or "look into <rule id>").

Do **not** use this skill for plural list/rank/count requests such as "give me
the noisy rules", "list the noisiest rules", or "which rules are generating the
most alerts". Those belong to \`find-security-rules\` until the user chooses one
specific rule to investigate.

Do **not** use this skill to create or edit the rule. Those intents belong to
the \`detection-rule-edit\` skill. This skill also does **not** adjudicate whether
an individual alert is a true or false positive — that is the \`alert-analysis\`
skill's job; load it when a per-alert verdict or enrichment is actually needed.

---

## Core Workflow

### Step 0: Ensure the Rule Attachment Exists

Before reading the attachment, check whether a \`security.rule\` attachment is
already present in the conversation.

- **Attachment present** (visible in the conversation sidebar, e.g. the user
  opened a rule from the Security UI or the \`detection-rule-edit\` skill created
  it): proceed to Step 1.
- **No attachment present** (the user referred to a detection \`rule_id\`, or selected
  one from a \`find-rules\` results table): call
  \`investigate-rule.resolve_rule_attachment\` with the \`rule_id\`. This creates
  a by-origin \`security.rule\` attachment keyed on \`rule-investigate-<rule_id>\`;
  the attachment type resolves the rule snapshot into attachment content. Then
  continue to Step 1. Do not render the attachment; it is used as context only
  (read it in Step 1).

### Step 1: Read the Rule Attachment

Always begin by calling \`attachment_read\` on the rule attachment. The attachment
contains the rule definition (query, index patterns, schedule, type, enabled
state, MITRE mappings). Never assume attachment contents; always read the latest
version.

Extract and retain: \`rule_id\`, \`id\`, \`name\`, \`type\`, \`language\`, \`query\`,
\`index\`, \`interval\`, \`from\`, \`enabled\`, and \`investigation_fields\` when present.

### Step 2: Fetch the Rule's Alerts (two focused queries)

Call the \`security.alerts\` tool **twice**, keeping the two concerns separate so the
result is unambiguous. Both queries filter to this rule only. Map each identifier to its
alert field — \`rule_id\` → \`kibana.alert.rule.rule_id\`, \`id\` → \`kibana.alert.rule.uuid\` —
and use \`rule_id\`: filter \`kibana.alert.rule.rule_id\` equals the rule's \`rule_id\` from the
attachment.

**Noise query — the noise picture (counts only).** Ask for:
- the total alert count,
- the **count of alerts grouped by \`host.name\`** (sorted by count descending, top 10),
  and **separately** the count grouped by \`user.name\`, and **separately** the count
  grouped by \`source.ip\`. Each value must come back **with its alert count** — phrase it
  as "number of alerts per host.name" so the query uses a grouped \`COUNT(*) BY\`, not a
  bare list of values. Do **not** cross-tab host×user: a single dominant entity split
  across hosts must stay visible as one total (e.g. \`svc-ci\` = 44, not four rows of ~11),
- a breakdown by \`kibana.alert.workflow_status\`.

This shows how loud the rule is and which single entity (host, user, or IP) concentrates
the volume. **Always present each dimension as a ranked list with the count next to each
value** (e.g. \`svc-ci\` (44), \`alice\` (6)) — counts are the whole point of this query; a
list of entity names without counts is not acceptable output.

**Confirmed dispositions query — the closed alerts.** Restrict to alerts
analysts have already closed (\`kibana.alert.workflow_status\` is \`closed\`) for this
rule (filter on \`kibana.alert.rule.rule_id\`). Name the fields to return explicitly —
these are the candidates for an exception condition (Step 4), so request exactly:
- \`kibana.alert.workflow_reason\` and \`kibana.alert.workflow_user\` (the verdict),
- entity fields: \`host.name\`, \`user.name\`, \`source.ip\`,
- \`event.category\` and \`event.action\`, plus the category-relevant fields:
  \`process.name\`, \`process.parent.name\`, \`file.name\`, \`file.hash.sha256\`,
  \`destination.address\`, \`destination.port\` (fields with no value return null — ignore them),
- every field listed in the rule's \`investigation_fields\` (from the attachment, Step 1) —
  these are the rule author's designated fields and the strongest exception candidates.

These are the only alerts you can speak about with certainty — they carry a human verdict.

**Time window (both queries):** set the \`time_window_hours\` parameter (NOT the query
text) — it defaults to 24. Use 72 or 168 when the user asks about a longer period, and
retry with a larger value if a query returns nothing (alerts older than the window are
not searched). Do not put a time range in the query text.

Read the results defensively: from the noise query take the total and the dominant
entities; from the confirmed dispositions query take which entities the closed
\`false_positive\`/\`benign_positive\` alerts actually sit on.

### Step 3: Analyse the Alert Pattern

The two queries differ in **certainty**, and the diagnosis must respect that:

- **Confirmed dispositions query (closed alerts)** is analyst-confirmed — state these
  as fact (e.g. "N alerts were closed as \`false_positive\`, all on host X").
- **Noise query (volume / concentration)** only shows the rule is *loud*. It is **not**
  proof that any specific still-open alert is a false positive — never present
  concentration as a verdict.

Use the two signals below in this order.

#### Signal A — analyst dispositions on closed alerts (high confidence)

Look at closed alerts (\`kibana.alert.workflow_status: closed\`) and their
\`kibana.alert.workflow_reason\`. Analysts have already adjudicated these, so **trust
the recorded reason** — do not re-decide whether those alerts are true/false
positives. Standard reasons are \`false_positive\`, \`benign_positive\`,
\`true_positive\`, \`duplicate\`, \`automated_closure\`, \`other\` (custom reasons are
possible too). The two noise reasons mean different things:

- **\`benign_positive\`** — the detection is *correct*, but the activity is
  expected/known-good (e.g. a CI/build host, admin tooling). The rule is working; the
  *source* is benign. **Primary remediation: add an exception** (or alert suppression)
  for the dominant entity — not a query change.
- **\`false_positive\`** — the detection is *wrong* (the rule over-matches). The FP is
  **confirmed — there is no uncertainty**. **Lead with an exception** for the confirmed
  entity — it is the immediate, always-safe fix. A query change may also be worth
  considering depending on the pattern, but do not push it as the primary action.

If a meaningful share of alerts carry \`benign_positive\`/\`false_positive\` closures,
that is direct, analyst-confirmed evidence of noise — proceed to a remediation
suggestion based on the entity concentration.

#### Signal B — open-alert volume and entity concentration (lower confidence)

For alerts that are still open / undispositioned, volume and concentration tell you the
rule is *loud*, but not on their own that it is *noise*.

**Always surface the entity breakdown first.** Present the top \`host.name\`, \`user.name\`,
and \`source.ip\` rankings with counts — this data belongs in the output regardless of
what you end up recommending. Show which entities dominate and what share of total
alerts they account for. Then assess which situation you are in:

- **The pattern suggests the rule is over-matching** (wrong detection for this entity —
  a suspected false positive) → recommend loading **alert-analysis** to get per-alert
  verdicts before any action. Do not recommend an exception without a confirmed
  disposition.
- **The pattern suggests expected/benign activity** (the detection is probably correct
  but the source is known-good — suspected noise) → recommend **alert suppression** on
  the concentrated entity field. This reduces noise while preserving detection coverage
  until the analyst confirms.

**Never recommend an exception for unconfirmed open alerts.** Exceptions require a
direct analyst disposition on that specific entity (Signal A). Noise is not a false
positive.

**Remediation by signal:**

| Observed | Read | Suggested user action (Detection Rules UI) |
|---|---|---|
| Closed \`benign_positive\` on an entity | Confirmed benign activity from a known source | Add an exception for that entity; alert suppression is also an option |
| Closed \`false_positive\` on an entity | Confirmed FP | Add an exception for that entity; a query change may also be worth considering depending on the pattern |
| One or two entities = most open alerts, no dispositions | Likely benign known source (unconfirmed) | Present options: suppression (reduces noise, preserves coverage), exception (only if analyst is already confident), or load \`alert-analysis\` for per-alert verdicts first |
| Open alerts spread across many entities, no dispositions | Inconclusive from volume alone | Offer to load \`alert-analysis\`; surface raw evidence for manual review if declined |

**Two cases:**

- **Confirmed disposition (closed alerts)** → the analyst has already decided; treat it as
  fact and recommend accordingly. An **exception** is the immediate, always-safe fix —
  lead with it. If an exception is not a good fit for the pattern, a **query change** may
  be more appropriate — use your judgment.
- **Unconfirmed (open alerts only)** → you do not have enough information to prescribe a
  single answer. Present the options (suppression, exception, alert-analysis) with their
  tradeoffs, give a lightweight recommendation based on the evidence you have, and leave
  the decision to the analyst. Do not assert that the open alerts are noise.

### Step 4: Produce Output

This skill is **read-only and diagnostic**. It explains the noise and suggests
remediations the user can perform in the Detection Rules UI. It never applies a change,
offers to apply one, or hands off to a rule-mutation skill. The exception proposal below
is **plain-text guidance the analyst types into the UI themselves** — describing it in a
structured way is expected; it is not an auto-applied or machine-actionable change.

The output must always contain these five sections, in order. Use a \`##\` header for each
section (e.g. \`## Alert Volume\`) — **do not use numbered list items for sections**; tables
placed inside a list item do not render in the Security UI.

### Alert volume and entity breakdown (always required — from the noise query)

Show the total alert count and status breakdown (open / closed). Then present the
top entity rankings: top \`host.name\`, top \`user.name\`, top \`source.ip\`. Use a
**bullet list** for each dimension (e.g. \`- svc-ci: 44 (76%)\`) — do not use a table
for entity rankings; two-column count lists render more reliably as bullets and are
easier to scan. Tables are reserved for the confirmed-dispositions section where
multiple columns justify them. This section is mandatory regardless of what Signal A
or Signal B finds — it is the raw evidence the analyst needs to see.

### Confirmed dispositions (from the confirmed dispositions query, if any closed alerts exist)

List each closed alert with its \`workflow_reason\`, \`workflow_user\`, and non-null field
values. These are the analyst-confirmed facts — state them plainly. The exception built
from these patterns is a remediation; put it in the remediation section, not here.

### Root cause

One clear classification: rule over-matching, benign known source, or inconclusive.

### Recommended remediation

Plain text, phrased as user actions in the Detection Rules UI. This is the single place
for what to do — keep confirmed recommendations (Signal A) separate from unconfirmed
options (Signal B).

*Confirmed dispositions (Signal A) → propose an exception per pattern:*
- **Cluster the closed alerts into patterns** by shared field values. Alerts sharing the
  same host/user/process/etc. are one pattern; alerts that differ are separate patterns
  (e.g. 6 FPs on \`host-6\`/\`bob\`/\`powershell.exe\` are one pattern; 4 on a different
  host/user are another).
- **One exception per pattern.** Take the fields whose value is **consistent across every
  alert in that pattern** and AND them together, prefilled with the values — this matches
  how the Detection Rules UI prefills an exception from an alert. Example: \`host.name IS
  host-6 AND user.name IS bob AND process.name IS powershell.exe AND message IS "manual run"\`.
- **Default to the tightest condition (all consistent fields AND'd).** It matches only the
  analyst-confirmed pattern, so it cannot over-suppress. Then state the broadening tradeoff:
  "To reduce more future noise, remove fields — e.g. drop \`message\` to catch all powershell
  from bob on host-6. Each field you remove widens what is suppressed."
- **Caveat — consistent does not mean safe to exclude.** A field can be consistent across
  the confirmed FPs and still appear in real threats (e.g. \`process.parent.name IS
  gitlab-runner\`). The analyst must confirm that excluding the chosen values will not hide
  genuine activity. Do not decide that for them.

*Unconfirmed concentration (Signal B) → present options, do not prescribe:* suppression on
the concentrated entity field (reduces noise, preserves coverage), an exception only if the
analyst is already confident the source is benign, or load \`alert-analysis\` for per-alert
verdicts first.

### Confidence boundary

State explicitly what is confirmed vs. not. Offer the alert-analysis handoff for
open alerts: "If you want a true/false-positive verdict on the open alerts, I can
load the alert-analysis skill."

---

## Remediation Guidance

This skill does not change rules and has no in-chat rule-mutation capability.
When you have identified a fix:

- Describe it in plain text and tell the user how to perform it themselves in the
  Detection Rules UI (e.g., add an exception, narrow the query, adjust the
  threshold, or configure alert suppression).
- Do **not** offer to make the change, claim you can change the rule, hand off to
  a mutation skill, or emit an auto-applied / machine-actionable change. (Describing a
  structured exception in plain text for the analyst to create themselves is fine — that
  is guidance, not a rule mutation.)

---

## Output

Use the five \`##\` sections from Step 4 (Alert volume, Confirmed dispositions, Root cause,
Recommended remediation, Confidence boundary). Within each section, **prose, bullets, or
tables are all fine** — use whatever reads best for the data. (Read-only: never apply or
offer to apply a change.)

---

## Fallback

If the alert data is insufficient for a confident diagnosis:
1. Surface raw evidence: alert count, top entities, rule query and index patterns (from the attachment).
2. Provide a manual investigation checklist appropriate to the observed symptoms.
3. Do not suggest a specific remediation. State clearly: "I wasn't able to
   determine the root cause from available data. Here is the evidence for manual review."
`;

export const createInvestigateRuleSkill = (): SkillDefinition<
  'investigate-rule',
  'skills/security/rules'
> =>
  defineSkillType({
    id: 'investigate-rule',
    name: 'investigate-rule',
    basePath: 'skills/security/rules',
    description:
      'Single-rule noise and false-positive analysis: identify why a specific detection rule is generating too many alerts, ' +
      'surface the top contributing entities, and classify whether the root cause is benign activity, an overly ' +
      'broad query, or a threshold misconfiguration. If no rule attachment is present yet (e.g. the user selected ' +
      'one rule from find-security-rules output), the skill resolves the rule by its rule_id (detection rule signature ID) ' +
      'and creates the attachment before proceeding. ' +
      'Do not use for plural list, rank, or count requests for noisy rules; use find-security-rules until a single rule is selected.',
    content: SKILL_CONTENT,
    getRegistryTools: () => [SECURITY_ALERTS_TOOL_ID],
    getInlineTools: () => [
      // ── resolve_rule_attachment ──────────────────────────────────────────────
      {
        id: 'investigate-rule.resolve_rule_attachment',
        type: ToolType.builtin,
        description:
          'Creates a by-origin security.rule attachment for a detection rule signature ID (rule_id); the attachment type resolves the rule content. ' +
          'Call when the user selects a rule to investigate but no security.rule attachment exists yet ' +
          '(e.g., the user picked a rule from find-security-rules output and said "investigate this one"). ' +
          'Returns the attachment ID and version; use it with attachment_read (do not render it). ' +
          'If an attachment for the same rule_id already exists, returns the existing ID without re-fetching.',
        schema: z.object({
          rule_id: z
            .string()
            .max(512)
            .describe('Detection rule signature ID (rule_id / kibana.alert.rule.rule_id)'),
        }),
        handler: async ({ rule_id: ruleId }, context) => {
          const attachmentId = `rule-investigate-${ruleId}`;

          const existing = context.attachments.get(attachmentId);
          if (existing) {
            return {
              results: [
                {
                  type: ToolResultType.other,
                  data: {
                    attachmentId,
                    version: existing.version,
                  },
                },
              ],
            };
          }

          try {
            const created = await context.attachments.add(
              {
                id: attachmentId,
                type: SecurityAgentBuilderAttachments.rule,
                origin: String(ruleId),
                description: `Rule: ${ruleId}`,
              },
              ATTACHMENT_REF_ACTOR.agent,
              {
                request: context.request,
                spaceId: context.spaceId,
                savedObjectsClient: context.savedObjectsClient,
              }
            );

            return {
              results: [
                {
                  type: ToolResultType.other,
                  data: {
                    attachmentId: created.id,
                    version: created.current_version,
                  },
                },
              ],
            };
          } catch (error) {
            return {
              results: [
                {
                  type: ToolResultType.error,
                  data: {
                    message: `Failed to resolve rule ${ruleId}: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
                  },
                },
              ],
            };
          }
        },
      },
    ],
  });
