/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import {
  ACTION_POLICY_MANAGEMENT_SKILL_ID,
  ALERTING_TOOL_IDS,
  ALERTING_V2_ENABLED_SETTING_ID,
} from '@kbn/alerting-v2-constants';
import {
  ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID,
  KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX,
} from '@kbn/workflows';
import { manageActionPolicyTool } from '../tools/manage_action_policy';
import type { ManageActionPolicyToolDeps } from '../tools/manage_action_policy';
import {
  generateActionPolicyOperationsDoc,
  generateActionPolicyWorkflowPayloadDoc,
  generateDispatchFlowDoc,
  generateGroupingModesDoc,
  generateMatcherContextDoc,
  generateThrottleStrategiesDoc,
  generateThrottleGroupingCompatibilityDoc,
  generateWorkflowDestinationsDoc,
  generateSingleRuleActionPolicyDoc,
  generateMultiRuleActionPolicyDoc,
} from './schema_to_skill_docs';

const NOTIFICATION_GROUP_INPUT_REF = `${KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX}${ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID}`;

export const createActionPolicyManagementSkill = (deps: ManageActionPolicyToolDeps) =>
  defineSkillType({
    id: ACTION_POLICY_MANAGEMENT_SKILL_ID,
    name: ACTION_POLICY_MANAGEMENT_SKILL_ID,
    basePath: 'skills/platform/alerting',
    description:
      'Compose, discover, and modify Alerting V2 action policies within a conversation. Use when the user wants to set up, change, or inspect how alert notifications are matched, grouped, throttled, and dispatched to workflows ("notify me when this rule fires", "set up email notifications for my alert", "create a notification policy", "change my alert to page via PagerDuty", "list my action policies"). Covers workflow destinations, KQL matchers, grouping, and throttling. For composing or editing the underlying alert rules themselves, load the rule-management skill.',
    experimental: true,
    uiSettingRequired: ALERTING_V2_ENABLED_SETTING_ID,
    referencedContent: [
      {
        name: 'action-policy-matchers',
        relativePath: './references',
        content: generateMatcherContextDoc(),
      },
      {
        name: 'action-policy-grouping-modes',
        relativePath: './references',
        content: generateGroupingModesDoc(),
      },
      {
        name: 'action-policy-throttle-strategies',
        relativePath: './references',
        content: generateThrottleStrategiesDoc(),
      },
      {
        name: 'action-policy-throttle-grouping-compatibility',
        relativePath: './references',
        content: generateThrottleGroupingCompatibilityDoc(),
      },
      {
        name: 'workflow-destinations',
        relativePath: './references',
        content: generateWorkflowDestinationsDoc(),
      },
      {
        name: 'dispatch-flow',
        relativePath: './references',
        content: generateDispatchFlowDoc(),
      },
      {
        name: 'workflow-dispatch-payload',
        relativePath: './references',
        content: generateActionPolicyWorkflowPayloadDoc(),
      },
      {
        name: 'action-policy-single-rule',
        relativePath: './references',
        content: generateSingleRuleActionPolicyDoc(),
      },
      {
        name: 'action-policy-multi-rule',
        relativePath: './references',
        content: generateMultiRuleActionPolicyDoc(),
      },
    ],
    content: `## When to Use This Skill

Use this skill when:
- A user asks to find, list, inspect, or modify action policies.
- A user asks to create or configure a new action policy with workflow destinations, matchers, grouping, or throttling.
- A user wants to set up notifications (email, Slack, PagerDuty, etc.) for an alert rule, or share one policy across several rules.
- The \`rule-management\` skill has handed off after composing a complete alert rule and the user agreed to set up notifications.

Do **not** use this skill for:
- Composing or editing alerting V2 rules themselves — load the \`rule-management\` skill for that.
- Classic (V1) Kibana stack rules or Security detection rules.
- Action connector configuration (connectors are managed separately — load \`workflow-authoring\` for connector discovery).
- Querying or analyzing data — use data exploration skills for that.

---

## Action Policies

An action policy is a **space-scoped saved object** that controls how alert episodes are matched, grouped, throttled, and dispatched to workflow destinations. They are not embedded in rules: one policy can match episodes from many rules.

---

## Action Policy Discovery

When a user asks about existing action policies:
- Search with \`platform.core.sml_search\`, using keywords like the policy name, matcher, or destination.
- Summarize matches: name, enabled/disabled, destination count, matcher snippet, grouping mode.
- To inspect or edit a saved policy, attach it with \`platform.core.sml_attach\` using the \`entry_id\`.
- After attaching, use the returned \`attachment_id\` for subsequent ${
      ALERTING_TOOL_IDS.manageActionPolicy
    } calls.

## Composing and Modifying Action Policies

Build the request for ${
      ALERTING_TOOL_IDS.manageActionPolicy
    } as an ordered \`operations\` array. Operations run in sequence.

For a new policy, start with \`set_metadata\` (name required), then \`set_destinations\`.

For an existing policy, pass the \`actionPolicyAttachmentId\` and only include the operations for the requested changes.

See the [action-policy-matchers reference](./references/action-policy-matchers.md) when choosing matcher fields. For whether to scope to one rule or many, consult [single-rule action policies](./references/action-policy-single-rule.md) or [multi-rule action policies](./references/action-policy-multi-rule.md).

${generateActionPolicyOperationsDoc()}

## Final Validation

Always include \`{ operation: "validate" }\` as the **last operation** in the final ${
      ALERTING_TOOL_IDS.manageActionPolicy
    } call after all fields are set. This validates the accumulated policy against the API request schema and throws if the policy is not ready to save (missing required fields, invalid values, etc.). If validation fails, read the error issues, fix them with corrective operations, and retry with \`validate\` again.

## Rendering Attachments

After calling ${
      ALERTING_TOOL_IDS.manageActionPolicy
    }, **always** render the action policy attachment inline in your response using the \`<render_attachment>\` tag with the attachment ID and version from the tool result:

\`\`\`
<render_attachment id="<actionPolicyAttachment.id>" version="<version>" />
\`\`\`

This displays the interactive action policy card with Create/Update buttons.

## Persistence

The ${
      ALERTING_TOOL_IDS.manageActionPolicy
    } tool only manages the **in-memory attachment** — it never writes to Elasticsearch.
Always direct the user to the rendered attachment's action buttons for persistence:
- **Create policy** — create a new action policy from the in-memory attachment.
- **Update Policy** — push changes back to the origin policy (only for attached saved policies).

Never attempt to create, update, delete, enable, or disable action policies directly via API calls.

After composing or modifying an action policy, always render it inline for user review:
\`<render_attachment id="{attachmentId}" version="{version}"/>\`
where \`attachmentId\` is \`actionPolicyAttachment.id\` and \`version\` is \`version\` from the ${
      ALERTING_TOOL_IDS.manageActionPolicy
    } tool result.

---

## Default Notification Setup

When setting up notifications create a default workflow first (Step 1), then create an action policy:

- Setting up notifications for **one rule** — consult the [single-rule action policies reference](./references/action-policy-single-rule.md).
- Setting up notifications for **several rules, a catch-all, or routing by tag/severity** — consult the [multi-rule action policies reference](./references/action-policy-multi-rule.md).

### Step 1 — Create a Default Workflow

1. Load the \`workflow-authoring\` skill via \`filestore.read\` (path: \`skills/platform/workflows\`). That skill also covers connectors in depth.
2. Call \`platform.workflows.get_connectors\` with \`actionTypeId: ".email"\` to find an available email connector.
   - If no email connector exists, tell the user: "No email connector is configured. You can set one up under Stack Management → Connectors, then come back to add notifications."
3. Generate a unique \`workflowId\` — a UUID (e.g. \`550e8400-e29b-41d4-a716-446655440000\`). Pass it as the \`workflowId\` parameter when calling \`platform.core.generate_workflow\`. This same ID will be used as the persisted workflow ID and must be referenced in the action policy destination. **Do NOT use a human-readable slug** — it would collide across conversations.
4. Call \`platform.core.generate_workflow\` with the \`workflowId\` and a natural-language description that includes the YAML template tailored to the rule's query columns (paste the template into the \`query\` or \`instructions\` parameter). Consult the [workflow-dispatch-payload reference](./references/workflow-dispatch-payload.md) for the field catalog, \`data\` notes, and example YAML.
5. Validate the generated YAML with \`platform.workflows.validate_workflow\`, passing \`expectedInputRefs: ["${NOTIFICATION_GROUP_INPUT_REF}"]\`. This confirms the workflow declares the dispatch payload as an input and only references fields the payload actually provides. If it reports \`missingInputRef\` or \`unknownInputRefPath\`, fix the YAML and re-validate before continuing.
6. After creating the workflow, render it inline for user review:
   \`<render_attachment id="{attachmentId}" version="{attachmentVersion}"/>\`
   where \`attachmentId\` and \`attachmentVersion\` come from the \`generate_workflow\` tool result.
7. Use the \`workflowId\` you generated in step 3 for action policy destinations. Do NOT use the \`attachmentId\` — that is only for rendering.

Then create the action policy from the matching reference above and render it:
\`<render_attachment id="{attachmentId}" version="{version}"/>\`
where \`attachmentId\` is \`actionPolicyAttachment.id\` and \`version\` is \`version\` from the ${
      ALERTING_TOOL_IDS.manageActionPolicy
    } tool result.

## Save Order Reminder

After rendering all three attachments (rule, workflow, action policy), remind the user of the required save order:

> "To activate this alerting setup, please save in order: **Rule → Workflow → Action Policy**. The action policy depends on both the rule and the workflow being saved first."

## Customization Hints

After creating the defaults, briefly mention:
- They can use a different connector type (Slack, PagerDuty, etc.) — offer to use \`platform.workflows.get_connectors\` to explore.
- They can change throttle or grouping — consult the [action-policy-throttle-strategies reference](./references/action-policy-throttle-strategies.md) and the [action-policy-throttle-grouping-compatibility reference](./references/action-policy-throttle-grouping-compatibility.md).
- They can share this policy with other rules instead of creating one policy per rule — consult the [multi-rule action policies reference](./references/action-policy-multi-rule.md).

---

## When to Load References

### Single-rule Action Policies
When notifying on one specific rule (\`rule.id\` matcher, pre-assigned \`ruleId\`), consult the [action-policy-single-rule reference](./references/action-policy-single-rule.md).

### Multi-rule Action Policies
When the user wants one policy across several rules, a catch-all, or routing by tag/severity, consult the [action-policy-multi-rule reference](./references/action-policy-multi-rule.md).

### Matchers
When the user asks how to match episodes, or which KQL fields are available, consult the [action-policy-matchers reference](./references/action-policy-matchers.md).

### Grouping Modes
When the user asks how episodes are grouped (per episode, all together, by field), consult the [action-policy-grouping-modes reference](./references/action-policy-grouping-modes.md).

### Throttle Strategies
When the user asks how often notifications fire, or to change throttle strategy, consult the [action-policy-throttle-strategies reference](./references/action-policy-throttle-strategies.md).

### Throttle / Grouping Compatibility
When setting grouping and throttle together, consult the [action-policy-throttle-grouping-compatibility reference](./references/action-policy-throttle-grouping-compatibility.md).

### Workflows
When the user asks how destinations relate to workflows or connectors, consult the [workflow-destinations reference](./references/workflow-destinations.md). For connector types and discovery, load the \`workflow-authoring\` skill.

### Dispatch Flow
When the user asks how a notification gets from a rule firing to email/Slack, consult the [dispatch-flow reference](./references/dispatch-flow.md).

### Workflow Dispatch Payload
When choosing Liquid variables for a notification workflow, including query-specific \`ep.data.*\` fields, consult the [workflow-dispatch-payload reference](./references/workflow-dispatch-payload.md).

Any workflow used as an action policy destination must declare the dispatch payload as an input on its \`manual\` trigger:

\`\`\`yaml
triggers:
  - type: manual
    inputs:
      properties:
        payload:
          $ref: '${NOTIFICATION_GROUP_INPUT_REF}'
      required:
        - payload
\`\`\`

Templates then read from \`inputs.payload.*\`. Verify this with \`platform.workflows.validate_workflow\` using \`expectedInputRefs: ["${NOTIFICATION_GROUP_INPUT_REF}"]\`.`,
    getInlineTools: () => [manageActionPolicyTool(deps)],
  });
