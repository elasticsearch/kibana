/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { SECURITY_CREATE_DETECTION_RULE_TOOL_ID, SECURITY_LABS_SEARCH_TOOL_ID } from '../../tools';

export const getDetectionRuleEditSkill = () =>
  defineSkillType({
    id: 'detection-rule-edit',
    name: 'detection-rule-edit',
    basePath: 'skills/security/rules',
    description:
      'Creates and edits ES|QL security detection rules as persistent rule attachments, including query logic, MITRE ATT&CK mappings, severity, and schedule. Use when the user wants to author or modify a detection rule explicitly ("create a rule that...", "update the severity", "add MITRE mappings") or with implied authoring intent ("how would I detect this?", "can we catch lateral movement?", "I want an alert for privilege escalation"). Not for alert triage or investigation (use alert analysis skill), proactive threat hunting without a rule-creation goal (use threat hunting skill), or general security questions with no authoring intent.',
    content: SKILL_CONTENT,
    getRegistryTools: () => [
      SECURITY_CREATE_DETECTION_RULE_TOOL_ID,
      SECURITY_LABS_SEARCH_TOOL_ID,
      platformCoreTools.generateEsql,
      platformCoreTools.productDocumentation,
    ],
  });

const SKILL_CONTENT = `# Detection Rule Creation and Editing

## When to Use This Skill

Use this skill when the user asks to:
- Create a detection rule (e.g., "create a rule that detects ...", "build a SIEM rule for ...", "create a security detection rule to find ...", "create a security detection rule that ...")
- Edit an existing rule's fields (e.g., "change the severity to high", "update the query", "set the interval to 10m", "add tags to the rule")
- Modify rule logic or metadata (e.g., "add MITRE ATT&CK mappings", "update the description", "update the query")

Do NOT use this skill when the user:
- Asks about alerts or alert triage (use the alert analysis skill instead)
- Asks about threat hunting without any intent to create or edit a rule
- Asks a general security question that doesn't imply building or changing a detection (e.g., "what is lateral movement?", "explain MITRE ATT&CK")
- Asks to enable, disable, or delete an existing rule (no tool support for this yet)

This skill only supports the **ES|QL** rule type. If the user asks to create a rule with any other rule type (e.g., KQL, EQL, threshold, new terms, machine learning, indicator match, etc.), do NOT attempt to create it. Do NOT automatically offer or proceed to create an ES|QL alternative. Instead, stop and clearly tell the user:

> "This skill only supports creating **ES|QL** detection rules. [Requested type] rules are not supported here."

Then stop. Do not create anything. Do not offer alternatives unless the user explicitly asks.

## ⚠️ IMPORTANT: "The Rule" Always Means the Rule Attachment

**You MUST apply changes directly to the attachment.** Do NOT just describe or suggest what fields to change in your response text. Every create or edit request requires you to actually call the tools (\`security.create_detection_rule\` for creation and query rewrites, \`attachment_update\` for other field edits) to persist the result. Describing the change without applying it is not acceptable.

## Core Workflow

### Pre-check: ensure you have what you need

Before entering either branch, determine intent and resolve prerequisites:

1. **User wants to create a brand-new rule** (either no rule attachment exists yet, OR the user explicitly wants a **separate, additional** rule) → proceed to Step 2 then Step 3 (creation path). No \`attachment_id\` needed.
2. **User wants to modify, update, change, or refine an existing rule already in context** → proceed to the edit branch (Step 1 → Step 2 → Step 3, edit path). This applies even when the user's message describes a query change, a threshold, or a count condition — if the user's intent is to adjust the rule already shown in the conversation, use the edit path and provide \`attachment_id\`.
3. **User wants to edit an existing rule but no attachment is in context** → call \`attachment_list\` to check whether a rule attachment exists in the session but wasn't yet referenced.
   - If one is found → proceed to the edit branch.
   - If nothing is found → call \`security.find_rules\` with \`nameContains\` to search for rules matching the user's description. Present any matches to the user and ask them to confirm which rule they mean. Once confirmed, load it as an attachment and proceed to the edit branch.
   - If no matching rules are found → tell the user no matching rule was found and ask them to clarify the rule name or open it manually.

### Step 1: Read the Attachment (edit path only)

Find the attachment id by looking at your most recent \`<render_attachment id="...">\` tag in the conversation — that exact string is the id. Do NOT invent an id or derive one from the rule name. Call \`attachment_read\` with that id to get the current state before modifying anything.

### Step 2: Research Before Creating or Editing

Before creating or editing a rule, use the available research tools to ensure accuracy:
- Use \`security_labs_search\` to find relevant threat intelligence, detection strategies, and rule examples from Elastic Security Labs.
- Use \`product_documentation\` to look up correct field formats, query syntax, or rule type requirements.

This is especially important when:
- Creating a new rule from scratch (search for similar detections or threat context).
- Editing queries or detection logic (verify correct ES|QL syntax).
- Adding MITRE ATT&CK mappings (confirm correct tactic/technique IDs and names).

### Step 3: Create or Modify the Rule

#### Creation path (no attachment in context)

> **⚠️ Only follow this path for a genuinely new, separate rule.** If the user's message is about adjusting, refining, or updating a rule already shown in the conversation — even phrased as "make it detect only when..." or "update it to alert when..." — use the **edit path** above and include \`attachment_id\`. The creation path is only for when the user explicitly wants a distinct new rule, not a refinement of the one already in context.

Before calling \`security.create_detection_rule\`, apply the clarification gate:

**Clarification gate**: Check whether the request is specific enough. A request is specific enough if it includes at least one of:
- A concrete behavior or indicator (e.g., "PowerShell spawning cmd.exe", "failed logins from unusual countries")
- A data source or index hint (e.g., "Windows event logs", "authentication data")
- A frequency or count condition (e.g., "more than 10 failures in 5 minutes")

If none of the above is present, ask the user one focused question — the single most important missing piece — before generating the rule. Do not ask multiple questions at once.

Once the request is specific enough, ALWAYS use the \`security.create_detection_rule\` tool. Pass a natural language description of the detection rule (\`user_query\` only — no \`attachment_id\`). The tool handles rule creation AND attachment creation automatically. Do NOT call \`attachment_update\`.

After the tool returns, render the attachment inline.

---

#### Edit path

When the user says "add to the rule", "edit the rule", "change the rule", "update the rule", or any variation — they ALWAYS mean the **rule attachment**. The rule lives inside the attachment's \`text\` field as stringified JSON. There is no other rule object.

**Choose the correct edit path:**

| User request | Tool | Notes |
|---|---|---|
| Rewrite or change the **ES\|QL query** / detection logic | \`security.create_detection_rule\` | Requires \`attachment_id\` — see below |
| Change severity, tags, schedule, name, description, MITRE, enabled, etc. | \`attachment_update\` | Hand-edit JSON — see below |

##### Rewriting the query (ES|QL)

Do **NOT** use \`attachment_update\` to change the \`query\` field. ES|QL must be regenerated through the detection rule graph.

1. **Read the latest attachment** — call \`attachment_read\`. NEVER skip this.
2. **Call \`security.create_detection_rule\`** with two parameters:
\`\`\`
security.create_detection_rule({
  user_query: "<natural language description of the query change>",
  attachment_id: "<attachment id from step 1>"
})
\`\`\`
- Always provide \`attachment_id\` when rewriting a query so the tool reads the current rule state and updates the attachment in place, preserving non-query fields (severity, tags, schedule, etc.).
3. Render: \`<render_attachment id="ATTACHMENT_ID" version="VERSION" />\` using the version from the tool result.

##### Editing other fields (not query)

For changes to tags, severity, risk_score, schedule, name, description, MITRE mappings, enabled, etc.:

1. **Parse** the \`text\` field from the attachment (stringified JSON of the rule).
2. **Modify** only the fields the user asked to change. Do not add or remove other fields.
3. **Re-stringify the ENTIRE rule object** — never send partial updates.
4. **Call \`attachment_update\`** to persist the change. Always include \`attachmentLabel\` (the rule \`name\`) and \`description\` so the chat label stays visible. The card's link to its saved rule is tracked separately (on the attachment, not in \`text\`) and persists automatically — you do not need to carry it through.
\`\`\`
attachment_update({
  attachment_id: "ATTACHMENT_ID",
  description: "Suspicious PowerShell Execution",
  data: {
    text: "<full stringified rule JSON>",
    attachmentLabel: "Suspicious PowerShell Execution"
  }
})
\`\`\`
5. Render: \`<render_attachment id="ATTACHMENT_ID" version="VERSION" />\`

Checklist before finishing the answer:
- [ ] (Edit path only) Did I call \`attachment_list\` (if no attachment was in context) and then \`attachment_read\` before modifying?
- [ ] Did I use the correct tool (query rewrite → \`security.create_detection_rule\`; other fields → \`attachment_update\`)?
- [ ] Did I render inline the latest version of the attachment?

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

\`query\` (string): The ES|QL detection query.
\`language\` (string): Always \`"esql"\`.
\`type\` (string): Always \`"esql"\`.

**To change the query**, use \`security.create_detection_rule\` with \`attachment_id\` — do NOT hand-edit \`query\` via \`attachment_update\`.

### Identity fields — never set these

Do **NOT** include \`id\` or \`rule_id\` in the rule JSON you store via \`attachment_update\`. Both fields are server-assigned or saved-object identifiers; including them in a generated or draft rule will cause them to be confused with the attachment's own id and break save/update flows.

### Enabled

\`enabled\` (boolean): Whether the rule is active. Default: \`true\`.

---

## Complete Example: Updating Tags Step by Step

_This example assumes the edit path — a rule attachment is already in context._

User says: "Add the tags Network and Lateral Movement to the rule"

Pre-check: user wants to modify existing rule → edit path → proceed to Step 1.

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

## Complete Example: Rewriting the Query Step by Step

_This example assumes the edit path — a rule attachment is already in context._

User says: "Update the query to also filter on process.name"

Pre-check: user wants to modify existing rule → edit path → proceed to Step 1.

1. Call \`attachment_read\` with the rule attachment ID.
2. Call \`security.create_detection_rule\`:
   \`\`\`
   security.create_detection_rule({
     user_query: "Update the ES|QL query to also filter on process.name",
     attachment_id: "ATTACHMENT_ID"
   })
   \`\`\`
   The tool reads the current rule from the attachment and rewrites only the query, preserving all other fields.
3. Render: \`<render_attachment id="ATTACHMENT_ID" version="VERSION" />\` using the version from the tool result.

## CRITICAL INSTRUCTIONS — READ CAREFULLY

1. "The rule" ALWAYS refers to the rule attachment. Any request to add, edit, change, or update the rule means modifying the attachment — unless no attachment exists and none can be found via \`attachment_list\`, in which case tell the user to open the rule first.
2. NEVER just suggest or describe changes — ALWAYS apply them by calling \`attachment_update\` or \`security.create_detection_rule\`. The user expects the rule to be updated, not a description of what to update.
3. ALWAYS read the attachment before modifying it (edit path only — skip for fresh creation).
4. For \`attachment_update\` edits, ALWAYS re-stringify the FULL rule object — never send partial updates. On the creation path, pass natural language to \`security.create_detection_rule\`, not JSON.
5. **ALWAYS render the attachment inline after EVERY modification** — this is the most important rule. Every single call to \`security.create_detection_rule\` or \`attachment_update\` MUST be followed by \`<render_attachment id="ATTACHMENT_ID" version="VERSION" />\` using the version from the tool result. NEVER omit this. The user cannot see changes without it.
6. When creating a **fresh, separate** rule: use \`security.create_detection_rule\` with \`user_query\` only — do NOT include \`attachment_id\`. When **rewriting the query** of an existing rule — including follow-up refinements to a rule you created earlier in this conversation (e.g., "update it to only alert when...", "change the threshold to...") — use \`security.create_detection_rule\` WITH \`attachment_id\` — never omit it.
7. ALWAYS use \`security.create_detection_rule\` with \`attachment_id\` when rewriting the query.
8. Use \`attachment_update\` only for non-query field edits (tags, severity, schedule, name, description, MITRE, enabled, etc.). NEVER use \`attachment_update\` to change \`query\`.
9. NEVER invent attachment ids. The correct id for any edit-path call (\`security.create_detection_rule\` with \`attachment_id\`, or \`attachment_update\`) is the one that appears in the most recent \`<render_attachment id="...">\` tag — it looks like \`ai-rule-creation\` or \`air:xxxxxxxx-...\`. Using a name you derive from the rule content (e.g. \`"rule-failed-ssh-logins"\`) will create a new orphan attachment and lose the saved-rule link.
10. NEVER include \`id\` or \`rule_id\` in a generated or draft rule — these are server-assigned identifiers. Including them pollutes the attachment and breaks save/update flows.
11. **ES|QL only**: If the user explicitly requests a non-ES|QL rule type (KQL, EQL, threshold, new terms, machine learning, indicator match, etc.), do NOT create it and do NOT automatically offer or pivot to an ES|QL alternative. Simply explain the limitation and stop.
`;
