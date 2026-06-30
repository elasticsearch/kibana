/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import {
  SECURITY_CREATE_DETECTION_RULE_TOOL_ID,
  SECURITY_LABS_SEARCH_TOOL_ID,
  SECURITY_RUN_RULE_PREVIEW_TOOL_ID,
} from '../../tools';

export const getDetectionRuleEditSkill = ({
  rulePreviewEnabled,
}: {
  rulePreviewEnabled: boolean;
}) =>
  defineSkillType({
    id: 'detection-rule-edit',
    name: 'detection-rule-edit',
    basePath: 'skills/security/rules',
    description:
      'Guide to creating and editing security detection rules via the rule attachment. Use when a user asks to create, edit, modify, or update a detection rule or its fields (tags, severity, MITRE ATT&CK, schedule, query, etc.).',
    content: buildSkillContent({ rulePreviewEnabled }),
    getRegistryTools: () => [
      SECURITY_CREATE_DETECTION_RULE_TOOL_ID,
      SECURITY_LABS_SEARCH_TOOL_ID,
      platformCoreTools.generateEsql,
      platformCoreTools.productDocumentation,
      ...(rulePreviewEnabled ? [SECURITY_RUN_RULE_PREVIEW_TOOL_ID] : []),
    ],
  });

const buildSkillContent = ({
  rulePreviewEnabled,
}: {
  rulePreviewEnabled: boolean;
}) => `# Detection Rule Creation and Editing

## When to Use This Skill

Use this skill when the user asks to:
- Create a detection rule (e.g., "create a rule that detects ...", "build a SIEM rule for ...", "create a security detection rule to find ...", "create a security detection rule that ...")
- Edit an existing rule's fields (e.g., "change the severity to high", "update the query", "set the interval to 10m", "add tags to the rule")
- Modify rule logic or metadata (e.g., "add MITRE ATT&CK mappings", "change the index patterns", "update the description", "add new terms to the query")

This covers the rule type ES|QL. Do not create a rule with a rule type other than ES|QL. Only create ES|QL rules.

## ⚠️ IMPORTANT: "The Rule" Always Means the Rule Attachment

**You MUST apply changes directly to the attachment.** Do NOT just describe or suggest what fields to change in your response text. Every edit request requires you to actually call the tools (\`attachment_update\` or \`security.create_detection_rule\`) to persist the change in the attachment. Describing the change without applying it is not acceptable.

## Core Workflow

### Step 1: Always Read the Attachment First

Before accessing or modifying any rule data, you MUST call \`attachment_read\` on the rule attachment to get the current state. Never assume attachment contents.

### Step 2: Research Before Creating or Editing

Before creating or editing a rule, use the available research tools to ensure accuracy:
- Use \`security_labs_search\` to find relevant threat intelligence, detection strategies, and rule examples from Elastic Security Labs.
- Use \`product_documentation\` to look up correct field formats, query syntax, or rule type requirements.

This is especially important when:
- Creating a new rule from scratch (search for similar detections or threat context).
- Editing queries or detection logic (verify correct syntax for the rule's language: ES|QL, EQL, KQL, Lucene).
- Adding MITRE ATT&CK mappings (confirm correct tactic/technique IDs and names).
- Working with unfamiliar rule types or fields.

### Step 3: Create or Modify the Rule

If you are creating a new rule, use the following:
- **Creating a new rule**: ALWAYS use the \`security.create_detection_rule\` tool. Pass a natural language description of the detection rule to create. The tool handles rule creation AND attachment update automatically. Do NOT call \`attachment_update\`.
- after calling the \`security.create_detection_rule\` tool, move to step 4.
- render the latest version of the attachment inline.


When asked to edit or update the rule or any field of the rule, use the following:
**Editing an existing rule** (changing fields like tags, severity, description, schedule, MITRE ATT&CK, index patterns, query, etc.):

When the user says "add to the rule", "edit the rule", "change the rule", "update the rule", or any variation — they ALWAYS mean the **rule attachment**. The rule lives inside the attachment's \`text\` field as stringified JSON. There is no other rule object.

Follow these steps exactly. Every step is MANDATORY:

1. **Read the latest attachment** — call \`attachment_read\` to get the current version. NEVER skip this, even if you read it before. Always get the latest state.
2. **Parse** the \`text\` field (stringified JSON of the rule).
3. **Modify** only the fields the user asked to change. Do not add or remove other fields.
4. **Re-stringify the ENTIRE rule object** — never send partial updates.
5. **Call \`attachment_update\`** to persist the change:
\`\`\`
attachment_update({ attachment_id: "ATTACHMENT_ID", data: { text: "<full stringified rule JSON>" } })
\`\`\`
- Render the latest version of the attachment inline.
${
  rulePreviewEnabled
    ? `
