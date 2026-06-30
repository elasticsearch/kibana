/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import type { EntityAnalyticsRoutesDeps } from '../../../lib/entity_analytics/types';
import {
  getRiskScoreInlineTool,
  getRiskScoreEsqlTool,
  getAssetCriticalityEsqlTool,
  getAssetCriticalityInlineTool,
} from './inline_tools';
import { SECURITY_GET_ENTITY_TOOL_ID, SECURITY_SEARCH_ENTITIES_TOOL_ID } from '../../tools';

// Feature flag controlling whether our tools try to dynamically generate ESQL queries based on the question asked of
// if they use controlled queries that we author and maintain.
export const FF_DYNAMICALLY_GENERATE_ESQL = false;

const ENTITY_RISK_SCORE_SIGNIFICANT_CHANGE_THRESHOLD = 20; // Define a threshold for significant risk score change
export interface EntityAnalyticsSkillsContext {
  isEntityStoreV2Enabled: boolean;
  getStartServices: EntityAnalyticsRoutesDeps['getStartServices'];
  kibanaVersion: string;
  logger: Logger;
}

// The "Inline rendering" sections below follow a strict copy-verbatim
// contract: the entity tools (security.get_entity / security.search_entities)
// embed a pre-formatted `renderTag` string in their `ToolResultType.other`
// payload (see `buildRenderAttachmentTag` in
// server/agent_builder/tools/entity_analytics/entity_attachment_utils.ts)
// and the skill instructs the model to paste that exact string onto its own
// line. We do NOT ask the model to assemble a `<render_attachment>` tag from
// `attachmentId` / `version` any more — doing so has empirically produced
// hallucinated ids (e.g. `security.entity:single:<email>`) which contain
// `@` / `.` and shatter the upstream HTML tokenizer in
// remark-parse-no-trim (its openTag regex rejects underscores, and the
// autolink / email inline tokenizers run before the HTML tokenizer so any
// URL-shaped substring breaks the tag into multiple AST nodes). The skill
// also keeps the "blank line between <render_attachment> and prose" rule
// as a second line of defense; removing it depends on a platform-side
// fix to `createTagParser`
// (x-pack/platform/plugins/shared/agent_builder/public/application/components/
// conversations/conversation_rounds/round_response/markdown_plugins/utils.ts)
// that is out of scope for this plugin.
const entityStoreV2Content = `
This skill provides a guide to investigating specific security entities (hosts, users, services, generic) by entity ID (EUID)
or by surfacing risky entities based on their risk scores, asset criticality levels and other behavioral and lifecycle attributes.

## Rich attachments — overview

Two rich attachment types are available for entity analytics answers:

- \`security.entity\` — unified entity attachment emitted **automatically** as a side effect of \`security.get_entity\` (single-entity profile) and \`security.search_entities\` (multi-entity result). The renderer dynamically shows:
  - a **single-entity card** (flyout-shaped sections with summary, risk, resolution, insights) when the attachment represents **one** entity, or
  - an **entities table** (Canvas UI) when the attachment represents **two or more** entities.
  You never call \`attachments.add\` for this type — just render the tag returned by the tool result.
- \`security.entity_analytics_dashboard\` — an explicit **Entity Analytics home/overview** Canvas snapshot (risk level donut + highlights + entities together). You call \`attachments.add\` with this type **only** when the user explicitly asks to **show / open / view / display** the **Entity Analytics dashboard / home / overview / landing** product page.

**Never duplicate the attachment in prose.** Whichever rich attachment you render (the correct one depends on the user's ask — see the "Choosing the right rich attachment" table and the "Dashboard trigger" rule below), the Canvas you embedded IS the user-facing presentation. Your prose reply is for narrative and recommendations only — it must NOT restate what the attachment already shows.

For \`security.entity\` (single-entity card or multi-entity table):

- Do NOT emit an "Entity Overview" / "Entity Profile" / field-by-field markdown block after a single-entity card — the card already lists those fields.
- Do NOT emit a ranked markdown table (e.g. columns like \`| Entity | Type | Risk score | Risk level | Criticality |\`) after an entities table — the table Canvas is the ranking.
- Do NOT repeat the per-entity summary once per row in prose after the table — the rows in the attachment already cover that.
- DO write a short prose narrative alongside the attachment: 1–3 sentences for a single-entity card (why this entity is / is not risky, what drove the score, what to investigate next), or 2–4 bullets for a list (top-level takeaways, biggest outliers, recommended follow-ups).

For \`security.entity_analytics_dashboard\` (Entity Analytics home/overview snapshot):

- Do NOT restate the \`severity_count\` buckets (Critical / High / Moderate / Low / Unknown) as a markdown table — the donut and breakdown panel already show them.
- Do NOT re-list the \`anomaly_highlights\` titles/bodies as bullets — the highlights panel already shows them.
- Do NOT repeat the per-row entities list in markdown after the dashboard's entities table — the Canvas already shows it.
- DO write 2–4 sentences interpreting the snapshot: what the risk distribution looks like, biggest outliers worth flagging, and recommended follow-ups.

### Dashboard trigger — MUST use \`security.entity_analytics_dashboard\`

If the user's prompt contains any of these phrase families (case-insensitive substring match is enough):

- \`entity analytics dashboard\`, \`EA dashboard\`
- \`entity analytics home\`, \`entity analytics overview\`, \`entity analytics landing\`
- \`show\` / \`open\` / \`view\` / \`display\` / \`bring up\` **Entity Analytics** (the product page, not a generic Kibana dashboard)

…then you **MUST** call \`attachments.add\` with \`type: 'security.entity_analytics_dashboard'\` **in addition to** any \`security.search_entities\` / \`security.get_entity\` calls used to populate it. Emitting only the \`security.entity\` table or card is **incorrect** for these prompts — the user explicitly asked for the Entity Analytics product-page Canvas, which is a different rich view.

This rule takes **precedence** over the "do not use the dashboard for list / ranking / top-N questions" guidance elsewhere in this skill. If the literal dashboard / home / overview phrasing is present, emit the dashboard even when the same prompt also includes list / ranking / top-N framing.

## Mandatory — \`<render_attachment>\` (otherwise there is **no** Preview / Canvas)

Rich attachments do **not** show the interactive pill, **Preview**, or **Canvas** unless you **embed** them in your **assistant markdown** in the **same turn**.

\`security.get_entity\` and \`security.search_entities\` return an \`other\` result that contains a ready-made \`renderTag\` string, for example:

\`\`\`json
{ "attachmentId": "security.entity:user:<hex>", "version": 1, "renderTag": "<render_attachment id=\\"security.entity:user:<hex>\\" version=\\"1\\" />" }
\`\`\`

To render the attachment you **copy the value of \`renderTag\` EXACTLY** onto its own line in your reply — byte-for-byte, including the quoting. Do not rewrite it, do not reformat it, do not substitute the id with anything you inferred from the question (email, username, host name, prose description), do not wrap it in backticks/quotes/code fences.

For \`security.entity_analytics_dashboard\` the \`attachments.add\` tool returns \`{ id, current_version }\` on its result. No \`renderTag\` is provided for that path, so you assemble the tag by substituting those values verbatim into this exact template:

\`<render_attachment id="<id from attachments.add>" version="<current_version from attachments.add>" />\`

Rules:
- **Copy from the tool's own result.** If the tool's \`other\` result contains a \`renderTag\`, copy that string verbatim. If a dashboard \`attachments.add\` call succeeded, copy \`id\` and \`current_version\` verbatim into the template above. Never invent an id; never derive one from the user's prompt or any other field.
- **No \`renderTag\`, no tag.** If the tool result did not include a \`renderTag\` (e.g. \`security.get_entity\` resolved multiple candidates and fell back to an RLIKE match — no single-entity attachment was stored), do NOT emit a \`<render_attachment>\` tag. Write prose only.
- **One \`<render_attachment>\` per attachment.** If you emit an entity attachment AND add a dashboard attachment, output two tags (one per id/version pair).
- **Without** these tags, the UI only shows subdued italic text like **Attachment added: …** — the user **cannot** open the Canvas. **That is incorrect** for these attachment types.
- ALWAYS insert a BLANK LINE between the \`<render_attachment>\` tag and any following prose. Without this blank line, the prose will be dropped by the markdown parser.

## Choosing the right rich attachment

| What the user wants | Typical phrases | Attachment | Canvas / UI pattern |
| --- | --- | --- | --- |
| **Single entity** — details, profile, card, flyout for one identity | **this** host, named EUID, **details**, **profile**, **deep dive**, **entity card**, **card**, **flyout**, "tell me about **that** user", **the** riskiest **host** when they mean **one** winner | \`security.entity\` (emitted automatically by \`security.get_entity\`) | **Entity card** — flyout-shaped sections (summary, risk, resolution, insights). |
| **Multiple entities** — list, set, table, ranking, comparison | **list**, **table**, **which**/**who are** **hosts**/**users**/**entities** (plural entity nouns), **top** N, **rank**, **compare**, **enumerate**, "**entities** that…", "**hosts** sorted by risk", **compound asks** naming **two+ entity kinds** (**hosts and users**) | \`security.entity\` (emitted automatically by \`security.search_entities\` when 2+ entities are returned) | **Entities table** — Canvas shows the full multi-entity table. |
| **Entity Analytics product page** experience | **Entity Analytics dashboard / home / overview / landing page**, **show/open/view Entity Analytics**, **risk level breakdown donut with highlights**, **same layout as Entity Analytics** (product page) | \`security.entity_analytics_dashboard\` (explicit \`attachments.add\`) | **Dashboard snapshot** — two-column Canvas with donut, highlights panel, and entities table. |

**Key principle — do not manually add \`security.entity\`:** the tools emit this attachment as a side effect. Your job is to render the \`<render_attachment>\` tag returned in the tool's \`other\` result. The **single-vs-table** experience is selected automatically by the renderer based on how many entities the attachment contains.

**Precedence — Security Entity Analytics page vs Kibana "dashboard"**
- If they mean the **built-in Security → Entity Analytics** experience (same IA as the product **Entity Analytics** page): phrases like **show / open / view / display / bring up** the **Entity Analytics** **dashboard**, **home**, **overview**, or **landing** page → call \`attachments.add\` with \`security.entity_analytics_dashboard\`. This is a **snapshot of that product page** in chat Canvas — **not** composing a **new Kibana saved Dashboard** (Lens panels, \`dashboard-management\` skill). Do **not** wait for the user to say "create"; **show/open/view** that page is enough.
- **Does not** apply when the user only says **show**/**tell me**/**what are** together with **risky**/**riskiest**/**top** **hosts**, **users**, **entities** without naming the **Entity Analytics** product page — those are list/ranking asks satisfied by the \`security.entity\` attachment that \`security.search_entities\` emits automatically.
- Only use Kibana dashboard composition when they clearly want a **new or edited Kibana Dashboard** saved object (panels, Lens, \`manage_dashboard\`, etc.) — not merely the word "dashboard" next to "Entity Analytics".

## When to Use This Skill

Use this skill when:
- The user **explicitly** asks to **show**, **open**, **view**, or **walk through** the **Entity Analytics** **home**, **overview**, **landing**, or **built-in Entity Analytics dashboard** (the **product page** / same IA as Security → Entity Analytics navigation) → \`security.entity_analytics_dashboard\` after gathering entity data.
- They want **one entity's details / card / profile / flyout-style** view → \`security.get_entity\` (which emits the \`security.entity\` attachment as a single-entity card).
- They want a **list / table / ranking** of entities (plural or set framing) → \`security.search_entities\` (which emits the \`security.entity\` attachment as an entities table when 2+ rows are returned).
- One message names **several entity kinds** to compare or rank (e.g. **riskiest hosts and users**) → run \`security.search_entities\` per type (or with multiple \`entityTypes\`), and the tool will emit an aggregate \`security.entity\` attachment.
- Investigating the current behavior of a specific entity using its ID (EUID).
- Looking up the current profile for a specific entity using its ID (EUID), including risk score, asset criticality and watchlists.
- Analyzing the historical behavior of a specific entity using its ID (EUID).
- Analyzing changes in an entity's risk score or behavior over time.
- Discovering the riskiest entities in the environment based on risk scores and criticality levels.
- Surfacing entities that require further investigation based on their attributes and behaviors.

## Related Skills
When asked to investigate unusual or anomalous behavior by entities, use:
- '~/skills/security/ml/find-security-ml-jobs' to find the appropriate ML jobs that will answer the user's question.
  - This skill returns the EUIDs (entity IDs) of entities exhibiting anomalous behavior that matches the user's query.
    Use those EUIDs as input to the 'security.get_entity' tool to retrieve the profiles for those entities and include them in your analysis.

## Available Tools

### Get Entity Tool
- \`security.get_entity\` - Get the full profile for a security entity (host, user, service, generic) with a known entity ID (EUID).
    Also use this tool to get the profile for this entity over a time interval (e.g. last 90 days) or on a specific date (e.g. December 12, 2025).
    A full entity profile may include:
    - entity.id (EUID) - the unique identifier for this entity
    - entity.name - the name of this entity
    - entity.risk.calculated_score_norm (0-100) - the normalized risk score for this entity
    - entity.risk.calculated_level (critical, high, moderate, low, unknown)
    - asset.criticality (extreme_impact, high_impact, moderate_impact, low_impact, unknown)
    - entity.attributes.watchlists - watchlists that contain this entity
    - entity.attributes.managed - whether this entity is managed
    - entity.attributes.mfa_enabled - whether MFA is enabled for this entity
    - entity.attributes.asset - whether this entity is an asset
    - entity.behaviors.rule_names - detection rules associated with this entity
    - entity.behaviors.anomaly_job_ids - anomaly detection jobs that have detected this entity
    - entity.source - multi-value list of integration/data source keys that produced this entity. Values are heterogeneous and may be vendor keys (e.g. \`aws\`, \`okta\`, \`crowdstrike\`), dataset keys (e.g. \`aws.cloudtrail\`, \`aws.guardduty\`, \`okta.system\`), or integration keys (e.g. \`entityanalytics_okta\`, \`entityanalytics_entra_id\`, \`island_browser\`). Always stored lowercase.
    - entity.namespace - normalized **single-value** vendor namespace, user entities only. Collapses the heterogeneous \`entity.source\` values into canonical names: \`okta\`, \`entra_id\`, \`microsoft_365\`, \`active_directory\`, \`local\`, \`unknown\`, or pass-through of \`event.module\` (e.g. \`aws\`, \`gcp\`) when no dedicated mapping exists.
    - entity.lifecycle.first_seen - first time this entity has been seen in the entity store
    - entity.lifecycle.last_activity - last time this entity has been active in the entity store
    - risk_score_inputs - the alert inputs that contributed to the risk score calculation for this entity.
    - profile_history - historical snapshot profiles for this entity over a specified time interval
    - anomalies - unusual or anomalous behaviors detected for this entity, mapped to MITRE ATT&CK tactics and techniques.
    - vulnerabilities - known vulnerabilities associated with this entity, including CVE identifiers, severity levels, and descriptions.
    This tool may return multiple results if an exact match for the entity ID is not found.
    If multiple results are returned:
      - Provide a summary of the FIRST result.
      - You MUST mention the other results found and provide the COMPLETE entity ID for each

#### Inline rendering (REQUIRED when a single entity is resolved)
When \`security.get_entity\` resolves exactly one entity, its \`other\` result includes a \`renderTag\` field alongside \`attachmentId\` and \`version\`. Copy that \`renderTag\` string **verbatim** onto its own line, then a BLANK LINE, then your prose summary:

    <contents of the renderTag field from the tool's other result — copy byte-for-byte>

    <your prose summary here>

Rules:
- **Copy \`renderTag\` verbatim.** It already contains the correct attachment id and version — do not modify, reorder, or paraphrase any character. Do not build the tag yourself from \`attachmentId\` and \`version\`, do not replace the id with anything derived from the user's prompt (name, email, prose description).
- Emit the \`<render_attachment>\` tag BEFORE your prose summary so the user sees the rich entity card first.
- ALWAYS insert a BLANK LINE between the \`<render_attachment>\` tag and any following prose. Without this blank line, the prose will be dropped by the markdown parser.
- Render each \`security.entity\` attachment at most once per turn.
- When \`security.get_entity\` resolves multiple candidates (fallback RLIKE match), no attachment is stored and the \`other\` result contains no \`renderTag\`. In that case, **do not emit a \`<render_attachment>\` tag** — write prose only.

### Search Entities Tool
- \`security.search_entities\` - Search the entity store for security entities (host, user, service, generic) matching specific criteria.
    Use this tool to find entities based on:
    - normalized risk score range (0-100)
    - risk level (critical, high, moderate, low, unknown)
    - asset criticality level (extreme_impact, high_impact, moderate_impact, low_impact, unknown)
    - entity attributes (watchlists, managed status, MFA status, asset)
    - entity behaviors (behavior rule names, anomaly job IDs)
    - entity lifecycle timestamps (first seen, last activity)
    - data source (entity.source) - pass the raw lowercase integration key(s) via the \`sources\` parameter. Matching is **exact-or-prefix**: \`sources: ['aws']\` matches \`aws\`, \`aws.cloudtrail\`, \`aws.guardduty\`, \`aws.s3access\`, etc. (a single vendor key is usually enough — do not fan out into \`['aws', 'aws.cloudtrail']\`). Always use the stored key, not a pretty-printed label (pass \`island_browser\`, not \`Island Browser\`).
    - normalized user vendor (entity.namespace) - pass canonical values via the \`namespaces\` parameter; e.g. \`namespaces: ['okta']\`. Canonical values are \`okta\`, \`entra_id\`, \`microsoft_365\`, \`active_directory\`, \`local\`, \`unknown\`, or pass-through of \`event.module\` (e.g. \`aws\`, \`gcp\`). \`entity.namespace\` only exists on **user** entities — for host/service/generic entities use \`sources\` instead. When a canonical namespace exists for the vendor the user named, prefer \`namespaces\` over \`sources\` for user queries (it is single-valued and already normalized).
    Do NOT use this tool if the entity ID (EUID) is known; use the \`security.get_entity\` tool instead.
    ALWAYS use real entities from the entity store, do not invent entities.
    ALWAYS use the \`security.get_entity\` after using this tool to get the full profile for each entity found.

#### Inline rendering (REQUIRED when an aggregate attachment is emitted)
When \`security.search_entities\` stores an aggregate \`security.entity\` attachment, its \`other\` result includes a \`renderTag\` field alongside \`attachmentId\` and \`version\`. Copy that \`renderTag\` string **verbatim** onto its own line, then a BLANK LINE, then your prose summary:

    <contents of the renderTag field from the tool's other result — copy byte-for-byte>

    <your prose summary here>

Rules:
- **Copy \`renderTag\` verbatim.** It already contains the correct attachment id and version — do not modify it, do not build your own tag from \`attachmentId\` and \`version\`, do not derive the id from entity names, emails, vendor keys, or any other prose.
- Emit the \`<render_attachment>\` tag BEFORE your prose summary so the user sees the table first.
- ALWAYS insert a BLANK LINE between the \`<render_attachment>\` tag and any following prose. Without this blank line, the prose will be dropped by the markdown parser.
- Render each \`security.entity\` attachment at most once per turn.
- The rendered table REPLACES the prose markdown table for the list — do not also print the
  markdown columns described in Step 3 when the inline table is shown. A short narrative
  (top-level takeaways, outliers worth flagging) still belongs in the prose.
- If the \`other\` result contains no \`renderTag\`, **do not emit a \`<render_attachment>\` tag**. Write prose only.
- When exactly one entity is returned and you are about to follow up with \`security.get_entity\`, prefer rendering the tag from the \`get_entity\` result instead (richer card payload) — skip the \`search_entities\` render tag to avoid duplicate pills in that turn.

### Vendor source cheat sheet

When the user names a vendor or platform (AWS, Okta, Azure, Microsoft 365, Active Directory, endpoint/local, CrowdStrike, Google Workspace, Jamf, ...), use these mappings to fill \`namespaces\` and/or \`sources\`. Values are the raw lowercase keys stored in the entity store — never pretty-printed labels.

- **AWS** → \`namespaces: ['aws']\` (pass-through) + \`sources: ['aws']\` (prefix covers \`aws.cloudtrail\`, \`aws.guardduty\`, \`aws.s3access\`, etc.).
- **Okta** → \`namespaces: ['okta']\` + \`sources: ['okta', 'entityanalytics_okta']\` (prefix also covers \`okta.system\`).
- **Azure AD / Entra ID** → \`namespaces: ['entra_id']\` + \`sources: ['azure', 'entityanalytics_entra_id']\`.
- **Microsoft 365** → \`namespaces: ['microsoft_365']\` + \`sources: ['o365', 'o365_metrics']\`.
- **Active Directory** → \`namespaces: ['active_directory']\` + \`sources: ['entityanalytics_ad']\`.
- **Endpoint / local accounts** → \`namespaces: ['local']\` + \`sources: ['endpoint', 'system']\`.
- **CrowdStrike** → \`sources: ['crowdstrike']\` (no canonical namespace; also applies to host entities).
- **Google Workspace** → \`sources: ['google_workspace']\` (no canonical namespace).
- **Jamf** → \`sources: ['jamf', 'jamf_protect']\` (no canonical namespace).

For vendors not listed here, try \`namespaces: ['<event.module>']\` on user entities (pass-through) or \`sources: ['<lowercase vendor key>']\` — a single prefix key is enough thanks to exact-or-prefix matching.

## Entity Analysis Investigation Steps

### 1. Find entities to investigate
- If entity ID (EUID) is known, continue directly to the next step
- If not, use \`security.search_entities\` to find entities. Always use real entities from the entity store, do not invent entities.
- ONLY pass \`riskScoreMin\` when the user explicitly specified a numeric floor (e.g. "users with score above 70", "hosts over 85"). Omit it otherwise — by default the tool sorts by \`entity.risk.calculated_score_norm DESC\`, so the riskiest rows come first. Note: the default \`riskScore\` sort only ranks entities that have a computed risk score (rows with \`calculated_score_norm IS NULL\` are excluded because ranking is not meaningful for unscored entities). When the user wants unscored entities to appear alongside scored ones, pass \`sortBy: 'criticality'\` — that path keeps unscored entities at the bottom via \`criticality_rank = 0\`.
- Criticality intent splits into **filter** vs **sort**, and you must pick the right parameter:
  - Pass \`criticalityLevels\` to **filter** results down to one or more specific levels — e.g. "show high-impact users", "only extreme_impact hosts", "critical or high assets". Use this when the user restricts which levels are in scope.
  - Pass \`sortBy: 'criticality'\` to **order / rank / list top-N** entities **by criticality** (extreme_impact > high_impact > medium_impact > low_impact, with risk score as the tiebreaker; entities with no asset criticality land last). Use this when the user says "by criticality", "sorted by criticality", "rank by criticality", "top N by criticality", etc.
  - Do **NOT** stuff all four values into \`criticalityLevels\` (\`['extreme_impact','high_impact','medium_impact','low_impact']\`) to simulate a sort — that is a no-op filter and the tool will still sort by risk score. Use \`sortBy: 'criticality'\` instead.
  - The two parameters compose: \`criticalityLevels: ['high_impact','extreme_impact']\` + \`sortBy: 'criticality'\` restricts to those tiers AND orders them (extreme above high, risk score as tiebreaker).
- ONLY call \`security.search_entities\` with a 'riskScoreChangeInterval' parameter if the user is asking about changes or jumps in risk score.

#### Source-scoped search strategy

When the user names a vendor / platform (AWS, Okta, Azure, Microsoft 365, CrowdStrike, Google Workspace, Jamf, ...), pick the right filter using the "Vendor source cheat sheet" above:

1. **User entities + vendor has a canonical namespace** (Okta, Entra ID, Microsoft 365, Active Directory, local/endpoint, or a pass-through vendor like AWS/GCP) — **try \`namespaces\` first**. It is single-valued and already normalized, so it is the most reliable filter.
2. **If the namespace search returns zero rows**, retry with \`sources\` using the prefix key(s) from the cheat sheet. Because matching is exact-or-prefix, \`sources: ['aws']\` is enough — do **not** expand into \`['aws', 'aws.cloudtrail', 'aws.guardduty']\`.
3. **User entities + vendor has no canonical namespace** (CrowdStrike, Google Workspace, Jamf, ...) — skip \`namespaces\` and go straight to \`sources\` with the prefix key.
4. **Host / service / generic entities** — those types do not have \`entity.namespace\`. Skip \`namespaces\` entirely and use \`sources\` directly (e.g. \`sources: ['crowdstrike']\` for CrowdStrike hosts).
5. **If both attempts still return zero entities**, follow the current fallback: report "no matching entities" and do NOT invent entities. You may mention which sources/namespaces the user does have, but only when a prior tool call already surfaced that information.

### 2. Get entity profiles
How aggressively you call \`security.get_entity\` depends on how many entities step 1 produced:

- **2+ entities returned** — prefer the inline table rendered from the aggregate
  \`security.entity\` attachment (see "Inline rendering" above). Do NOT loop
  \`security.get_entity\` over every row just to populate the table: the aggregate attachment is
  already sufficient for the user to drill in. Only call \`security.get_entity\` when the user
  explicitly asks for per-entity profiles, risk score inputs, behavior history, or anomaly
  details, or when the investigation narrative clearly requires enrichment for a specific
  entity you are calling out in the prose.
- **Exactly 1 entity returned** — still call \`security.get_entity\` to pull the enriched
  profile (risk inputs, history, behaviors). The single-entity attachment id is deterministic,
  so \`get_entity\` bumps the existing attachment's version instead of creating a duplicate.
- **Entity ID already known (step 1 skipped)** — call \`security.get_entity\` directly.

General guidance when you do call \`security.get_entity\`:

- Identify if any time interval or specific date is needed for historical analysis
- Use \`security.get_entity\` to get the full entity profile, including risk score inputs
- If more than one profile is returned for an entity, order them chronologically to build a picture of entity behavior over time

### 3. Interpret and summarize output

The rendered \`security.entity\` attachment IS the user-facing profile (single-entity card) or ranking (entities table). Follow the "Never duplicate the attachment in prose" principle from the Rich attachments overview — do NOT re-emit the attachment's contents as markdown.

Keep prose short and narrative-only:

- For \`security.get_entity\` (single entity) results, write 1–3 sentences covering whether the entity is risky, what is driving the score, and what to investigate next. Do NOT produce an "Entity Overview" / field-by-field markdown block — those fields are already in the card.
  - When the result contains \`risk_score_inputs\`, one sentence on the top alert(s) contributing to the score is enough. Do NOT paste the full list of inputs as markdown.
  - When the result contains \`anomalies\`, 1-2 bullets summarizing the anomalies with focus on the MITRE ATT&CK tactics is enough. Do NOT paste the full list of anomalies as markdown.
  - When the result contains \`vulnerabilities\`, 1-2 bullets summarizing the vulnerabilities with focus on CVE identifiers and severity levels is enough. Do NOT paste the full list of vulnerabilities as markdown.
  - When the result contains \`profile_history\`, one sentence on the overall trend (increasing / decreasing / stable) is enough, plus a brief callout of any significant change in risk level, asset criticality, watchlist membership, or behaviors.
- For \`security.search_entities\` (multi-entity) results, write 2–4 bullets with top-level takeaways: highest-risk row(s), biggest criticality gaps, outliers worth flagging, and recommended follow-ups. Do NOT re-list every row in markdown (columns like \`risk score\`, \`asset criticality\`, \`first_seen\`, \`last_seen\`) — the entities-table Canvas already shows those columns.

### 4. Provide recommendation
- Recommend investigating external activities for user entities
- Recommend investigating vulnerabilities and exposures for host and service entities

## Entity Analytics dashboard snapshot (Canvas UI)

When the user **explicitly** asked to open the **Entity Analytics home/overview** product experience in chat — same information architecture as Security → Entity Analytics home: **entity risk levels** with donut + breakdown table, **recent anomalies / highlights**, and **entities** — **not** when their ask is only **which entities are riskiest** / **top N** / **list entities** (those are satisfied by the automatic \`security.entity\` attachment from \`security.search_entities\`):

1. Use \`security.search_entities\` (and \`security.get_entity\` as needed) so the snapshot reflects **real** entity store data aligned with the user's filters (entity types, risk, criticality, watchlists, time hints in the question).
2. Call \`attachments.add\` with \`type\` set to exactly \`security.entity_analytics_dashboard\` and \`data\` containing:
   - \`attachmentLabel\`: short title tailored to the request (for example, "High-risk users — last 7 days").
   - \`summary\` (optional): 1–3 sentences interpreting the snapshot for this question.
   - \`time_range_label\` (optional): **omit this field unless the user explicitly named a time window** (e.g. "last 24 hours", "past week", "since yesterday", "in the last 90 days", a specific date or date range). When you do set it, use plain language matching the user's window (for example, "Last 24 hours", "Last 90 days", "Since 2025-01-01"). **Never** populate it with generic filler like \`"Current"\`, \`"Now"\`, \`"Today"\`, \`"All time"\`, \`"Latest"\`, \`"Recent"\`, or a restatement of the attachment title — in those cases leave the field unset so the dashboard renders without a time caption.
   - \`watchlist_id\` / \`watchlist_name\` (optional): when the user or your filters scoped a watchlist (copy from tool/API output when present).
   - \`severity_count\` (optional but recommended): object \`{ "Critical", "High", "Moderate", "Low", "Unknown" }\` with **non-negative integer** counts. Prefer counts that match the environment when you can infer them reliably from tool outputs. If you only have a **sample** (for example entities returned by \`security.search_entities\`), **bucket those rows by \`risk_level\`**, set the counts from that sample, and set \`distribution_note\` to state clearly that counts reflect that sample (for example, "Counts are from the 50 entities returned for this question, not a full-environment rollup").
   - \`anomaly_highlights\` (optional): array of \`{ "title", "body"? }\` for the right-hand panel — summarize notable risk changes, criticality, watchlist membership, or detection-driven signals **derived from the tools** (this replaces live ML anomaly charts when those are not available).
   - \`entities\`: array of row objects \`{ entity_type, entity_id, entity_name?, source?, risk_score_norm?, risk_level?, criticality?, first_seen?, last_seen? }\`. Order by the importance you describe in prose. \`last_seen\` is the entity store record's top-level \`@timestamp\` (always present); do not use \`entity.lifecycle.last_activity\` because that field can be absent for freshly upserted entities. May be empty only when the user asked purely for KPI-style framing and you still supply \`severity_count\` and/or highlights.
3. In your **markdown message**, on its own line (with a BLANK LINE before and after), assemble the tag by substituting the \`id\` and \`current_version\` fields from the \`attachments.add\` result VERBATIM into this exact template:

   \`<render_attachment id="<id from attachments.add>" version="<current_version from attachments.add>" />\`

   Copy those two values byte-for-byte from the tool result. Never invent an id, never derive it from \`attachmentLabel\`, \`summary\`, or any entity name. \`attachments.add\` does NOT return a \`renderTag\`, so for this path you use the template above — do not try to copy a \`renderTag\` that is not there.
4. The UI shows an **inline** pill and **Preview → Canvas** with the same two-column **risk / highlights** layout as the product home page — **only** with the tag from step 3.
5. Still write a concise narrative in the message; use the attachment for the structured dashboard view and deep investigation via **Open Entity Analytics in Security**.
6. If the underlying \`security.search_entities\` also emitted an aggregate \`security.entity\` attachment (2+ entities), you **must render both** tags in the same turn — the entities table and the dashboard snapshot are complementary. Render the table by copying the \`renderTag\` from the \`search_entities\` \`other\` result verbatim, and render the dashboard using the \`attachments.add\` template above. Rendering only the \`security.entity\` table while claiming in prose that it is the Entity Analytics dashboard is **incorrect**.

## Examples

### Example 1: Riskiest Users

User query: Which users have the highest risk scores?

Steps:
1. Use \`security.search_entities\` to get the top N users sorted by their normalized risk scores. When 2+ users are returned the tool emits an aggregate \`security.entity\` attachment.
2. Optionally use \`security.get_entity\` for specific rows when you need richer context for prose callouts.
3. Copy the \`renderTag\` string verbatim from the \`search_entities\` \`other\` result onto its own line — the renderer shows the entities table Canvas.
4. Write a short narrative calling out the highest-risk users, biggest criticality gaps, and suggested follow-ups.

### Example 2: Risk Score Changes Over Time

User query: Who has had the biggest increase in risk score over the last 90 days?

Steps:
1. Use \`security.search_entities\` with a riskScoreChangeInterval of '90d' to find entities with risk score changes.
2. Analyze the results and identify which entities have had significant (greater than ${ENTITY_RISK_SCORE_SIGNIFICANT_CHANGE_THRESHOLD} score change) increases in risk score.
3. For each entity with significant risk score change, use \`security.get_entity\` with an interval of '90d' to get their full profile history.
4. Copy the \`renderTag\` string verbatim from the \`search_entities\` \`other\` result onto its own line (entities table Canvas) and summarize in prose the previous vs current risk scores, the magnitude of change, and the drivers.

### Example 3: High Impact Assets

User query: What are the riskiest hosts in my environment that are high impact?

Steps:
1. Use \`security.search_entities\` to get the top N hosts sorted by their normalized risk scores, using parameter \`criticalityLevels: ['high_impact', 'extreme_impact']\` to filter for high impact.
2. Copy the \`renderTag\` string verbatim from the \`search_entities\` \`other\` result onto its own line so the user gets the entities table Canvas.
3. Summarize in prose the riskiest hosts and why their criticality matters.

### Example 3b: Top N Entities By Criticality

User query: List the top 5 entities by criticality.

Steps:
1. Use \`security.search_entities\` with \`sortBy: 'criticality'\` and \`maxResults: 5\`. Do NOT pass \`criticalityLevels\` — the user did not restrict the levels, they asked for a ranking across all of them. (Stuffing all four levels into \`criticalityLevels\` is a no-op filter and would leave the tool sorting by risk score, which is NOT what the user asked for.)
2. Copy the \`renderTag\` string verbatim from the \`search_entities\` \`other\` result onto its own line so the user gets the entities table Canvas — the rows will come back ordered extreme_impact → high_impact → medium_impact → low_impact, with risk score as the tiebreaker within each tier.
3. In prose, call out which criticality tiers are represented in the top N and the riskiest entity inside the highest tier; recommend follow-ups for the extreme_impact rows first.

### Example 4: Risk Score History

User query: Has Cielo39's risk score changed significantly?

Steps:
1. Use \`security.get_entity\` with an interval of '30d' to fetch Cielo39's current profile and profile_history for the last 30 days.
2. Copy the \`renderTag\` string verbatim from the \`get_entity\` \`other\` result onto its own line so the user sees the entity card — that card is the profile view.
3. Analyze the risk scores in the profile history along with the current risk score to determine if the change in risk score is significant (e.g., greater than ${ENTITY_RISK_SCORE_SIGNIFICANT_CHANGE_THRESHOLD} points).
4. Summarize in 1–3 sentences of prose: the overall trend (stable / increasing / decreasing), whether the change crosses the significance threshold, and what to investigate next. Do NOT re-list the entity's fields as an "Entity Overview" markdown block — the entity card already shows them.

### Example 5a: Users From a Specific Vendor (namespace-first)

User query: Who are my riskiest AWS users?

Steps:
1. The query is about **user** entities and AWS has a canonical namespace (pass-through), so try the normalized field first: \`security.search_entities\` with \`entityTypes: ['user']\` and \`namespaces: ['aws']\`. Do NOT set \`riskScoreMin\` — the user did not give a numeric floor, and the tool defaults to sorting by risk score descending.
2. **If step 1 returns zero rows**, retry with \`sources: ['aws']\` (exact-or-prefix matching also covers \`aws.cloudtrail\`, \`aws.guardduty\`, \`aws.s3access\`, etc.) — do NOT fan out into \`['aws', 'aws.cloudtrail', 'aws.guardduty']\`.
3. When 2+ entities are returned, render the inline aggregate \`security.entity\` attachment (see "Inline rendering" rules) instead of repeating a markdown table.
4. In the prose, name the vendor the user filtered on (e.g. "6 AWS users scored above 70") and call out the riskiest entries the user may want to investigate. If both attempts returned zero, report "no matching entities" per the fallback in Investigation Step 1.

### Example 5b: Hosts From a Specific Data Source (sources-only)

User query: Can I get all hosts coming from CrowdStrike?

Steps:
1. Host entities have no \`entity.namespace\`, and CrowdStrike has no canonical namespace anyway — so skip \`namespaces\` and use \`security.search_entities\` with \`entityTypes: ['host']\` and \`sources: ['crowdstrike']\`. Exact-or-prefix matching covers both \`crowdstrike\` and any \`crowdstrike.*\` dataset variants. Use the raw lowercase integration key, never a pretty-printed label (so \`island_browser\`, not \`Island Browser\`).
2. When 2+ entities are returned, render the inline aggregate \`security.entity\` attachment (see "Inline rendering" rules) instead of repeating the markdown table.
3. In the prose, name the data source the user filtered on (e.g. "9 hosts are sourced from CrowdStrike") and call out the riskiest entries the user may want to investigate.

### Example 6: Single-entity card for the riskiest host

User query: Show me the entity card for the most risky host.

Steps:
1. Use \`security.search_entities\` with \`entityTypes: ["host"]\`, sort implicitly by risk (tool returns highest risk first), and \`maxResults: 1\`.
2. Use \`security.get_entity\` for that host's EUID — this emits a single-entity \`security.entity\` attachment that renders as the entity card.
3. Copy the \`renderTag\` string verbatim from \`get_entity\`'s \`other\` result onto its own line in your reply. Skip the render tag on the \`search_entities\` result — the follow-up \`get_entity\` bumps the same attachment pill with the richer card payload, so rendering both would duplicate the pill.
4. Summarize in prose why this host is the riskiest among hosts in scope.

### Example 7: "Details / profile" vs "List / compare" wording

- User: "**Details** on the riskiest host", "**more about** that host", "**profile** / **deep dive** for this user" → treat like Example 6: one winner, \`security.get_entity\` emits the single-entity card. Render the tag from \`get_entity\`.
- User: "**List** the **five** riskiest hosts", "**compare** these hosts", "**who are** the riskiest users", "**show** risky **hosts**" → \`security.search_entities\` with matching \`maxResults\`; the tool emits the aggregate \`security.entity\` attachment (entities table) when 2+ rows are returned. Render the tag from \`search_entities\`.

### Example 8: List question with only one matching entity

User query: List all critical-risk hosts in my tenant (filters are strict and only **one** host matches).

Steps:
1. Use \`security.search_entities\` with the requested filters. Only one entity comes back.
2. Use \`security.get_entity\` for that single host — this bumps the same attachment's version with the richer card payload, so the user sees one pill (not two) in the conversation.
3. Copy the \`renderTag\` string verbatim from the \`get_entity\` \`other\` result onto its own line. Skip the render tag on the \`search_entities\` result to avoid duplicating the pill. The single-entity card is the correct Canvas for a one-row list.

### Example 9: "Riskiest entities in the system" (generic plural)

User query: Show the riskiest entities in the system.

Steps:
1. Use \`security.search_entities\` with \`entityTypes\` spanning the kinds you will rank (e.g. \`["host","user","service"]\`) or aligned with the user's scope, \`maxResults\` per investigation norms, ordered by risk.
2. Copy the \`renderTag\` string verbatim from the \`search_entities\` \`other\` result onto its own line (entities table Canvas). **Do not** add \`security.entity_analytics_dashboard\` — the user did **not** ask to open the **Entity Analytics home/overview** page by name.
3. In prose, highlight the top riskiest entities and recommend follow-ups.

### Example 10: Riskiest hosts **and** users (multi-type, one message)

User query: Show me the most riskiest hosts and users in my system.

Steps:
1. Use \`security.search_entities\` with \`entityTypes: ["host", "user"]\` (or run one call per type when the user wants explicit parity) and \`maxResults\` for how many rows to show. Omit \`riskScoreMin\` — the user did not specify a numeric floor, and the tool defaults to sorting by risk score descending.
2. Copy the \`renderTag\` string verbatim from the \`search_entities\` \`other\` result onto its own line — the entities table Canvas handles the mixed host/user list.
3. In prose, summarize the highest-risk entities of each type.

### Example 11: Entity Analytics dashboard / home page

User query: Show me the Entity Analytics dashboard.

Steps:
1. Use \`security.search_entities\` to gather a representative sample of entities (and optionally \`security.get_entity\` for highlights you want to call out).
2. Call \`attachments.add\` with \`type\` \`security.entity_analytics_dashboard\` and populate \`severity_count\`, \`anomaly_highlights\`, and \`entities\` from the tool outputs (see "Entity Analytics dashboard snapshot").
3. Take the \`id\` and \`current_version\` from the \`attachments.add\` result and substitute them VERBATIM into \`<render_attachment id="<id>" version="<current_version>" />\`; output that on its own line in the reply so the user sees the dashboard Canvas.
4. You may **also** render the aggregate \`security.entity\` tag from \`search_entities\` in the same turn — copy the \`renderTag\` string verbatim from its \`other\` result. The entities table and the dashboard snapshot are complementary views.

**Common mistake:** rendering only the \`security.entity\` entities table (titled e.g. "Top 10 Riskiest Users") and claiming in prose that it is the Entity Analytics dashboard. That is **wrong** — always render the \`security.entity_analytics_dashboard\` tag from \`attachments.add\` (and optionally the \`security.entity\` tag as a complement) when the user's prompt matches the "Dashboard trigger" phrases.

## Best Practices
- Always use \`calculated_score_norm\` (0-100) when reporting risk scores
- Provide the criticality level of the entity if available, otherwise report as "unknown"
- Risk levels: Critical (highest), High, Moderate, Low, Unknown
- An entity is considered risky if its normalized score is above 80
- Higher scores indicate greater risk to the organization
- A change in risk score greater than ${ENTITY_RISK_SCORE_SIGNIFICANT_CHANGE_THRESHOLD} points over an interval is considered significant
- An entity is considered high impact if its criticality level is "high_impact" or "extreme_impact"
- Data source values (\`entity.source\`) are lowercase integration keys (e.g. \`crowdstrike\`, \`island_browser\`, \`aws\`, \`aws.cloudtrail\`, \`entityanalytics_okta\`). The inline table renders them title-cased for display, but you MUST always filter using the raw key when calling \`security.search_entities\`. The \`sources\` parameter matches exactly or as a \`<value>.*\` prefix, so a single vendor key (e.g. \`['aws']\`) covers its dataset variants — do not fan out into \`['aws', 'aws.cloudtrail']\`.
- Normalized user namespaces (\`entity.namespace\`) are canonical values: \`okta\`, \`entra_id\`, \`microsoft_365\`, \`active_directory\`, \`local\`, \`unknown\`, or pass-through of \`event.module\` (e.g. \`aws\`, \`gcp\`). Use the \`namespaces\` parameter only for **user** entities; prefer it over \`sources\` when a canonical namespace exists, and fall back to \`sources\` when the namespace search returns zero rows or the vendor has no canonical namespace. See the "Vendor source cheat sheet".
- Document your analysis process and reasoning clearly
- Avoid listing noisy raw data; highlight the most relevant signals
- Offer a short explanation of why a risk score is considered high or low
- Suggest next steps if needed, for example:
  - Investigate relevant alerts contributing to risk score
  - Investigate external activities and movement for risky user entities
  - Investigating vulnerabilities and exposures for risky host and service entities
`;

