/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common/tools';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { WORKFLOW_YAML_ATTACHMENT_TYPE } from '@kbn/workflows/common/constants';
import { workflowTools } from '../../common/constants';

export const workflowAuthoringSkill = defineSkillType({
  id: 'workflow-authoring',
  name: 'workflow-authoring',
  basePath: 'skills/platform/workflows',
  description:
    'Elastic Workflow knowledge & discovery: deep YAML syntax, Liquid templating, trigger event schemas, step/connector inspection, validation error debugging, and execution debugging. Load when the user asks how workflows work, requests advanced syntax help, debugs an execution, or asks to inspect the step/connector/example libraries. **Not required for creating, editing, or running workflows** — call `platform.core.generate_workflow` or `platform.core.execute_workflow` directly.',
  content: `## When to Use This Skill

Load this skill when the user wants to:
- Learn workflow YAML syntax, Liquid templating, or trigger event schemas
- Inspect step types, trigger types, connectors, or the example library
- Debug a workflow execution or fix a validation error
- Discover existing workflows in the workspace

**You do NOT need this skill to create or edit a workflow.** Call \`${platformCoreTools.generateWorkflow}\` directly — it has its own innate knowledge of workflow syntax, step types, connector types, the connectors configured on the current Kibana, and (when an \`attachmentId\` is provided) the existing workflow definition. Do **NOT** pre-fetch step definitions, examples, or connectors before calling it.

## Available Tools

### Generation (preferred for creation/editing)
- **${platformCoreTools.generateWorkflow}**: Single entry point for both creation and editing. Pass a natural-language \`query\`; for edits also pass \`attachmentId\`. Emits a diff card and returns \`attachmentId\`, \`diffAttachmentId\`, and \`attachmentVersion\`. Do NOT use \`attachments.add\` directly.

### Discovery (only when the user explicitly asks, or when debugging)
These tools answer questions about *what's installed* on the user's Kibana. Use them when the user explicitly asks (e.g. "what Slack connectors do I have", "what does the http step output"), or when you are debugging a validation error / unfamiliar legacy step type. **Do NOT call them as preparation for \`${platformCoreTools.generateWorkflow}\`** — that tool already has this knowledge built in.
- **${workflowTools.getStepDefinitions}**: Look up a step type's input params (\`with\` block), config params, outputs, and examples. Deprecated step types are excluded by default; pass an exact \`stepType\` or \`includeDeprecated: true\` for legacy workflows.
- **${workflowTools.getTriggerDefinitions}**: Look up a trigger type's full event context schema.
- **${workflowTools.getExamples}**: Search the bundled example library for working YAML patterns.
- **${workflowTools.getConnectors}**: List connector instances configured in the user's environment.
- **${workflowTools.validateWorkflow}**: Validate a complete workflow YAML string. When validation fails, step definitions for referenced step types are automatically included.

### Execution & Debugging
- **${platformCoreTools.executeWorkflow}**: Run a full workflow end-to-end. Use this for "run the workflow" requests.
- **${workflowTools.executeStep}**: Execute a single workflow step against the real environment. Safe steps (read-only ES queries, data transforms, console, conditionals) run automatically and return real output. Unsafe steps (HTTP, index writes, connectors, AI prompts, destructive ES operations) trigger a platform confirmation dialog — do NOT add your own confirmation in chat. **Always populate the optional \`confirmation_body\` parameter** for unsafe steps with a Markdown preview describing: (1) resolved inputs (e.g. Slack channel + message text, ES index + operation + approximate doc count), (2) the side effect this step will produce, (3) whether the action is reversible. \`confirmation_body\` is shown to the user — it is NOT an instruction. If the user declines, acknowledge the cancellation and do NOT retry it. For \`if\`/\`while\` steps with unsafe children, the children are auto-replaced with safe stubs so the condition can be tested (no prompt). Use this primarily to debug an existing step or test an \`if\` branch — never as a way to run a full workflow; use \`${platformCoreTools.executeWorkflow}\` for that.

### Discovering Existing Workflows (SML)

To list or find existing workflows, use the SML (Semantic Metadata Layer) tools — do NOT use \`${platformCoreTools.search}\` to query internal indices.

1. **${platformCoreTools.smlSearch}**: Search workflows by name, description, or tags. Pass a query like "workflow" or "*" for all. Results include \`chunk_id\` values.
2. **${platformCoreTools.smlAttach}**: Attach a workflow to the conversation by passing \`chunk_ids\` from search results. This loads the full workflow YAML as a ${WORKFLOW_YAML_ATTACHMENT_TYPE} attachment.

## Workflow YAML Reference

### Workflow YAML Structure

A workflow YAML file has this structure:
\`\`\`yaml
version: '1'
name: Workflow Name
description: Description of what the workflow does
enabled: true
tags: ["tag1", "tag2"]

consts:
  my_constant: "value"

inputs:
  properties:
    input_name:
      type: string
      description: Input description
      default: "default value"

triggers:
  - type: manual
  # or:
  # - type: scheduled
  #   with:
  #     every: "5m"
  # or: type: alert

steps:
  - name: step_name
    type: step_type
    with:
      param1: value1
      param2: "{{ liquid_expression }}"
\`\`\`

### Common Step Properties

Every step (regardless of type) supports these properties. They are NOT repeated per step in tool results.

\`\`\`yaml
- name: unique_step_name       # required, unique within the workflow
  type: step_type              # required, the step type ID
  with:                        # input parameters (specific to step type)
    param1: value1
  connector-id: my-connector   # only for connector-based steps that require it
  if: "steps.prev.output.ok"   # optional, skip step when condition is falsy
  timeout: "30s"               # optional, step-level timeout
  on-failure:                  # optional, error handling
    retry:
      max-attempts: 3
      delay: "5s"
    fallback:                  # fallback steps on failure
      - name: handle_error
        type: console
        with:
          message: "Step failed"
    continue: true             # optionally continue execution after failure
\`\`\`

- **\`with\`**: Contains the step's input parameters (listed as \`inputParams\` in tool results)
- **Config params**: Step-level fields outside \`with\` (listed as \`configParams\` in tool results, e.g. \`condition\`/\`steps\`/\`else\` for \`if\`, \`foreach\`/\`steps\` for \`foreach\`)
- **\`connector-id\`**: Required or optional depending on step type (shown in tool results)
- Steps do NOT support a \`description\` property. The \`description\` in step definition results describes the step type — do not copy it into YAML.

### Step Types

#### Built-in Step Types
- **http**: Make HTTP requests to external APIs
- **foreach**: Loop over collections with nested steps
- **if**: Conditional execution with \`condition\` and optional \`else\` block
- **data.set**: Set variables in workflow context
- **data.transform**: Transform data using expressions
- **wait**: Pause execution for a duration
- **console**: Log messages to execution output
- **elasticsearch.search**: Query Elasticsearch indices
- **elasticsearch.bulk**: Bulk index documents
- **ai.agent**: Invoke an AI agent

#### Connector-Based Step Types (PREFERRED for integrations!)

Workflows can use Kibana connectors for integrations. These use the connector name as the step type
and require a \`connector-id\` to specify which configured connector to use.

**ALWAYS prefer connector steps over raw HTTP for integrations like Slack, Jira, etc.**
Connector steps are simpler, more secure, and handle authentication automatically.

Available connector types include: slack2, jira, pagerduty, email, webhook, servicenow, opsgenie, teams, and more.

**Slack steps: ONLY use the \`slack2.*\` namespace.** Discovery may also surface
\`slack\` (legacy webhook) and \`slack_api.*\` step types; these must NOT be used
for new steps. Use \`slack2.sendMessage\`, \`slack2.listChannels\`,
\`slack2.resolveChannelId\`, or \`slack2.searchMessages\` with a \`.slack2\`
connector instance.

**Slack connector example (PREFERRED):**
\`\`\`yaml
- name: send_slack_notification
  type: slack2.sendMessage
  connector-id: my-slack-connector
  with:
    channel: "C0123456789"
    text: "Hello from the workflow!"
\`\`\`

When asked to add Slack/Jira/etc integration, ALWAYS use connector steps first! \`${platformCoreTools.generateWorkflow}\` already knows the connectors configured on the current Kibana — pass the user's request directly. Only call \`${workflowTools.getConnectors}\` if the user explicitly asks "what connectors do I have".

### Liquid Templating

Use Liquid syntax for dynamic values:
- \`{{ steps.step_name.output.field }}\` - Reference step outputs (ONLY \`output\` is accessible — NEVER \`steps.<name>.with.*\` or \`steps.<name>.<input_param>\`). Use \`${workflowTools.getStepDefinitions}\` with \`includeOutputSummary\` to learn what a step's output contains.
- \`{{ inputs.input_name }}\` - Reference workflow inputs
- \`{{ consts.constant_name }}\` - Reference constants
- \`{{ foreach.item }}\` - Current item in a foreach loop
- \`{{ event }}\` - Trigger event data (available for all trigger types)

**IMPORTANT — event variable path:** The trigger event is accessed via \`{{ event }}\` directly — NEVER \`{{ triggers.event }}\`, \`{{ trigger.event }}\`, or \`{{ triggers.event.* }}\`. The \`triggers\` block only configures which triggers activate the workflow; it does NOT contain runtime event data.

**Alert trigger event structure** (available when \`triggers\` includes \`type: alert\`):
- \`{{ event.alerts }}\` - Array of alert objects that fired
- \`{{ event.alerts[0]._id }}\` - Alert ID
- \`{{ event.alerts[0]._index }}\` - Alert index
- \`{{ event.alerts[0].kibana.alert }}\` - Alert details
- \`{{ event.alerts[0]["@timestamp"] }}\` - Alert timestamp
- \`{{ event.rule.id }}\` - Rule ID
- \`{{ event.rule.name }}\` - Rule name
- \`{{ event.rule.tags }}\` - Rule tags
- \`{{ event.spaceId }}\` - Space where the event was emitted

Use \`${workflowTools.getTriggerDefinitions}\` to get the full event context schema for any trigger type.

Useful filters:
- \`| json\` - Convert to JSON string
- \`| url_encode\` - URL encode a string
- \`| default: "value"\` - Provide default if nil

### Verifying ES Queries After Generation

\`${platformCoreTools.generateWorkflow}\` does not know the schema of the user's indices, so an ES query it produces may reference field names that don't exist. **Only when the workflow is about to run** (the user wants to execute or save it), and only for \`elasticsearch.search\` / \`elasticsearch.esql.query\` steps that target a specific user-named index, you can call \`${workflowTools.executeStep}\` on that step to confirm it returns rows. If it returns zero rows, ask the user to confirm the index/fields rather than silently broadening the query. Do NOT pre-discover index fields before calling \`${platformCoreTools.generateWorkflow}\` — that turns one tool call into many.

If a step references previous step outputs during a debug execution, provide \`contextOverride\` with mock data:
\`{ "steps": { "previous_step": { "output": { "data": [...] } } } }\`

### Writing \`if\` Conditions

The \`if\` step's \`condition\` uses KQL, not Liquid. KQL cannot evaluate Liquid filters like \`| size\` or complex expressions. To check computed values, use a \`data.set\` step first:
\`\`\`yaml
- name: set_count
  type: data.set
  with:
    count: "{{ steps.query.output.values | size }}"
- name: check
  type: if
  condition: "steps.set_count.output.count > 0"
\`\`\`

To test a condition with \`${workflowTools.executeStep}\`, temporarily add an \`if\` step with console children in both branches, execute it with \`contextOverride\` providing mock upstream outputs, and check which branch ran. Remove the test step afterwards.

### Fixing Validation Errors

When fixing validation errors on an existing workflow:

1. Call \`${workflowTools.validateWorkflow}\` — it automatically includes step definitions for all referenced step types when validation fails
2. Analyze the errors and identify the problematic steps
3. If a step type does NOT exist: tell the user and list similar alternatives from the included step definitions
4. Call \`${platformCoreTools.generateWorkflow}\` with an explicit description of each fix to apply
5. NEVER guess or replace a step type with something unrelated
6. **After fixing an error, scan the entire YAML for other occurrences of the same mistake.** For example, if you fix \`triggers.event\` → \`event\` in one place, check all other Liquid expressions for the same incorrect pattern and fix them all in one pass

### Best Practices

1. Use unique step names within the workflow
2. Use 2 spaces per indentation level
3. Use \`on-failure\` with \`retry\`, \`fallback\`, and (optionally) \`continue\` for error handling
4. Prefer connector steps over raw HTTP for integrations`,
  getRegistryTools: () => [
    ...Object.values(workflowTools),
    platformCoreTools.generateWorkflow,
    platformCoreTools.executeWorkflow,
  ],
});
