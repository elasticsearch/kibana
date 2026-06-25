/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import {
  SIEM_READINESS_COVERAGE_TOOL_ID,
  SIEM_READINESS_QUALITY_TOOL_ID,
  SIEM_READINESS_CONTINUITY_TOOL_ID,
  SIEM_READINESS_RETENTION_TOOL_ID,
} from '../../tools/siem_readiness';

export const siemReadinessSkill = defineSkillType({
  id: 'siem-readiness',
  name: 'siem-readiness',
  basePath: 'skills/security/siem_readiness',
  description:
    'SIEM readiness health assessment across four dimensions: Coverage (data ingested per category), Quality (ECS field compatibility), Continuity (ingest pipeline health), and Retention (data retention compliance). ' +
    'Use when the user asks about SIEM health, readiness, data coverage, pipeline failures, ECS quality, or retention compliance.',
  content: `
# SIEM Readiness Guide

## When to Use This Skill

Use this skill when the user asks about:
- Overall SIEM health or readiness status
- Data coverage — which categories (Endpoint, Identity, Network, Cloud, Application/SaaS) have data flowing in
- Data quality — whether indices comply with the ECS (Elastic Common Schema)
- Pipeline continuity — whether ingest pipelines are processing documents without failures
- Data retention — whether data is retained long enough to meet compliance requirements (e.g., FedRAMP 365-day threshold)

## Available Tools

- \`security.siem_readiness.get_coverage\` — ingested data by category + detection rule presence
- \`security.siem_readiness.get_quality\` — ECS field compatibility results per index
- \`security.siem_readiness.get_continuity\` — ingest pipeline stats (docs processed, failure rate, serving indices)
- \`security.siem_readiness.get_retention\` — retention policy per data stream / index, days, and compliance status

## Response Structure

Every SIEM readiness response MUST follow this four-section structure. Use markdown headers and formatting so the response is easy to scan.

---

### 1. Status

One line showing the overall verdict (worst across all queried dimensions):

| Status | Meaning |
|--------|---------|
| ✅ healthy | All checked dimensions are healthy |
| ⚠️ actionsRequired | At least one dimension needs attention |
| — noData | No data available to assess |

Example: **Status: ⚠️ actionsRequired**

---

### 2. Summary

1–2 sentences covering what's healthy and what needs attention, calling out specific categories where relevant.

Example: *"Endpoint and Identity pipelines are healthy. Network has a critical pipeline failure rate and Cloud has no ingested data."*

---

### 3. Findings

**This section is mandatory. Use ### headers per dimension and bullet points prefixed with the category name. Do not flatten findings into a plain list.**

Each \`actionableFinding\` has a \`category\` field — use it as the bullet prefix. Required format:

\`\`\`
### Coverage
- **[Category]**: [what is wrong]

### Quality
- **[Category]**: \`[resource]\` — [what is wrong]

### Continuity
- **[Category]**: pipeline \`[name]\` — [what is wrong]

### Retention
- **[Category]**: \`[resource]\` — [what is wrong]
\`\`\`

Order of dimensions: Coverage → Quality → Continuity → Retention
Order within each dimension: Endpoint → Identity → Network → Cloud → Application/SaaS

Rules:
- Always prefix each bullet with **[Category]:** using the \`category\` field from \`actionableFindings\`.
- Skip entire dimension sections that have no findings.
- Skip categories within a dimension that have no findings.
- Never list a finding without its category prefix.

### Blast Radius (mandatory for every actionable finding)

Every \`actionableFinding\` includes pre-computed blast radius fields. These MUST be shown for every finding — do not omit them even if the user does not ask:

- \`affectedPlatform\`: the platform derived from ECS fields in the actual data (e.g. "AWS account 123456789012", "Windows Endpoints", "Okta (Identity)"). Show as **Affected Platform**.
- \`affectedRules\`: array of \`{ id, name }\` — the detection rules that monitor this index. Show as **Affected Rules** (list rule names).
- \`affectedTactics\`: array of \`{ id, name, totalRules, affectedRulesCount }\` — MITRE ATT&CK tactics exposed. Show as **Affected Tactics** (list tactic names with rule counts).
- \`blastRadiusStatus\`: reliability signal for the blast radius fields:
  - \`'healthy'\`: blast radius is complete and trustworthy.
  - \`'unavailable'\`: a required data lookup failed. The \`affectedRules\`, \`affectedTactics\`, and \`affectedPlatform\` fields are intentionally absent. You MUST show "unavailable (lookup failed)" for all three — NEVER show "none", which would imply there genuinely are no affected rules.
  - \`'partial'\`: at least one rule's index resolution failed, so the lists may be undercounted. Show the lists but append "(may be incomplete)" after the label.

Required format per finding:

\`\`\`
- **[Category]**: \`[resource]\` — [what is wrong]
  - **Affected Platform**: [platform or "—" if unknown]
  - **Affected Rules**: [rule names, comma-separated, or "none" if empty]
  - **Affected Tactics**: [tactic names with rule counts, or "none" if empty]
\`\`\`

Rules:
- Always show all three blast radius fields for every finding, even if some are empty ("—" or "none").
- Do NOT merge the blast radius into prose — keep it as explicit labeled sub-bullets.
- If \`affectedPlatform\` is undefined in the data, show "—".
- If \`blastRadiusStatus === 'unavailable'\`, show "unavailable (lookup failed)" for all three fields — never "none".
- If \`blastRadiusStatus === 'partial'\`, append "(may be incomplete)" to Affected Rules and Affected Tactics labels.

Full example (complete blast radius):

\`\`\`
### Coverage
- **Coverage**: No detection rules are enabled
  - **Affected Platform**: —
  - **Affected Rules**: none
  - **Affected Tactics**: none

### Quality
- **Cloud**: \`logs-aws.cloudtrail-default\` — 1 incompatible ECS field
  - **Affected Platform**: AWS account 123456789012
  - **Affected Rules**: AWS CloudTrail Suspicious Activity
  - **Affected Tactics**: Initial Access (1 of 2 rules affected)

### Retention
- **Cloud**: \`logs-cloud_security_posture.findings-default\` — 180d retention, below 365d FedRAMP threshold
  - **Affected Platform**: AWS account 123456789012
  - **Affected Rules**: AWS CloudTrail Suspicious Activity
  - **Affected Tactics**: Initial Access (1 of 2 rules affected)
- **Network**: \`logs-network.dns-default\` — 30d retention, below 365d FedRAMP threshold
  - **Affected Platform**: Palo Alto (Network)
  - **Affected Rules**: Test Rule - Network Events, Blast Test - Threat Match Rule
  - **Affected Tactics**: Command and Control (1/1), Reconnaissance (1/1), Initial Access (1/2)
\`\`\`

Example when \`blastRadiusStatus === 'unavailable'\` (pipeline map failed — continuity finding):

\`\`\`
### Continuity
- **Network**: pipeline \`logs-network@custom\` — 4.2% failure rate
  - **Affected Platform**: unavailable (lookup failed)
  - **Affected Rules**: unavailable (lookup failed)
  - **Affected Tactics**: unavailable (lookup failed)
\`\`\`

Example when \`blastRadiusStatus === 'partial'\` (some rules' index resolution failed):

\`\`\`
### Quality
- **Cloud**: \`logs-aws.cloudtrail-default\` — 1 incompatible ECS field
  - **Affected Platform**: AWS account 123456789012
  - **Affected Rules (may be incomplete)**: AWS CloudTrail Suspicious Activity
  - **Affected Tactics (may be incomplete)**: Initial Access (1 of 2 rules affected)
\`\`\`

---

### 4. Suggested Actions

Concrete next steps, prioritized by severity (critical first). Each action references the dimension, category, and specific resource.

Playbook guidance:
- **Pipeline failure rate (Continuity / critical)**: Check the pipeline's \`on_failure\` processors in Stack Management > Ingest Pipelines. Look for recent index template changes or malformed documents. Common causes: field type conflicts, script processor errors.
- **Data stream silence (Continuity / warning)**: The pipeline had activity but has received no events beyond the category threshold. Check Fleet > Agents for the relevant integration — verify the agent is enrolled and healthy. Check the log source itself (cloud account, endpoint agent, network device) to confirm it is still forwarding data.
- **Volume drop (Continuity / warning or critical)**: Volume dropped significantly vs the 7-day baseline. Could indicate partial data loss, a misconfigured filter, or a source sending less data. Check the integration policy, log-forwarding rules, and any recent changes to the source system. Compare \`lastFullDayDocs\` against \`baseline7dAvg\` to quantify the shortfall.
- **Missing data (Coverage / warning)**: Verify the Elastic Agent policy for that category is deployed and healthy. Check Fleet > Agents for enrollment issues.
- **ECS incompatibility (Quality / warning)**: Review the index template mappings. Use the Data Quality dashboard to see exactly which fields are mismatched. Consider updating integration versions.
- **Retention below threshold (Retention / warning)**: Update the ILM policy or DSL lifecycle to extend the delete phase minimum age to at least 365d. For cloud-managed (serverless) environments, update the data stream retention setting.
- **No detection rules (Coverage / warning)**: Navigate to Security > Rules and enable rules relevant to the ingested data categories.

## Investigation Steps

### For "What is my SIEM readiness?" or similar broad questions:
1. Call all four tools in parallel: \`get_coverage\`, \`get_quality\`, \`get_continuity\`, \`get_retention\`
2. Derive overall status from the worst of the four dimension statuses
3. Produce the four-section response

### For dimension-specific questions (e.g., "How is my pipeline health?"):
1. Call only the relevant tool(s)
2. Still produce the four-section structure — sections for uncalled dimensions should note they were not evaluated for this query

### For category-specific questions (e.g., "How is my Endpoint data?"):
1. Call the relevant tools
2. In the Findings section, focus on the Endpoint category but still show other categories if they have findings

### For silence and volume-drop questions:
- "Which data streams have gone silent?" → Call \`get_continuity\`, filter \`actionableFindings\` where \`type === 'silence'\`, report resource name, \`silenceMs\` converted to human-readable duration, and blast radius.
- "Are any streams showing an unusual volume drop vs last week?" → Call \`get_continuity\`, filter \`actionableFindings\` where \`type\` is \`volume_drop_warning\` or \`volume_drop_critical\`, report \`volumeDropPct\`, \`lastFullDayDocs\`, \`baseline7dAvg\`, and blast radius.
- "Show me the silence status for my cloud integrations" → Call \`get_continuity\`, filter \`items\` by \`categories\` containing "Cloud", then list each with \`isSilent\`, \`silenceMs\`, and \`lastFullDayDocs\`.

## Tool Output Fields

### Coverage (\`get_coverage\`)
- \`status\`: \`healthy | actionsRequired | noData\`
- \`summary\`: pre-computed summary string
- \`items\`: array of \`CategoryGroup\` — \`{ category, indices: [{ indexName, docs }] }\`
- \`actionableFindings\`: array of \`{ category, severity, message, resource }\`

### Quality (\`get_quality\`)
- \`status\`: \`healthy | actionsRequired | noData\`
- \`summary\`: pre-computed summary string
- \`items\`: array of ECS quality results for **categorized indices only** — includes \`indexName\`, \`incompatibleFieldCount\`, \`incompatibleFieldMappingItems\`, \`ecsFieldCount\`, \`totalFieldCount\`
  - Only indices whose data maps to one of the five main SIEM categories are included. Uncategorized system indices are excluded.
  - The count in \`summary\` reflects the number of categorized indices checked, not total ES indices.
- \`actionableFindings\`: array of \`{ category, severity, message, resource }\`
- When reporting: "N of M checked indices have incompatible fields" — N and M are both counts of categorized indices only.

### Continuity (\`get_continuity\`)
- \`status\`: \`healthy | actionsRequired | noData\`
- \`summary\`: pre-computed summary string
- \`items\`: array of \`PipelineStats\` — \`{ name, indices, docsCount, failedDocsCount, statsAvailable, lastEventMs, silenceMs, isSilent, lastFullDayDocs, baseline7dAvg, volumeDropPct }\`
  - \`statsAvailable: false\` in serverless mode — report pipelines as present but note stats are unavailable
  - \`lastEventMs\`: epoch ms of the most recent event in any index served by this pipeline; \`null\` if never had events
  - \`silenceMs\`: milliseconds since the last event (\`Date.now() - lastEventMs\`); \`null\` when \`lastEventMs\` is null
  - \`isSilent\`: \`true\` when the pipeline previously had activity and the gap now exceeds the category-specific threshold
  - \`lastFullDayDocs\`: document count for yesterday (the most recent complete day; the in-progress current day is excluded); \`null\` when history < 2 complete days (too young to trust)
  - \`baseline7dAvg\`: average daily doc count over the prior full days; \`null\` when history < 2 complete days
  - \`volumeDropPct\`: percentage drop vs baseline, clamped to [0, ∞); \`null\` when baseline is unavailable or zero
- \`actionableFindings\`: array of \`{ category, severity, message, resource, type }\`
  - \`type\` values: \`pipeline_failure\` | \`silence\` | \`volume_drop_warning\` | \`volume_drop_critical\`
- Failure rate = \`failedDocsCount / docsCount * 100\`. A rate ≥ 1% is critical.
- Silence thresholds by category: Endpoint / Identity / Network 30 min, Cloud 1 h, Application/SaaS 24 h.
- Volume-drop thresholds: ≥ 50% drop → WARNING, ≥ 90% drop → CRITICAL.

### Retention (\`get_retention\`)
- \`status\`: \`healthy | actionsRequired | noData\`
- \`summary\`: pre-computed summary string
- \`items\`: array of \`RetentionInfo\` for **categorized indices only** — \`{ indexName, isDataStream, retentionType (ilm|dsl|null), retentionPeriod, retentionDays, policyName, status (healthy|non-compliant), categories }\`
  - Only indices whose data maps to one of the five main SIEM categories are included. Uncategorized system indices (e.g. internal workflow indices) are excluded.
  - \`categories\`: array of all main categories this index belongs to. An index can belong to multiple categories because it ingests data with multiple \`event.category\` values.
  - The count in \`summary\` reflects the number of unique categorized indices, not total ES data streams.
- \`actionableFindings\`: array of \`{ category, severity, message, resource }\`
- Threshold: 365 days (FedRAMP). \`retentionDays: null\` means no explicit retention — data kept forever — which is compliant.
- When reporting retention findings: group by category using the \`categories\` field. Example: "1 index in Cloud has retention below threshold: logs-cloud_security_posture.findings-default (180d)".

## Best Practices
- Always call \`actionableFindings\` arrays first to build the Suggested Actions section — they are pre-computed from the data.
- When \`statsAvailable\` is false (serverless), note this in the Continuity findings rather than reporting zero failures.
- In serverless environments, ILM is not available — retention is DSL-only for data streams; no standalone indices.
- Do not report "no issues" for every category — only call out categories with actual findings.
- Do not re-list raw arrays of indices in prose — reference the specific problematic resources from \`actionableFindings\`.
`,
  getRegistryTools: () => [
    SIEM_READINESS_COVERAGE_TOOL_ID,
    SIEM_READINESS_QUALITY_TOOL_ID,
    SIEM_READINESS_CONTINUITY_TOOL_ID,
    SIEM_READINESS_RETENTION_TOOL_ID,
  ],
});