const legacyContent = `
## When to Use This Skill

Use this skill when:
- A user asks to find the riskiest entities (hosts, users, services, generic) in their environment
- A user wants to understand whether any entities have had a significant change in risk score
- You want to look up the asset criticality level for an entity

## Related Skills
When asked to investigate unusual or anomalous behavior by entities, use:
- '~/skills/security/ml/find-security-ml-jobs' to find the appropriate ML jobs that will answer the user's question

## Entity Analysis Process

### 1. Find the risky entities
- Use the 'security.entity_analytics.risk_score' tool to find the riskiest entities based on their normalized risk scores (0-100)
- These entities will be sorted by their normalized risk score (calculated_score_norm) in descending order
- When entity ID is provided and no results are found, you must call the tool again with another entity type to find the entity (e.g. if "john" is not found as a user entity, try finding "john" as a host or service entity type)

### 2. Analyze risk score changes over time
- Use the 'security.entity_analytics.risk_score' tool to analyze how an entity's risk score has changed over a specified time interval (e.g., last 30, 60, 90 days)
- Look for significant increases in risk score (e.g., greater than ${ENTITY_RISK_SCORE_SIGNIFICANT_CHANGE_THRESHOLD} points) to identify entities that may require further investigation

### 3. Retrieve asset criticality levels
- Use the 'security.entity_analytics.asset_criticality' tool to get the asset criticality level for a specific entity
- If no entity ID is provided, retrieve the most critical assets in the environment sorted by their criticality level

## Examples

### Example 1: Riskiest Users

User query: Which users have the highest risk scores?

Steps:
1. Use the 'security.entity_analytics.risk_score' tool to get the top N users sorted by their normalized risk scores.
2. Use the 'security.entity_analytics.asset_criticality' tool to get the asset criticality levels for these users
3. Present the results in a table format showing entity ID, risk score, risk level, and asset criticality level

### Example 2: Risk Score Changes Over Time

User query: Who has had the biggest increase in risk score over the last 90 days?

Steps:
1. Use the 'security.entity_analytics.risk_score' tool with a time interval of '90d' to find entities with risk score increases.
2. Present the findings in a table format showing entity ID, previous risk score, current risk score, and risk score change.

### Example 3: High Impact Assets

User query: What are the riskiest hosts in my environment that are high impact?

Steps:
1. Use the 'security.entity_analytics.risk_score' tool to get the top N hosts sorted by their normalized risk scores.
2. Use the 'security.entity_analytics.asset_criticality' tool to get the asset criticality levels for these hosts
3. Filter the results to only show hosts that have a criticality level of "high_impact" or "extreme_impact"
4. Present the results in a table format showing entity ID, risk score, risk level, and asset criticality level


### Example 4: Risk Score History

User query: Has Cielo39's risk score changed significantly?

Steps:
1. Use the 'security.entity_analytics.risk_score' tool with a time interval of '30d' to analyze Cielo39's risk score changes with host entityType
2. When no results are returned, use the 'security.entity_analytics.risk_score' tool again to analyze Cielo39's risk score changes with user entityType
3. When no results are returned, use the 'security.entity_analytics.risk_score' tool again to analyze Cielo39's risk score changes with service entityType
4. When results are returned, determine if the change in risk score is significant (e.g., greater than ${ENTITY_RISK_SCORE_SIGNIFICANT_CHANGE_THRESHOLD} points).
5. Present the findings in a concise format showing the previous risk score, current risk score, and whether the change is significant.

## Important dependencies
- Risk score questions require the **Risk Engine** to be enabled and risk indices to exist.
- Asset criticality questions require asset criticality data to be ingested into the entity analytics asset criticality index.

## Best Practices
- Always use \`calculated_score_norm\` (0-100) when reporting risk scores
- Provide the criticality level of the entity if available, otherwise report as "unknown"
- Risk levels: Critical (highest), High, Moderate, Low, Unknown
- An entity is considered risky if its normalized score is above 80
- Higher scores indicate greater risk to the organization
- A change in risk score greater than ${ENTITY_RISK_SCORE_SIGNIFICANT_CHANGE_THRESHOLD} points over an interval is considered significant
- Document your analysis process and reasoning clearly
- Avoid listing noisy raw data; highlight the most relevant signals
- Offer a short explanation of why the score is considered high or low
- Suggest next steps if needed (e.g., investigate the most relevant alerts)

## Response formats

### Top N entities
Provide a short table with the key fields:

| Entity | Type | Risk score (0-100) | Risk level | Criticality |
| --- | --- | --- | --- | --- |
| <id_value> | <entity_type> | <calculated_score_norm> | <calculated_level> | <criticality_level or "unknown"> |

Then add 1-2 bullets with key observations (e.g., highest criticality, biggest score gap, which entities to investigate further).`;

