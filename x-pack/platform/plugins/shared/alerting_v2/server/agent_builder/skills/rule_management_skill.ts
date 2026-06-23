/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { manageRuleTool } from '../tools/manage_rule';
import { manageActionPolicyTool } from '../tools/manage_action_policy';
import type { ManageActionPolicyToolDeps } from '../tools/manage_action_policy';
import { alertingTools } from '../common/constants';
import {
  generateRuleSchemaDoc,
  generateRuleOperationsDoc,
  generateActionPolicySchemaDoc,
} from './schema_to_skill_docs';

export const createRuleManagementSkill = (deps: ManageActionPolicyToolDeps) =>
  defineSkillType({
    id: 'rule-management',
    name: 'rule-management',
    basePath: 'skills/platform/alerting',
    description:
      'Compose, discover, and modify alerting V2 rules and action policies (notification policies) within a conversation.',
    referencedContent: [
      {
        name: 'concepts',
        relativePath: './references',
        content: `# Alerting V2 Concepts

## Rule Kind: Alert vs Signal

Rules declare a \`kind\` of \`alert\` or \`signal\`. This is the most important behavioral split in the system.

### Alert (\`kind: alert\`)
- **Stateful alerting** with full episode lifecycle: pending, active, recovering, inactive.
- Supports state transitions (\`pending_count\` / \`recovering_count\`), recovery detection, and notification dispatch.
- Produces \`type: 'alert'\` events that participate in the dispatcher pipeline.
- UI label: **"Alert"**.
- Use when the user wants to be **notified**, needs **lifecycle tracking**, or wants **recovery detection**.

### Signal (\`kind: signal\`)
- **Stateless detection** (observation-only).
- Produces \`type: 'signal'\` events but **skips** episode lifecycle and dispatcher processing entirely.
- No notifications, no recovery, no state transitions.
- UI label: **"Signal"**.
- Use for logging or detection without automated action.

### Immutability
\`kind\` is **immutable on persisted rules** — it can only be set at creation time. The update API rejects changes to \`kind\`. For draft (in-memory) rules, \`set_kind\` can change it freely.

---

## Episode Lifecycle

Episodes are the unit of alert state. Each unique group (by \`group_hash\`) has its own episode.

| Status | Meaning |
|---|---|
| \`pending\` | Breached but below the consecutive-breaches threshold |
| \`active\` | Met the threshold — alert is firing |
| \`recovering\` | Breach stopped but not yet fully recovered |
| \`inactive\` | Fully recovered |

Only \`kind: alert\` rules produce episodes. \`kind: signal\` rules write raw signal events with no episode tracking.

---

## Action Policies (Notification Policies)

An action policy is a **space-wide saved object** that controls how alert episodes are matched, grouped, throttled, and dispatched to workflow destinations.

Key characteristics:
- **Not embedded in a rule.** One policy can match episodes from many rules.
- **Matcher**: optional KQL query evaluated against episode context. An empty matcher is a catch-all that matches all episodes in the space.
- **Only processes \`kind: alert\` episodes.** Signal events are excluded from the dispatcher pipeline — they never reach action policy evaluation.

### Matcher Context Fields

When the dispatcher evaluates a policy's KQL matcher, these fields are available:

| Field | Description |
|---|---|
| \`episode_id\` | The episode UUID |
| \`episode_status\` | \`inactive\`, \`pending\`, \`active\`, or \`recovering\` |
| \`group_hash\` | Hash of the grouping fields |
| \`last_event_timestamp\` | Timestamp of the most recent event |
| \`rule.id\` | The rule's saved object ID |
| \`rule.name\` | The rule's display name |
| \`rule.tags\` | The rule's tags array |
| \`data.*\` | Rule-specific ES|QL output columns (e.g. \`data.host.name\`, \`data.error_count\`) |

### Grouping Modes
- \`per_episode\` (default): one notification per alert episode lifecycle.
- \`all\`: a single notification for all matching episodes.
- \`per_field\`: group by specified \`groupBy\` fields.

### Throttle Strategies
- \`on_status_change\`: notify only on episode status transitions (default for \`per_episode\`).
- \`per_status_interval\`: notify on transitions and at regular intervals.
- \`time_interval\`: notify at regular intervals regardless of status (default for \`all\`/\`per_field\`).
- \`every_time\`: notify on every evaluation cycle (high volume).

---

## Workflows

A workflow is a **concrete automation defined in YAML** that executes when dispatched by an action policy.

- Workflow steps can use Kibana **connectors** (email, Slack, PagerDuty, etc.) via the \`connector-id\` field on each step.
- Action policy destinations reference **workflow IDs**, never connector IDs directly.
- When triggered by action policies, workflows must use \`triggers: - type: manual\` (the \`alert\` trigger type is for the legacy v1 alerting connector path with a different event shape).

---

## Connectors

A connector is a **configured integration instance** (e.g., an email server, a Slack webhook) managed under **Stack Management > Connectors**.

- Referenced inside workflow YAML steps via \`connector-id\`, **not** in action policies.
- The agent **cannot create connectors**. If no suitable connector exists, direct the user to set one up in Stack Management > Connectors.

---

## Dispatch Flow

The end-to-end notification path:

1. **Rule** (\`kind: alert\`) evaluates its ES|QL query and writes alert episodes to \`.rule-events\`.
2. **Dispatcher** (runs on its own Task Manager schedule) reads episodes from \`.rule-events\`.
3. Dispatcher loads **enabled action policies** for the relevant space.
4. **Matcher evaluation**: each policy's KQL matcher is tested against each episode's context.
5. **Grouping**: matched episodes are grouped according to the policy's \`groupingMode\` / \`groupBy\`.
6. **Throttling**: groups are filtered based on the policy's throttle strategy and notification history.
7. **Dispatch**: eligible groups are sent to the policy's **workflow destinations** via \`scheduleWorkflow\`.
8. **Workflow execution**: workflow steps run, using connectors to deliver notifications (email, Slack, etc.).

Signal rules (\`kind: signal\`) are excluded at step 2 — the dispatcher query only selects \`type == 'alert'\` events.`,
      },
      {
        name: 'rule-schema',
        relativePath: './references',
        content: generateRuleSchemaDoc(),
      },
      {
        name: 'rule-operations-schema',
        relativePath: './references',
        content: generateRuleOperationsDoc(),
      },
      {
        name: 'action-policy-schema',
        relativePath: './references',
        content: generateActionPolicySchemaDoc(),
      },
    ],
    content: `## Domain Knowledge

For questions about alerting concepts — rule kinds (alert vs signal), action policies, workflows, connectors, episode lifecycle, or the dispatch flow — consult the [concepts reference](./references/concepts.md).

---

## When to Use This Skill

Use this skill when:
- A user asks to find, list, inspect, or modify existing alerting V2 rules.
- A user asks to create a new alerting rule from natural language requirements.
- A user asks to change a rule's query, schedule, thresholds, or metadata.
- A user asks to find, list, inspect, or modify action policies (also called notification policies).
- A user asks to create or configure a new action policy with workflow destinations, matchers, grouping, or throttling.

Do **not** use this skill for:
- Classic (V1) Kibana stack rules or Security detection rules.
- Action connector configuration (connectors are managed separately).
- Querying or analyzing data — use data exploration skills for that.

---

# Part 1: Rules

## Rule Discovery

When a user asks about existing rules:
- Search with \`platform.core.sml_search\`, using keywords from the user's request.
- For a broad listing, use \`keywords: ["*"]\`.
- Summarize matches in plain language: name, kind, schedule, and query snippet.
- Do **not** attach rules by default when only listing or comparing.
- To inspect or edit a saved rule, attach it with \`platform.core.sml_attach\` using the \`chunk_id\` from the search result.
- After attaching, use the returned \`attachment_id\` for subsequent ${alertingTools.manageRule} calls.

## Composing and Modifying Rules

Build the request for ${alertingTools.manageRule} as an ordered \`operations\` array. Operations run in sequence.

For a new rule, start with \`set_metadata\` (name required), then \`set_kind\`, \`set_schedule\`, and \`set_query\`.

For an existing rule, pass the \`ruleAttachmentId\` and only include the operations needed for the changes requested.

## ES|QL Query Guidance

- Every \`set_query\` call **must** include \`format: "composed"\` or \`format: "standalone"\`. Omitting \`format\` will fail validation.
  - **Composed** shares a \`base\` query with appendable \`breach.segment\` and optional \`recovery.segment\`:
    \`{ format: "composed", base: "FROM metrics-* | STATS avg_cpu = AVG(cpu) BY host.name", breach: { segment: "WHERE avg_cpu > 0.9" } }\`
  - **Standalone** uses independent full queries:
    \`{ format: "standalone", breach: { query: "FROM metrics-* | STATS avg_cpu = AVG(cpu) BY host.name | WHERE avg_cpu > 0.9" } }\`
- The base query must be a valid ES|QL statement.
- Do **not** include time range filters in the query — the lookback window is applied automatically.
- The query must return rows for an alert to fire. Use \`| WHERE ...\` to filter for breach conditions.
- Prefer \`FROM <index-pattern> | STATS ... BY <group-field> | WHERE <condition>\` for threshold-based alerting.
- **Never** use backtick quoting around index names or field names in ES|QL. Standard index patterns (letters, digits, dashes, dots, underscores, wildcards, and colons for CCS) do not require backticks. Backticks break cross-cluster search and are almost never needed in practice. Write \`FROM remote_cluster:metrics-system.cpu-default\`, not \`FROM \\\`remote_cluster:metrics-system.cpu-default\\\`\`.
- The \`set_schedule\` lookback should be >= the execution interval (\`every\`).
- The \`set_query\` operation validates the query against Elasticsearch automatically.
  If the query references an unknown index or field, the tool will return an error
  with the Elasticsearch error message. Inspect the error, fix the query, and retry.
- If grouping fields are set after a query, they are validated against the query's
  output columns. Use fields that appear in the query results.

## State Transition

Use \`set_state_transition\` to delay alert firing until the threshold is breached N times in a row. This reduces noise from transient spikes.

- \`pending_count: N\` — breaches required before transitioning from pending to active (e.g. \`pending_count: 3\` means 3 consecutive breach cycles).
- \`pending_timeframe\` — optional time window for the pending evaluation (e.g. \`"15m"\`).
- \`recovering_count: N\` — non-breach cycles required before transitioning from recovering to inactive.
- \`recovering_timeframe\` — optional time window for the recovering evaluation.

State transition is only allowed on \`kind: alert\` rules. Refer to the [rule-operations-schema reference](./references/rule-operations-schema.md) for the full field schema.

## Recovery Strategy

\`recovery_strategy\` is a **top-level rule field** (not inside the query). It controls how episodes transition from active to recovering/inactive. Signal rules (\`kind: signal\`) cannot set \`recovery_strategy\`.

When using \`recovery_strategy: 'query'\`, add a \`set_query\` operation that includes a \`recovery\` block alongside \`breach\`:
- **Composed**: \`recovery: { segment: 'WHERE cpu < 0.5' }\`
- **Standalone**: \`recovery: { query: 'FROM metrics-* | WHERE cpu < 0.5' }\`

Refer to the [rule-schema reference](./references/rule-schema.md) for allowed values and constraints.

## No-Data Strategy

\`no_data_strategy\` is a **top-level rule field** that controls behaviour when no data is present. Only meaningful for standalone queries with a \`no_data\` block.

When setting \`no_data_strategy\` to anything other than \`'none'\`, add a \`no_data\` block to the standalone query:
\`no_data: { query: 'FROM heartbeat-* | STATS count = COUNT(*) BY host.name | WHERE count >= 1' }\`

Signal rules cannot set \`no_data_strategy\`. Composed queries do not support \`no_data\`.
Refer to the [rule-schema reference](./references/rule-schema.md) for allowed values and constraints.

## Final Validation

Always include \`{ operation: "validate" }\` as the **last operation** in the final ${alertingTools.manageRule} call after all fields are set. This validates the accumulated rule against the API request schema and throws if the rule is not ready to save (missing required fields, invalid values, etc.). If validation fails, read the error issues, fix them with corrective operations, and retry with \`validate\` again.

## Rendering Attachments

After calling ${alertingTools.manageRule}, **always** render the rule attachment inline in your response using the \`<render_attachment>\` tag with the attachment ID and version from the tool result:

\`\`\`
<render_attachment id="<ruleAttachment.id>" version="<version>" />
\`\`\`

This displays the interactive rule card with Preview and Create/Update buttons.

## Persistence

The ${alertingTools.manageRule} tool only manages the **in-memory attachment** — it never writes to Elasticsearch.
Always direct the user to the rendered attachment's action buttons for persistence:
- **Create rule** — create a new V2 rule from the in-memory attachment.
- **Update Rule** — push changes back to the origin rule (only for attached saved rules).
- **View in Rules** — navigate to the rule detail page (only for attached saved rules).

Never attempt to create, update, delete, enable, or disable rules directly via API calls.

After composing or modifying a rule, always render it inline for user review:
\`<render_attachment id="{attachmentId}" version="{version}"/>\`
where \`attachmentId\` is \`ruleAttachment.id\` and \`version\` is \`version\` from the ${alertingTools.manageRule} tool result.

## Save Order

When a conversation creates a full alerting setup (rule + workflow + action policy), the artifacts must be saved in a specific order because of cross-references:

1. **Rule** — save first. The action policy's matcher references \`rule.id\`, which must exist.
2. **Workflow** — save second. The action policy destination references the workflow ID, which must exist.
3. **Action Policy** — save last. It depends on both the persisted rule and the persisted workflow.

After composing all three artifacts, guide the user through saving in order:
> "To activate notifications, please save in this order:
> 1. Click **Create rule** on the rule card
> 2. Click **Save workflow** on the workflow card
> 3. Click **Create policy** on the action policy card
>
> The action policy references both the rule and the workflow, so they need to exist first."

If the user tries to save out of order, the action policy will fail because its referenced rule or workflow hasn't been persisted yet. The action policy card automatically detects unsaved dependencies and disables the Create button until they are saved.

---

## Notifications Require Alert Kind

Action policies only process alert episodes. Signal rules (\`kind: signal\`) do not participate in episode lifecycle or notification dispatch.

When a user asks for notifications on a rule that is currently \`kind: signal\` (or when composing a new rule where the user wants notifications):

1. **Explain the difference**: signal rules are observation-only ("Signal") and do not trigger notifications. Alert rules ("Alert") track episode lifecycle and can dispatch to action policies.
2. If the rule is a **draft (in-memory)**: use \`set_kind\` to change it to \`alert\`, then proceed with notification setup (Part 3).
3. If the rule is **persisted**: \`kind\` is immutable after creation. Inform the user that the existing signal rule cannot be converted. Offer to create a new alert rule with the same query and schedule, then set up notifications on the new rule.
4. After ensuring the rule is \`kind: alert\`, proceed with the notification setup flow (Part 3).

---

# Part 2: Action Policies (Notification Policies)

Action policies control how alert episodes are matched, grouped, throttled, and dispatched to workflow destinations.

## Action Policy Discovery

When a user asks about existing action policies:
- Search with \`platform.core.sml_search\`, using keywords like the policy name, matcher, or destination.
- Summarize matches: name, enabled/disabled, destination count, matcher snippet, grouping mode.
- To inspect or edit a saved policy, attach it with \`platform.core.sml_attach\` using the \`chunk_id\`.
- After attaching, use the returned \`attachment_id\` for subsequent ${alertingTools.manageActionPolicy} calls.

## Composing and Modifying Action Policies

Build the request for ${alertingTools.manageActionPolicy} as an ordered \`operations\` array. Operations run in sequence.

For a new policy, start with \`set_metadata\` (name required), then \`set_destinations\`.

For an existing policy, pass the \`actionPolicyAttachmentId\` and only include the operations for the requested changes.

### Operations

1. **\`set_metadata\`** — set \`name\`, \`description\`, and \`tags\`.
2. **\`set_destinations\`** — set workflow destinations. Each destination is \`{ type: "workflow", id: "<workflow-id>" }\`. Currently only \`workflow\` type is supported. At least one destination is required; maximum 10.
3. **\`set_matcher\`** — set a KQL query to filter which alert episodes trigger this policy. Set to \`null\` for a catch-all that matches all episodes. Available matcher fields:
   - \`episode_id\`, \`episode_status\` (inactive | pending | active | recovering)
   - \`group_hash\`, \`last_event_timestamp\`
   - \`rule.id\`, \`rule.name\`, \`rule.tags\`
   - \`data.*\` (rule-specific fields)
4. **\`set_grouping\`** — set \`groupingMode\` and optionally \`groupBy\` fields:
   - \`per_episode\` (default): one notification per alert episode lifecycle.
   - \`all\`: a single notification for all matching episodes.
   - \`per_field\`: group by specified \`groupBy\` fields (required when using this mode).
5. **\`set_throttle\`** — set the throttle \`strategy\` and optional \`interval\`:
   - For \`per_episode\` grouping: \`on_status_change\`, \`per_status_interval\`, \`every_time\`.
   - For \`all\` / \`per_field\` grouping: \`time_interval\`, \`every_time\`.
   - \`per_status_interval\` and \`time_interval\` require an \`interval\` value (e.g. \`"5m"\`, \`"1h"\`).

Action policies are always space-wide: they match alerts from any rule in the space unless the matcher narrows them. To scope a policy to a single rule, set a matcher of \`rule.id: "<ruleId>"\` via \`set_matcher\`.

### Throttle / Grouping Compatibility

The throttle strategy must be compatible with the grouping mode. If you set both in one request, put \`set_grouping\` before \`set_throttle\`. The tool validates compatibility after all operations run.

## Final Validation

Always include \`{ operation: "validate" }\` as the **last operation** in the final ${alertingTools.manageActionPolicy} call after all fields are set. This validates the accumulated policy against the API request schema and throws if the policy is not ready to save (missing required fields, invalid values, etc.). If validation fails, read the error issues, fix them with corrective operations, and retry with \`validate\` again.

## Action Policy Persistence

The ${alertingTools.manageActionPolicy} tool only manages the **in-memory attachment** — it never writes to Elasticsearch.
Always direct the user to the rendered attachment's action buttons for persistence:
- **Create policy** — create a new action policy from the in-memory attachment.
- **Update Policy** — push changes back to the origin policy (only for attached saved policies).

Never attempt to create, update, delete, enable, or disable action policies directly via API calls.

After composing or modifying an action policy, always render it inline for user review:
\`<render_attachment id="{attachmentId}" version="{version}"/>\`
where \`attachmentId\` is \`actionPolicyAttachment.id\` and \`version\` is \`version\` from the ${alertingTools.manageActionPolicy} tool result.

---

# Part 3: Default Notification Setup

After composing a complete **alert** rule (has name, query, schedule, and \`kind: alert\`), proactively ask the user:
**"Would you like to set up email notifications for this rule?"**

Do not offer notifications if the rule is still incomplete (missing name, query, or schedule).
If the rule's kind is \`signal\`, follow the "Notifications Require Alert Kind" guidance in Part 1 before proceeding.

If the user agrees, follow these two steps in order:

## Step 1 — Create a Default Workflow

1. Load the \`workflow-authoring\` skill via \`filestore.read\` (path: \`skills/platform/workflows\`).
2. Call \`platform.workflows.get_connectors\` with \`actionTypeId: ".email"\` to find an available email connector.
   - If no email connector exists, tell the user: "No email connector is configured. You can set one up under Stack Management → Connectors, then come back to add notifications."
3. Generate a unique \`workflowId\` — a UUID (e.g. \`550e8400-e29b-41d4-a716-446655440000\`). Pass it as the \`workflowId\` parameter when calling \`platform.core.generate_workflow\`. This same ID will be used as the persisted workflow ID and must be referenced in the action policy destination. **Do NOT use a human-readable slug** — it would collide across conversations.
4. Call \`platform.core.generate_workflow\` with the \`workflowId\` and a natural-language description that includes the YAML template tailored to the rule's query columns (paste the template into the \`query\` or \`instructions\` parameter).

### Building the Workflow YAML

The workflow template should reference the rule's ES|QL output columns explicitly via \`ep.data.*\`.
The \`set_query\` operation validates the query with \`| LIMIT 0\` and returns the output column names and types.
These columns are exactly the fields that will appear in \`episodes[].data\` when the rule fires — the rule
executor writes each ES|QL result row as \`data: rowDoc\` on alert events.

For a rule with query: \`FROM logs-* | STATS error_count = COUNT(*) BY host.name | WHERE error_count >= 5\`

Use this template structure:

\`\`\`yaml
version: '1'
name: "Notify: <rule-name>"
enabled: true
triggers:
  - type: manual
steps:
  - name: send_email
    type: email
    connector-id: <connector-id>
    with:
      to:
        - <user-provided-email>
      subject: "Alert: <rule-name> — {{ inputs.payload.episodes | size }} episode(s)"
      message: >
        Rule "<rule-name>" triggered {{ inputs.payload.episodes | size }} alert episode(s).

        {% for ep in inputs.payload.episodes %}
        - Host: {{ ep.data.host.name | default: "unknown" }}
          Errors: {{ ep.data.error_count | default: "n/a" }}
          Status: {{ ep.episode_status }}
        {% endfor %}

        View execution: {{ execution.url }}
\`\`\`

**Key rules for the template:**

- **Use \`triggers: - type: manual\`** — action policies invoke workflows programmatically via \`scheduleWorkflow\`.
  The \`alert\` trigger type is for the v1 alerting connector path, which uses a completely different event shape.
- **Hardcode the rule name** in the subject and message — the dispatch payload includes \`rule_id\` but not the
  rule's human-readable name. The LLM knows the name from the rule attachment.
- **Reference \`ep.data.*\` fields explicitly** based on the rule's ES|QL output columns. Dotted field names
  (e.g. \`host.name\`, \`event.action\`) are reconstructed into nested objects, so access them as
  \`ep.data.host.name\` (not \`ep.data["host.name"]\`).
- **Guard for empty data** — \`data\` is populated for \`active\`/\`pending\` episodes but empty (\`{}\`) for
  \`recovering\`/\`inactive\` episodes. Use \`| default: "..."\` filters or \`{% if ep.data %}\` guards.
- **Do NOT use v1 variables** like \`{{ event.alerts }}\`, \`{{ event.rule.name }}\`, or \`{{ event.spaceId }}\` —
  those are undefined in the action policy dispatch path.

**Available Liquid variables from action policy dispatch:**

| Variable | Description |
|---|---|
| \`inputs.payload.episodes\` | Array of alert episodes |
| \`inputs.payload.episodes[].episode_status\` | \`active\`, \`pending\`, \`recovering\`, or \`inactive\` |
| \`inputs.payload.episodes[].rule_id\` | The rule's saved object ID |
| \`inputs.payload.episodes[].episode_id\` | The episode UUID |
| \`inputs.payload.episodes[].data.*\` | ES|QL output row fields (populated for active/pending) |
| \`inputs.payload.policyId\` | The action policy ID |
| \`inputs.payload.id\` | The action group ID |
| \`inputs.payload.groupKey\` | The grouping key object |
| \`triggeredBy\` | Always \`"action_policy"\` |
| \`spaceId\` | The Kibana space |
| \`execution.url\` | Direct link to the workflow execution in Kibana |
| \`execution.id\` | The workflow execution ID |
| \`workflow.name\` | The workflow's display name |
| \`kibanaUrl\` | The Kibana base URL |
| \`now\` | ISO timestamp of execution start |

5. After creating the workflow, render it inline for user review:
   \`<render_attachment id="{attachmentId}" version="{attachmentVersion}"/>\`
   where \`attachmentId\` and \`attachmentVersion\` come from the \`generate_workflow\` tool result.
6. Use the \`workflowId\` you generated in step 3 for action policy destinations in Step 2. Do NOT use the \`attachmentId\` — that is only for rendering.

## Step 2 — Create a Default Action Policy

Use ${alertingTools.manageActionPolicy} with these operations in order:

1. \`set_metadata\`: name = \`"Notify on <rule-name>"\`, description = \`"Default notification for <rule-name>"\`
2. \`set_destinations\`: \`[{ type: "workflow", id: "<workflowId-from-step-1>" }]\`
   - **IMPORTANT**: Use the \`workflowId\` you generated in step 3 (passed to \`generate_workflow\`), NOT the \`attachmentId\`. The \`workflowId\` is the stable workflow ID used for persistence and cross-references. Using the attachment ID will cause a validation error.
3. \`set_matcher\`: \`rule.id: "<ruleId>"\`
   - Use the \`ruleId\` value from the \`manage_rule\` tool result to scope this policy to the new rule. This ID is pre-assigned when the rule attachment is created and will become the saved-object ID when the user clicks "Create rule".
   - The \`ruleId\` is always available — even for unsaved/proposed rules — so you never need to ask the user to save the rule first.
   - If the user explicitly requests a cross-rule or shared policy, omit the \`rule.id\` matcher (or use a broader matcher) so it matches alerts from any rule in the space.
4. \`set_grouping\`: \`per_episode\`
5. \`set_throttle\`: \`{ strategy: "on_status_change" }\`

Render the action policy inline for user review:
\`<render_attachment id="{attachmentId}" version="{version}"/>\`
where \`attachmentId\` is \`actionPolicyAttachment.id\` and \`version\` is \`version\` from the ${alertingTools.manageActionPolicy} tool result.

## Save Order Reminder

After rendering all three attachments (rule, workflow, action policy), remind the user of the required save order:

> "To activate this alerting setup, please save in order: **Rule → Workflow → Action Policy**. The action policy depends on both the rule and the workflow being saved first."

## Customization Hints

After creating the defaults, briefly mention:
- They can use a different connector type (Slack, PagerDuty, etc.) — offer to use \`platform.workflows.get_connectors\` to explore.
- They can change the throttle strategy — \`on_status_change\` (default) only notifies on transitions, \`every_time\` notifies on every evaluation cycle.
- They can broaden the policy to cover multiple rules by removing the \`rule.id\` matcher or replacing it with a broader matcher.`,
    getInlineTools: () => [manageRuleTool(), manageActionPolicyTool(deps)],
  });