### Step 4: Preview the Rule

After creating a new rule or modifying its query or schedule, run \`security.run_rule_preview\` to validate it fires as expected before saving.

- Pass the current rule object from the attachment as the \`rule\` argument.
- Defaults to the last hour (\`timeframeStart: "now-1h"\`). Override with a wider range (e.g. \`"now-24h"\`) if no alerts appear and the rule logic looks correct.
- The tool stores results as a rule preview attachment. Render it inline after the call so the user can inspect the alerts.
- If the preview returns zero alerts, check the query against the available indices with \`generate_esql\` before concluding the rule is correct.
`
    : ''
}

Checklist before finishing the answer:
- [ ] Did I call the tool read attachment first?
- [ ] Did I render inline the latest version of the attachment? ← YOU MUST DO THIS, always render the latest version of the attachment inline.${
  rulePreviewEnabled
    ? `
- [ ] Did I run \`security.run_rule_preview\` after creating or modifying the rule query or schedule?`
    : ''
}

---

## Field Reference

Use the following fields to update the rule, modify or add only fields that explicitly mentioned. Do not add or modify fields that are not explicitly mentioned.

### Name and Description

\`name\` (string, required): Short descriptive name of the rule.
\`description\` (string, required): Detailed explanation of what the rule detects.

**Example** — changing the name and description:
\`\`\`json
{
  "name": "Suspicious PowerShell Execution",
  "description": "Detects unusual PowerShell commands that may indicate malicious activity",
  ...rest of rule fields
}
\`\`\`

### Tags

\`tags\` (string array): Labels for organizing and filtering rules.

**Example** — setting tags to ["Network", "Threat Detection", "T1059"]:
1. Read attachment → parse JSON.
2. Set \`tags\`: \`["Network", "Threat Detection", "T1059"]\`
3. Stringify full rule and call \`attachment_update\`.

Before:
\`\`\`json
{ "name": "My Rule", "tags": ["Old Tag"], "severity": "high", ... }
\`\`\`

After:
\`\`\`json
{ "name": "My Rule", "tags": ["Network", "Threat Detection", "T1059"], "severity": "high", ... }
\`\`\`

### Severity and Risk Score

\`severity\` (string): One of \`"low"\`, \`"medium"\`, \`"high"\`, \`"critical"\`.
\`risk_score\` (number, 0-100): Numerical risk score.

Common mappings:
- low → 21
- medium → 47
- high → 73
- critical → 99

**Example** — changing severity to critical:
\`\`\`json
{ "severity": "critical", "risk_score": 99, ... }
\`\`\`

### MITRE ATT&CK (threat field)

\`threat\` (array): MITRE ATT&CK framework mappings. Each entry has a tactic and optional techniques/subtechniques.

**Structure**:
\`\`\`json
{
  "threat": [
    {
      "framework": "MITRE ATT&CK",
      "tactic": {
        "id": "TA0001",
        "name": "Initial Access",
        "reference": "https://attack.mitre.org/tactics/TA0001"
      },
      "technique": [
        {
          "id": "T1566",
          "name": "Phishing",
          "reference": "https://attack.mitre.org/techniques/T1566",
          "subtechnique": [
            {
              "id": "T1566.001",
              "name": "Spearphishing Attachment",
              "reference": "https://attack.mitre.org/techniques/T1566/001"
            }
          ]
        }
      ]
    }
  ]
}
\`\`\`

**Example** — adding a second tactic (Execution) to existing threat mappings:
1. Read attachment, parse JSON.
2. Append to the \`threat\` array:
\`\`\`json
{
  "framework": "MITRE ATT&CK",
  "tactic": {
    "id": "TA0002",
    "name": "Execution",
    "reference": "https://attack.mitre.org/tactics/TA0002"
  },
  "technique": [
    {
      "id": "T1059",
      "name": "Command and Scripting Interpreter",
      "reference": "https://attack.mitre.org/techniques/T1059",
      "subtechnique": [
        {
          "id": "T1059.001",
          "name": "PowerShell",
          "reference": "https://attack.mitre.org/techniques/T1059/001"
        }
      ]
    }
  ]
}
\`\`\`
3. Stringify full rule and call \`attachment_update\`.

**Common tactic IDs**:
- TA0001 Initial Access
- TA0002 Execution
- TA0003 Persistence
- TA0004 Privilege Escalation
- TA0005 Defense Evasion
- TA0006 Credential Access
- TA0007 Discovery
- TA0008 Lateral Movement
- TA0009 Collection
- TA0010 Exfiltration
- TA0011 Command and Control
- TA0040 Impact

### Schedule (interval and from)

\`interval\` (string): How often the rule runs. Format: \`"Nm"\` (minutes), \`"Nh"\` (hours), \`"Ns"\` (seconds).
\`from\` (string): Lookback window using date math. Format: \`"now-<duration>"\`. Defaults to \`"now-6m"\`.

The lookback should be at least as long as the interval. A common pattern is interval + a small buffer.

**Example** — run every 5 minutes with 6 minute lookback:
\`\`\`json
{ "interval": "5m", "from": "now-6m", ... }
\`\`\`

**Example** — run every 1 hour with 65 minute lookback:
\`\`\`json
{ "interval": "1h", "from": "now-65m", ... }
\`\`\`

**Example** — run every 24 hours:
\`\`\`json
{ "interval": "24h", "from": "now-25h", ... }
\`\`\`

### Query, Language, and Type

\`query\` (string): The detection query.
\`language\` (string): Query language.
\`type\` (string): Rule type.

Always set \`type\` and \`language\` together. Supported languages per rule type:

\`\`\`
esql           → language: "esql"
eql            → language: "eql"
query          → language: "kuery" | "lucene"
saved_query    → language: "kuery" | "lucene"
threshold      → language: "kuery" | "lucene"
threat_match   → language: "kuery" | "lucene"
new_terms      → language: "kuery" | "lucene"
machine_learning → no query or language fields
\`\`\`

**Example** — KQL query rule:
\`\`\`json
{
  "type": "query",
  "language": "kuery",
  "query": "process.name: powershell.exe and event.action: start",
  "index": ["logs-*", "winlogbeat-*"],
  ...
}
\`\`\`

### Index Patterns

\`index\` (string array): Elasticsearch index patterns to search. Not used for ES|QL rules.

**Example**:
\`\`\`json
{ "index": ["logs-endpoint.events.*", "winlogbeat-*", "filebeat-*"], ... }
\`\`\`

### Enabled

\`enabled\` (boolean): Whether the rule is active. Default: \`true\`.

---

## Complete Example: Updating Tags Step by Step

User says: "Add the tags Network and Lateral Movement to the rule"

1. Call \`attachment_read\` with the rule attachment ID.
2. The attachment \`text\` field contains:
   \`\`\`
   {"name":"DNS Tunneling Detection","type":"esql","tags":["DNS"],"severity":"high","risk_score":73,...}
   \`\`\`
3. Parse the JSON. Current tags: \`["DNS"]\`.
4. Add the requested tags: \`["DNS", "Network", "Lateral Movement"]\`.
5. Re-stringify the full rule object.
6. Call \`attachment_update\`:
   \`\`\`
   attachment_update({ attachment_id: "ATTACHMENT_ID", data: { text: "{\\"name\\":\\"DNS Tunneling Detection\\",\\"type\\":\\"esql\\",\\"tags\\":[\\"DNS\\",\\"Network\\",\\"Lateral Movement\\"],\\"severity\\":\\"high\\",\\"risk_score\\":73,...}" } })
   \`\`\`
7. Render: \`<render_attachment id="ATTACHMENT_ID" version="VERSION" />\`

## CRITICAL INSTRUCTIONS — READ CAREFULLY

1. "The rule" ALWAYS refers to the rule attachment. Any request to add, edit, change, or update the rule means modifying the attachment.
2. NEVER just suggest or describe changes — ALWAYS apply them by calling \`attachment_update\` or \`security.create_detection_rule\`. The user expects the rule to be updated, not a description of what to update.
3. ALWAYS read the attachment before modifying it.
4. ALWAYS re-stringify the FULL rule object — never send partial updates.
5. **ALWAYS render the attachment inline after EVERY modification** — this is the most important rule. Every single call to \`security.create_detection_rule\` or \`attachment_update\` MUST be followed by \`<render_attachment id="ATTACHMENT_ID" version="VERSION" />\` using the version from the tool result. NEVER omit this. The user cannot see changes without it.
6. ALWAYS use \`security.create_detection_rule\` when creating a new rule.
7. Use \`attachment_update\` for editing existing rules (field-level changes like tags, severity, schedule, etc.).
`;
