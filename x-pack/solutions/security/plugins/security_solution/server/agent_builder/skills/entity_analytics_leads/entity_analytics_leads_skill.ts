/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import {
  SECURITY_LIST_LEADS_TOOL_ID,
  SECURITY_GENERATE_LEADS_TOOL_ID,
  SECURITY_DISMISS_LEAD_TOOL_ID,
} from '../../tools/entity_analytics';

export const ENTITY_ANALYTICS_LEADS_SKILL_ID = 'entity-analytics-leads';

export const entityAnalyticsLeadsSkill = defineSkillType({
  id: ENTITY_ANALYTICS_LEADS_SKILL_ID,
  name: ENTITY_ANALYTICS_LEADS_SKILL_ID,
  basePath: 'skills/security/entity_analytics_leads',
  description:
    'AI-generated investigation leads for security entities. ' +
    'Use when the user asks to review, list, show, triage, dismiss, or generate AI-generated investigation leads, ' +
    'or when the user wants to find proactive threat hunting opportunities surfaced from entity data.',
  content: `
# Investigation Leads Guide

## When to Use This Skill

Use this skill when the user asks to:
- List, show, or review AI-generated investigation leads
- Triage open leads and decide which to investigate next
- Check whether any new leads have been generated
- Filter leads by status (active, dismissed, expired) or prioritize by score
- Find proactive threat hunting opportunities from entity data (leads are AI-generated hypotheses that surface these opportunities)

Do **not** use this skill when:
- The user wants to find leads about a specific entity — \`list_leads\` has no entity filter; it returns all leads across the space. Retrieve leads, surface any that mention the entity, and follow up with the \`entity-analytics\` skill for a full profile.
- The user wants to investigate a specific entity by ID — use the \`entity-analytics\` skill instead.
- The user wants to search for risky entities — use \`security.search_entities\`.

## Available Tools

- **\`${SECURITY_LIST_LEADS_TOOL_ID}\`**: List AI-generated investigation leads.
- **\`${SECURITY_GENERATE_LEADS_TOOL_ID}\`**: Trigger a new AI lead generation run (asynchronous — returns immediately; check back with \`list_leads\`).
- **\`${SECURITY_DISMISS_LEAD_TOOL_ID}\`**: Dismiss a lead by ID, marking it as triaged.

## What Is a Lead?

A lead is an AI-generated investigation hypothesis about one or more security entities. Each lead:
- Has a **title** (the hypothesis) and a **byline** (one-sentence context)
- Targets one or more **entities** (type + name) the hypothesis is about
- Carries a **priority** score (1–10, 10 = most urgent) derived from the contributing observations
- Has a **status**: \`active\` (open), \`dismissed\` (triaged away), or \`expired\` (past its relevance window)
- Has a **staleness**: \`fresh\` (< 24 h), \`stale\` (24–72 h), or \`expired\` (> 72 h) — computed from the generation timestamp

## Using list_leads

Call \`${SECURITY_LIST_LEADS_TOOL_ID}\` to retrieve leads. All parameters are optional:

| Parameter | Default | Notes |
| --- | --- | --- |
| \`status\` | all | Filter to \`active\`, \`dismissed\`, or \`expired\` |
| \`sortField\` | \`priority\` | Or \`timestamp\` for recency-first; results are always descending |
| \`perPage\` | 20 | Max 100 per page |

The result also includes **\`lastGeneratedAt\`**: ISO timestamp of the most recent generation run, or \`null\` if lead generation has never run. Surface this when the analyst asks how recent the leads are.

## Interpreting and Presenting Results

1. **Lead the answer with the most urgent leads** — sort by \`priority DESC\` (the default) and call out priority ≥ 7 leads first.
2. **Surface staleness when relevant** — a \`stale\` or \`expired\` lead may not reflect the current entity state; flag this to the analyst.
3. **Chain with entity profiling** — after listing leads, the analyst will often want to investigate the lead's entities. Use \`entity-analytics\` skill tools (\`security.get_entity\` / \`security.search_entities\`) with the entity names from the lead to pull full profiles.
4. **When \`lastGeneratedAt\` is null** — no generation run has completed yet; leads list will be empty.
5. **When the result is empty** — report that no leads match the filter, not that there are no leads at all (a different status filter may return results).

## Using generate_leads

Call \`${SECURITY_GENERATE_LEADS_TOOL_ID}\` when the user wants to kick off a new generation run.

- The tool will prompt the user for confirmation before starting.
- The tool returns immediately with \`{ status: 'running', executionUuid }\` — generation continues in the background.
- After the run completes, new leads appear in \`list_leads\`. Tell the user to re-list leads to see the new results.
- \`connectorName\` is optional — provide a name or partial name (e.g. "OpenAI") and the tool resolves it to the correct connector. If omitted, the previously configured connector is used. If no connector has been configured, the tool will ask for one.

## Using dismiss_lead

Call \`${SECURITY_DISMISS_LEAD_TOOL_ID}\` when the user decides a lead is not worth investigating.

- Requires the lead **\`id\`** (present in every \`list_leads\` result).
- Pass **\`title\`** as well (also from \`list_leads\`) so the confirmation prompt shows the lead name instead of a raw ID.
- The tool will prompt the user for confirmation before making the change; wait for their response.
- After dismissal, the lead's status becomes \`dismissed\` and it no longer appears in the default active view.

## Example Flows

### "Show me the open investigation leads"
1. Call \`${SECURITY_LIST_LEADS_TOOL_ID}\` with \`status: 'active'\`
2. Present the leads sorted by priority (highest first), with title, byline, entities, and staleness
3. Note any stale leads and the last generation run time

### "Generate new investigation leads"
1. Call \`${SECURITY_GENERATE_LEADS_TOOL_ID}\` (with \`connectorName\` if not previously configured, e.g. \`connectorName: "OpenAI"\`)
2. The tool will ask the user to confirm before starting
3. On confirmation, report that generation has started and suggest calling \`list_leads\` once it completes

### "Dismiss this lead"
1. Call \`${SECURITY_LIST_LEADS_TOOL_ID}\` if you don't already have the lead details
2. Call \`${SECURITY_DISMISS_LEAD_TOOL_ID}\` with the lead \`id\` and \`title\` (so the user sees a friendly name in the confirmation)
3. On confirmation, report that the lead has been dismissed

### "Any new leads from the last run?"
1. Call \`${SECURITY_LIST_LEADS_TOOL_ID}\` with \`sortField: 'timestamp', status: 'active'\`
2. The most recently generated leads appear first
3. Report \`lastGeneratedAt\` to confirm when the last run was

### "Tell me more about the entities in this lead"
1. Use the entity names from the lead result
2. Switch to the \`entity-analytics\` skill and call \`security.get_entity\` for each named entity

## Best Practices
- Default to \`status: 'active'\` unless the user explicitly asks for dismissed or expired leads
- Use \`priority\` sort (default) for triage; switch to \`timestamp\` only when the user asks for the newest leads
- Never invent lead content — only present what the tool returns
- Always show the \`staleness\` field alongside the lead so the analyst can judge relevance
`,
  getRegistryTools: () => [
    SECURITY_LIST_LEADS_TOOL_ID,
    SECURITY_GENERATE_LEADS_TOOL_ID,
    SECURITY_DISMISS_LEAD_TOOL_ID,
  ],
});
