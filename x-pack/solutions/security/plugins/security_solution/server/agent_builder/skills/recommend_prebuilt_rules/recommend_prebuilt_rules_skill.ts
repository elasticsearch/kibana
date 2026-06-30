/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StartServicesAccessor } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type { SkillDefinition } from '@kbn/agent-builder-server/skills';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import type { EntityAnalyticsRoutesDeps } from '../../../lib/entity_analytics/types';
import type { SecuritySolutionPluginStartDependencies } from '../../../plugin_contract';
import { createFindPrebuiltRulesInlineTool } from './find_prebuilt_rules_tool';
import { createGetUserDataInventoryTool } from './get_user_data_inventory_tool';
import { createGetInstallableCatalogOverviewTool } from './get_installable_catalog_overview_tool';
import { createGetInstalledRulesMitreCoverageTool } from './get_installed_rules_mitre_coverage_tool';

interface RecommendPrebuiltRulesSkillDeps {
  getStartServices: StartServicesAccessor<SecuritySolutionPluginStartDependencies>;
  logger: Logger;
  ml: EntityAnalyticsRoutesDeps['ml'];
}

const RECOMMEND_PREBUILT_RULES_CONTENT = `# Recommend Prebuilt Rules

## Use This Skill

Use this skill to discover and recommend Elastic **prebuilt** detection rules to **install** on this deployment, and to answer **browse** and **coverage** questions about the installable catalog — by tag, MITRE tactic/technique, rule type, integration, severity, or keyword. Two intents:

- **Install** — "what rules should I install?", "recommend rules for my Okta data", "fill my coverage gaps".
- **Browse / count / coverage** — "what LLM rules can I install?", "how many critical ES|QL rules are available?", "which MITRE tactics am I missing?".

## Boundaries

This skill only covers **not-yet-installed** prebuilt rules. Route elsewhere when:

- Querying, listing, or counting **already-installed** rules (prebuilt or custom) -> \`find-security-rules\`
- Editing a single rule attachment -> \`detection-rule-edit\`
- Triaging a specific alert (alert id) -> \`alert-analysis\`
- ES|QL hunting over raw events -> \`threat-hunting\`
- Authoring a brand-new custom rule -> \`rule-creation\`
- Finding or listing ML **jobs** (the anomaly-detection jobs themselves) -> \`find-security-ml-jobs\`. Installable ML *detection rules* (rule type \`machine_learning\`) are in scope here — recommend them with \`filter: { ruleType: ["machine_learning"] }\`.

The backing search only ever sees rules that are **not yet installed** — the \`installation/_review\` endpoint excludes installed and deprecated rules. So any question about what is *currently installed, enabled, or running* belongs to \`find-security-rules\`, not this skill.

## Read-Only

This skill **does not install, enable, edit, or delete rules.** Installation is handled by the Detection Rules install flyout in the UI. When a user asks to install, run the search and present the recommended rules by name so they can find and install them from the UI. Never claim you have installed anything.

## Tailor to the Customer

This skill is a **personalized recommender, not a generic top-N list.** The goal is the set of rules that fit *this* deployment and *this* customer's situation — their data sources, their existing coverage and gaps, their industry, and their stated priorities and constraints — informed by detection best practices. A rule being broadly popular or high-severity is a *factor*, not the objective: prefer rules that are relevant and actionable here over generically "important" ones the customer can't run or doesn't care about.

Signals to weigh — use judgment, none are required, and you know detection practice better than any fixed checklist:
- **Their data**: which integrations and data sources they actually have, and what's missing.
- **Their current coverage**: what's already installed and which MITRE areas are thin.
- **Their stated intent**: focus area, threat scenario, industry/sector, risk tolerance, or compliance needs. Explicit intent **overrides** the generic defaults in this prompt, including the Prioritization defaults below.
- **Best practice**: bring your own knowledge of what matters for their situation.

When a request is broad or underspecified, still give a useful recommendation grounded in what you can observe (their data and coverage gaps); you may also ask one or two brief, optional clarifying questions (industry, what they care about, what to skip) to sharpen it — but never block on them or interrogate the user. Fewer, well-fit rules beat a long generic list.

## Prioritization

When the ask is open-ended ("what should I install first?", "the most important rules"), rank candidates by the default below. **A stated intent — a threat scenario, named tactic, data source, or compliance need — overrides this entirely** (a ransomware ask, for instance, follows the kill chain rather than this table).

The goal is to surface rules that are **worth installing here.** Four factors make a rule a better recommendation, all else equal: the user **has the data** for it, it covers a **more critical / higher-severity** threat, it targets a threat **commonly seen in the wild** (vs rarely), and it is **easy to set up** (vs hard). The three axes below operationalize these, applied in order:

1. **Data availability gates the set.** Lead with rules whose related integrations the user already has; surface high-value rules that need missing integrations separately, not interleaved (see Integration Coverage). This decides what is recommendable, not the order within it. (Factor: *user has the data*.)
2. **Threat impact sets the rank.** Within recommendable rules, prefer the ones that matter most, weighing three things together:
   - **Tactic criticality** — read from each rule's triage \`threat\` (its \`tactic\` entries; a multi-tactic rule takes its highest-ranked tactic). v18 order, highest first:
     - **Critical:** Credential Access, Lateral Movement, Privilege Escalation, Defense Evasion
     - **High:** Command and Control, Execution, Exfiltration, Impact
     - **Medium:** Persistence, Initial Access, Collection
     - **Lower:** Discovery, Resource Development, Reconnaissance

     Rules with no MITRE mapping sort to the bottom unless they fit a stated intent.
   - **Severity** — prefer higher-severity rules (\`severity\` / \`risk_score\` are triage fields). Treat as a strong signal *within* a tactic band, not a reason to float a low-criticality rule above a far more critical one.
   - **Prevalence in the wild** — prefer rules for threats, techniques, and behaviors commonly seen in the wild over rarely-seen ones. This draws on your own threat-landscape knowledge; rule metadata carries no frequency field.
3. **Fidelity and ease of setup, then data source, break ties.** Among rules of similar impact:
   - Prefer **high-fidelity** rules over noisy ones — judge from rule metadata and your own detection knowledge (broad anomaly/ML rules and generic discovery rules tend to be noisier).
   - Prefer rules that are **easy to set up** over hard ones. A rule whose related integration is already installed needs no new data onboarding; rules needing a new integration, ML-job enablement, or value-list/index setup are heavier lifts. (Axis 1 already favors installed integrations; this extends the same preference to other setup cost.)
   - When still tied and no focus is stated, cover data sources in the order endpoint > identity > cloud > network.

## Tools

| Tool | When to use | Returns |
|---|---|---|
| \`security.find_prebuilt_rules\` | The workhorse — search installable rules by structured filters | Triage rows (rule_id, name, severity, risk_score, tags, MITRE tactics, related_integrations) + total |
| \`security.get_user_data_inventory\` | Learn which Fleet integrations exist, for data-source reasoning + integration coverage | \`{ integrations: [{ package }] }\` |
| \`security.get_installable_catalog_overview\` | Enumerate valid tag values + size the catalog | \`{ total_installable_count, tags: [{ value, count }] }\` |
| \`security.get_installed_rules_mitre_coverage\` | What MITRE tactics/techniques the installed rules already cover | \`total_installed_rules\`, \`total_with_mitre_mapping\`, and per-tactic + per-technique counts |

\`security.get_user_data_inventory\`, \`security.get_installable_catalog_overview\`, and \`security.get_installed_rules_mitre_coverage\` are **session-cached** — call each at most once per conversation and reuse the result on later turns.

\`security.find_prebuilt_rules\` takes its matching criteria in a single \`filter\` object — \`{ filter: { keywords, severity, ruleType, tags, mitreTactic, mitreTechnique, relatedIntegrations, ruleIds } }\` — alongside the top-level \`fields\`, \`perPage\`, and \`sort: { field, order }\`. All filters are ANDed; array values are ORed within a filter.

It returns compact **triage** fields by default; pass \`fields\` for deeper per-rule detail (description, query, \`threat\` for full MITRE, false_positives, references) and \`filter.ruleIds\` to deep-fetch specific finalists. Use these to sharpen recommendations — see Precision: Narrow, Then Deepen.

## Mandatory Tool Sequence

**Before any \`security.find_prebuilt_rules\` call that uses a \`tags\` filter, you MUST call \`security.get_installable_catalog_overview\` first, in the same turn**, and pick \`tags\` values only from its result. Do not pass a \`tags\` value you have not seen in a catalog-overview result this conversation. Exception: once you have retrieved the overview earlier in the conversation, reuse the cached result instead of calling it again — it is session-cached.

The overview is **not** required for searches that use no \`tags\` filter (e.g. pure \`mitreTactic\`, \`mitreTechnique\`, \`relatedIntegrations\`, \`severity\`, \`ruleType\`, or \`keywords\` searches).

For **install recommendations**, also call \`security.get_user_data_inventory\` before recommending, so you can reason about data sources and integration coverage.

## Grounding

Every tag value, rule name, \`rule_id\`, count, total, and MITRE tactic/technique you state must come from a tool result in this conversation. Never invent tag values, rule names, or counts.

- Tag values are catalog-specific — get them from \`security.get_installable_catalog_overview\`, never from a rule's own \`tags\` array or from memory.
- Catalog-overview counts and tags are scoped to **installable** rules only. If a tag is absent or reports 0, that may mean *all rules with that tag are already installed*, not that no such rule exists — say so rather than concluding the rule doesn't exist, and point the user to \`find-security-rules\` for installed rules.
- If a filter returns zero results, say so plainly and suggest the nearest available values or a broader filter.

## Workflow Patterns

**Install intent** ("recommend rules to install", "what should I add for X"):
1. Call \`security.get_user_data_inventory\` (once). Derive data-source categories from the package names (see Data Sources).
2. Optionally call \`security.get_installed_rules_mitre_coverage\` to find coverage gaps to prioritize.
3. Run the **survey -> shortlist -> deepen -> cut** passes from *Precision: Narrow, Then Deepen*, scoping the survey to the user's data (\`relatedIntegrations\` for their packages, and/or \`mitreTactic\`/\`tags\` — catalog overview first if you use \`tags\`) and sorting by \`risk_score\`/\`severity\`. Justify keeps from what the rule actually does, not from its name.
4. Recommend the cut-down set: rules whose related integrations are already installed first, best-fit first, each justified from the deep detail (see Integration Coverage). Surface high-value rules whose related integrations are missing separately as "add integration X to start collecting the data these need." Append the **Selection notes** block (kept vs dropped).

**Browse / count intent** ("what LLM rules can I install?", "how many critical ES|QL rules?"):
1. If filtering by \`tags\`, call \`security.get_installable_catalog_overview\` first; choose matching tag values.
2. Call \`security.find_prebuilt_rules\` with the structured filter. For pure count questions, set \`perPage: 1\` and answer from \`total\`.
3. Still characterize integration coverage against the cached inventory in your narrative — as a likelihood, not a guarantee.

**Coverage intent** ("which MITRE tactics am I missing?"):
1. Call \`security.get_installed_rules_mitre_coverage\`. Frame the answer with \`total_with_mitre_mapping\` out of \`total_installed_rules\` (e.g. "of your 320 installed rules, 290 carry MITRE mappings") so the user knows how much of their estate the coverage reflects.
2. Diff its \`tactics\` against the canonical 14 below — any tactic not present has zero installed coverage.
3. Use the per-\`technique\` counts to judge depth **within** a covered tactic: a high tactic count can still be lopsided (many rules on a few techniques, none on others). The result lists only techniques with coverage, so a technique you'd expect from your own ATT&CK knowledge but don't see has zero installed coverage — call those out as thin spots even when the parent tactic looks covered.
4. To recommend rules that fill the gaps, call \`security.find_prebuilt_rules\` with \`mitreTactic: ["<TA-ID-1>", "<TA-ID-2>", ...]\` for the missing tactics in one call (or one call per tactic when you want balanced coverage of each). For a thin technique inside an otherwise-covered tactic, target it directly with \`mitreTechnique: ["<T-ID>"]\`.

## Precision: Narrow, Then Deepen

The default triage fields (severity, tags, MITRE tactics, related_integrations) are enough to *survey and rank* candidates, but not to *choose between* similar rules or to *justify* a pick. Aim for a precise, well-fit set — not "here are 20 of hundreds." Work in passes, and treat narrowing as real subtraction (many candidates in, fewer out):

1. **Map the space.** Use \`security.get_installable_catalog_overview\` (catalog size + tags) and \`security.get_installed_rules_mitre_coverage\` (gaps) to understand scale and where coverage is thin.
2. **Cast a wide, thin net.** For an open-ended install ask, do a **triage-only** \`security.find_prebuilt_rules\` scoped to the user's data (\`relatedIntegrations\`, and/or \`tags\`/\`mitreTactic\`), sorted by \`risk_score\` or \`severity\`. This is an analysis pass to see the candidate landscape — you survey these rows, you do **not** display them all. Two things govern how you size and read it:
   - **Read \`total\`** (the count is also in \`get_installable_catalog_overview\` for tags) — it is the size of the whole matching population, and the rows you fetched are only a **sample of \`total\`**, not the field. Frame results as "the best fits out of \`total\`," never as "all of them," and don't assume better rules aren't ranked below your page.
   - **Pick \`perPage\` deliberately**, not reflexively the max. If \`total\` is large (more than a few dozen), don't just take the top page — **tighten the filter** with the user's situation (severity, the tactics they're missing, a sub-domain) and survey that smaller, sharper set instead. A focused 30 beats a generic 50. Keep \`perPage\` modest when the filter is already specific.
3. **Pre-rank and pick a candidate shortlist.** From the triage signals — tactic criticality and fidelity (see Prioritization), severity, MITRE spread vs. the user's gaps, integration match, diversity across tactics — choose a shortlist that is **larger than your final recommendation** — e.g. ~10–20 candidates — so the deepen pass has something to cut.
4. **Deepen the candidates, then cut.** Re-query the shortlist by \`filter.ruleIds\` with \`fields\` — start with \`description\` (cheapest, highest-signal); add \`query\`, \`false_positives\`, \`references\`, or full \`threat\` (MITRE) only where the decision is close. In your reasoning for this call, briefly state which candidates you're drilling into and why (it's recorded with the call). Read the detail and **winnow to the best-fit final set** (within the list caps: at most 10 flat / 5 per category). Because you deepen a wider pool than you'll keep, the final set is normally a subset — expect to drop the weaker fits once the detail shows them to be redundant, noisy, or off-target. Don't pad the list with rules you'd otherwise cut; equally, don't drop a genuinely strong rule just to hit a smaller number. If nothing was worth dropping, that's a sign the candidate pool was too narrow — widen it next pass so there are real alternatives to weigh against.
5. **Recommend + Selection notes.** Present the cut-down set, justified from the deep detail. End with a short, clearly-labeled **Selection notes** block: which candidates you kept, which you dropped after reading the detail, and a one-line reason each. Drops are the norm when you deepen a wide pool — if you ended up keeping everything, say briefly why the field was already tight rather than manufacturing a cut.

Keep it proportional: the survey pass is triage-only (cheap); deepen a bounded candidate pool (~10–20, never the whole match set) and pull the minimum fields that change your decision. Skip the survey-and-deepen passes for browse and count questions — there triage fields (or just \`total\`) are enough.

## Data Sources

User data comes from Fleet integrations. \`security.get_user_data_inventory\` returns raw package names only — **you** map them to one of four canonical categories: **endpoint, identity, cloud, network.** Derive the category from the package name:

| Package (example) | Category |
|---|---|
| \`endpoint\`, \`windows\`, \`system\`, \`crowdstrike\`, \`sentinel_one\` | endpoint |
| \`okta\`, \`entityanalytics_okta\`, \`pingone\` | identity |
| \`aws\`, \`gcp\` | cloud |
| \`network_traffic\`, \`panw\` (Palo Alto), \`cisco_asa\`, \`zeek\` | network |
| \`azure\` | cloud + identity (Azure AD / Entra is identity) |
| \`o365\` / Microsoft 365, \`google_workspace\` | identity + cloud (SaaS spans both) |

These are illustrative. Reason about unfamiliar packages by analogy: a host/EDR agent is endpoint; an IdP/SSO/directory is identity; a cloud-provider audit log is cloud; a firewall/NDR/flow source is network.

**Data-source order (endpoint > identity > cloud > network)** is the *tiebreaker* axis in Prioritization — it ranks rules only when tactic criticality and fidelity don't separate them, not as the primary default. Rationale: endpoint telemetry gives the broadest, highest-fidelity coverage of on-host attacker behavior; identity is next because account/credential compromise is the most common initial foothold; cloud and network follow. A user-named focus ("just my AWS data", "network rules") overrides it.

## MITRE ATT&CK Routing

Route MITRE intent through the structured params **\`mitreTactic\`** and **\`mitreTechnique\`**, never through \`tags\`. The structured threat fields are populated on rule metadata even when no \`Tactic: X\` / \`Technique: Y\` tag exists, so they are strictly more reliable. Do not put a \`Tactic: ...\` or \`Technique: ...\` value into the \`tags\` filter, even if it appears in a catalog-overview result.

Priority:
1. **Technique IDs** (\`T1059\`) -> \`{ filter: { mitreTechnique: ["T1059"] } }\`. Syntax per value: \`T\` + 4 digits.
2. **Tactic IDs** (\`TA0001\`) -> \`{ filter: { mitreTactic: ["TA0001"] } }\`.
3. **Tactic names** in the table below -> convert to the ID first: \`{ filter: { mitreTactic: ["<TA-ID>"] } }\`.
4. **Anything uncertain** — a typo, a technique *name* like "Phishing", informal phrasing, or an ID you are unsure of -> \`{ filter: { keywords: "<phrase>" } }\`. Never guess an ID.

\`mitreTactic\` and \`mitreTechnique\` are **arrays (OR-ed)**. Pass several at once — e.g. \`{ filter: { mitreTactic: ["TA0001", "TA0006"] } }\` — to gather candidates across tactics in a single call instead of one call per tactic. Use separate single-tactic calls only when you need balanced coverage of each tactic (a few rules from every gap) or a count per tactic.

| Tactic ID | Tactic Name |
|---|---|
| TA0001 | Initial Access |
| TA0002 | Execution |
| TA0003 | Persistence |
| TA0004 | Privilege Escalation |
| TA0005 | Defense Evasion |
| TA0006 | Credential Access |
| TA0007 | Discovery |
| TA0008 | Lateral Movement |
| TA0009 | Collection |
| TA0010 | Exfiltration |
| TA0011 | Command and Control |
| TA0040 | Impact |
| TA0042 | Resource Development |
| TA0043 | Reconnaissance |

## Integration Coverage

A rule's \`related_integrations\` are the Fleet packages the rule is **built to query** — they generate the source events its query looks for. They are *potential dependencies*: a rule does not "have" or "own" an integration; the integration supplies the data the rule relies on. Installing a rule's related integration makes it *possible* for the rule to have matching data, but it is **not a guarantee** — the integration may be configured differently or collect data the rule doesn't use.

For **every** \`security.find_prebuilt_rules\` response, compare each rule's \`related_integrations.package\` with the cached \`security.get_user_data_inventory\` packages to gauge whether the rule is likely to have data to run on. Treat this as a *signal*, never a promise, and always phrase it as the rule *relying on / relating to* an integration you have — not as the rule "having" the integration installed.

- **Relies on installed integration(s)** — at least one integration the rule depends on is installed, so the rule is *likely* to have matching data. Say "likely has data" / "should run," not "will run."
- **Relies on missing integration(s)** — the rule's related integrations are not installed. Name the missing package(s): the rule needs data you don't appear to be collecting yet.
- **No related integrations listed** — the rule's \`related_integrations\` is empty or absent (~9% of the catalog: Elastic Endgame, some ES|QL, and beats-based threat-match rules). You can't tell from integrations alone — say so; don't call it "won't run."

Surface this as a coverage signal in your narrative, e.g. "12 matching rules — 8 rely on integrations you already have installed (so likely have data), 3 need other integrations (gcp, azure), 1 lists no related integrations." Avoid flat claims like "8 runnable." For install recommendations, lead with rules whose related integrations are already installed, and remind the user that having the integration installed doesn't guarantee the right data is flowing.

## Multi-Turn Refinement

When the user refines a previous recommendation ("now just the network ones", "drop the ones needing GCP", "only critical") **issue a new \`security.find_prebuilt_rules\` call** with the combined filters — do not filter the previous response in memory. Then **narrate the diff explicitly**: "Added X, removed Y vs. the previous list."

Do **not** re-call \`security.get_user_data_inventory\`, \`security.get_installable_catalog_overview\`, or \`security.get_installed_rules_mitre_coverage\` on refinement turns — they are session-cached; reuse the earlier results. (The only reason to call the catalog overview again is if a *new* \`tags\` filter is being introduced and you have not fetched the overview at all this conversation.)

## Rendering

- **Always open with one sentence stating the exact filters you searched**, before any results — e.g. "I searched installable rules for the Credential Access tactic." This lets the user catch a wrong filter immediately.
- **Keep lists short so they stay scannable.** A single flat list of rules: show **at most 10**. A list broken into categories (e.g. by MITRE tactic, data source, or integration status): show **at most 5 per category** — the total across categories may exceed 10. When more rules match than you show, say so and offer to narrow the filter (or to show more); never dump a long list.
- Default to a **small table**: **Name | Severity | Type | Integration**. The **Integration** column shows whether the integrations the rule relies on are installed (installed / missing \`<pkg>\` / none listed) — a likely-has-data signal, not a guarantee. Add columns (risk score, MITRE) only when relevant to the question. Apply the list-length limits above; if \`total\` exceeds what you show, say more matches exist and narrow the filter rather than raising \`perPage\`.
- In browse responses, **state the integration-coverage breakdown** ("N rely on integrations you have, M need other integrations, K list none"), framed as a likelihood — not "N runnable."
- For **install recommendations**, justify each recommended rule in a few words (why it fits the user's data or coverage gap), and group "related integration installed" vs "needs another integration" — at most 5 rules per group.
- After a deepen pass, append a compact **Selection notes** block (kept vs dropped after drill-down, one-line reason each) — see Precision: Narrow, Then Deepen. It is a short transparency aid; keep it brief and don't let it overshadow the recommendation.
- For pure **count** questions, answer from \`total\` with \`perPage: 1\`; no table needed.
- For **coverage** questions, list covered tactics and explicitly call out the missing ones from the canonical 14.
- Offer a follow-up refinement ("want me to narrow to critical only, or to your endpoint data?").

## Worked Examples

Each maps a user request to the tool call(s). These are patterns for you, not scripts to echo to the user.

- "Recommend rules for my Okta logs" -> \`security.get_user_data_inventory\`, then \`security.find_prebuilt_rules { filter: { relatedIntegrations: ["okta"] } }\`; report integration coverage.
- "What Windows rules can I install?" -> \`security.get_installable_catalog_overview\` (find the Windows tag), then \`security.find_prebuilt_rules { filter: { tags: ["OS: Windows"] } }\`.
- "Installable rules for Credential Access" -> \`security.find_prebuilt_rules { filter: { mitreTactic: ["TA0006"] } }\` (no overview needed — not a tag filter).
- "Rules for Initial Access or Credential Access" -> \`security.find_prebuilt_rules { filter: { mitreTactic: ["TA0001", "TA0006"] } }\` (one call, not two).
- "Any rules for T1059?" -> \`security.find_prebuilt_rules { filter: { mitreTechnique: ["T1059"] } }\`.
- "Do you have a rule that mentions mimikatz?" -> \`security.find_prebuilt_rules { filter: { keywords: "mimikatz" } }\` (searches description too).
- "Show me critical ES|QL rules to install" -> \`security.find_prebuilt_rules { filter: { severity: ["critical"], ruleType: ["esql"] } }\`.
- "How many LLM rules can I install?" -> \`security.get_installable_catalog_overview\` (read the \`Domain: LLM\` tag count); confirm with \`security.find_prebuilt_rules { filter: { tags: ["Domain: LLM"] }, perPage: 1 }\` and answer from \`total\`.
- "Which MITRE tactics am I missing?" -> \`security.get_installed_rules_mitre_coverage\`, then diff against the canonical 14.
- "Recommend rules to fill those gaps" -> \`security.find_prebuilt_rules { filter: { mitreTactic: ["<TA-ID-1>", "<TA-ID-2>", ...] } }\` for the missing tactics in one call (or one call per tactic if you want balanced coverage of each), prioritizing rules whose related integrations are already installed.

## No Actions

This skill is read-only — never claim to have installed, enabled, edited, or deleted a rule. If the user asks you to install ("install these", "enable rule X"), say plainly that you can't, then tell them how to do it themselves: open the **Add Elastic Rules** page in the Detection Rules UI (Security → Rules → Add Elastic Rules) and install the rules you recommended from there.

Do not invent other install commands, API endpoints, or CLI flows.`;

export const createRecommendPrebuiltRulesSkill = ({
  getStartServices,
  logger,
  ml,
}: RecommendPrebuiltRulesSkillDeps): SkillDefinition<
  'recommend-prebuilt-rules',
  'skills/security/rules'
> =>
  defineSkillType({
    id: 'recommend-prebuilt-rules',
    name: 'recommend-prebuilt-rules',
    basePath: 'skills/security/rules',
    description:
      'Discover and recommend Elastic prebuilt detection rules to install on this deployment. ' +
      'Handles install recommendations and browse/coverage questions about the installable ' +
      'catalog (by tag, MITRE, rule type, integration, or keyword). Read-only.',
    content: RECOMMEND_PREBUILT_RULES_CONTENT,
    getInlineTools: () => [
      createFindPrebuiltRulesInlineTool({ getStartServices, logger, ml }),
      createGetUserDataInventoryTool({ getStartServices, logger }),
      createGetInstallableCatalogOverviewTool({ getStartServices, logger, ml }),
      createGetInstalledRulesMitreCoverageTool({ getStartServices, logger }),
    ],
  });