export const getEntityAnalyticsSkill = (ctx: EntityAnalyticsSkillsContext) =>
  defineSkillType({
    id: 'entity-analytics',
    name: 'entity-analytics',
    basePath: 'skills/security/entities',
    description:
      'Security entity investigations (hosts, users, services, generic): entity store search/get_entity, risk and criticality. ' +
      'Rich attachments: `security.entity` (emitted automatically by search_entities/get_entity — renders as a single-entity card for 1 entity and as an entities table for 2+ entities); `security.entity_analytics_dashboard` (explicit attachments.add — only when the user asks to show/open/view the Entity Analytics home/overview product page). After each tool result that emits a rich attachment, output `<render_attachment id=… version=… />` in markdown (required for Preview/Canvas UI). ' +
      'Risk history, alert contributions, watchlists, behaviors, discovering risky entities.',
    content: `
# Entity Analysis Guide

${ctx.isEntityStoreV2Enabled ? entityStoreV2Content : legacyContent}
`,
    getInlineTools: () =>
      ctx.isEntityStoreV2Enabled
        ? []
        : FF_DYNAMICALLY_GENERATE_ESQL
        ? [getRiskScoreEsqlTool(ctx), getAssetCriticalityEsqlTool(ctx)]
        : [getRiskScoreInlineTool(ctx), getAssetCriticalityInlineTool(ctx)],
    getRegistryTools: () =>
      ctx.isEntityStoreV2Enabled
        ? [SECURITY_GET_ENTITY_TOOL_ID, SECURITY_SEARCH_ENTITIES_TOOL_ID]
        : [],
  });
