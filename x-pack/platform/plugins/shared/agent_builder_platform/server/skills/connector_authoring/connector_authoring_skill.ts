/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import dedent from 'dedent';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { createListConnectorTypesTool } from './list_connector_types';
import { createProposeConnectorTool } from './propose_connector';

/**
 * Built-in skill that lets the agent help a user create a Kibana connector
 * instance from chat — collecting the connector type conversationally while the
 * actual config and secrets are entered in a form (and submitted directly to the
 * Actions API), so secrets never appear in the conversation.
 */
export const connectorAuthoringSkill = defineSkillType({
  id: 'connector-authoring',
  name: 'connector-authoring',
  basePath: 'skills/platform/agent-builder',
  experimental: true,
  description:
    'Set up a Kibana connector from chat. Use when the user wants to add, connect, set up, or integrate an external system — such as GitHub, Slack, PagerDuty, or Notion — so the agent can act on it. Also use when the user mentions giving the agent access to a tool, repo, or data source, even if they do not say the word "connector".',
  content: dedent(`
## When to Use This Skill

Use this skill when:
- The user asks to "add / connect / set up / integrate" an external system (GitHub, Slack, PagerDuty, Notion, an MCP server, an HTTP endpoint, …).
- During onboarding, the user mentions a system the agent would need access to (e.g. "the code is all in one GitHub monorepo") and granting access would let you help more.
- The user wants the agent to be able to act on a service it currently can't reach.

Do **not** use this skill when:
- The user only wants to use a connector that already exists — just use it.
- The user wants to manage connectors in depth (edit/delete) — direct them to Stack Management → Connectors.

## Secrets stay out of chat

Never ask the user to paste API keys, tokens, passwords, or webhook URLs into the conversation. Those are entered in the connector form on the setup card and sent straight to Kibana, encrypted. Your job is only to identify the right connector type and render the card.

## Available Tools

- **list_connector_types** — Enumerate the connector types that can be set up, with their ids, descriptions, auth methods, and the sub-actions you'd be able to call afterwards. Call this BEFORE \`propose_connector\`.
- **propose_connector** — Render an inline setup card for a chosen connector type. Returns an \`attachment_id\` for \`<render_attachment>\`.

## Workflow

1. **Clarify intent.** Confirm what the user wants the agent to be able to do (e.g. "investigate issues in your GitHub repos"). If it's ambiguous which system they mean, ask a brief question.

2. **Find the connector type.** Call \`list_connector_types\` and match the user's intent to a \`connector_type\` using the names and descriptions. Prefer the connector whose \`tool_actions\` cover what the user needs. If nothing fits, say so plainly rather than guessing.

3. **Mention what they'll need.** Briefly tell the user what the connector enables and, from the \`auth_methods\`, what kind of credential they'll provide (e.g. "GitHub uses a token or OAuth"). Do not collect the credential here.

4. **Render the setup card.** Call \`propose_connector\` with the chosen \`connector_type\` (and an optional \`suggested_name\` / one-line \`reason\`). On success, emit \`<render_attachment id="ATTACHMENT_ID" />\` **on its own line** (a blank line before it — a tag on the same line as prose renders as raw text). Keep your prose short — prompt the user to click "Set up connector" and complete the form.

5. **Continue after setup.** Once the user creates the connector it becomes available to you automatically — you do not need to ask for its id. On a later turn, confirm it's connected and proceed with the task (the connector tools handle any authorization prompts).

## Example

User: "All our services live in one GitHub monorepo."

1. \`list_connector_types\` → find the entry with \`connector_type: ".github"\`.
2. Reply: "If I can reach your GitHub repos I can investigate issues across services. GitHub uses a token or OAuth — want to set it up?"
3. On "yes", call \`propose_connector\` with \`{ "connector_type": ".github", "reason": "Investigate issues across services in your monorepo" }\`.
4. Emit: \`I can set that up here — fill in the form on the card below.\\n\\n<render_attachment id="att-..." />\`
5. After the user completes it, continue: confirm GitHub is connected and offer to look at the repos.
  `),
  getInlineTools: () => [createListConnectorTypesTool(), createProposeConnectorTool()],
});
