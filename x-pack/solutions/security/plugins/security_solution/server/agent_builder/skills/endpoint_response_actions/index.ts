/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SkillDefinition } from '@kbn/agent-builder-server/skills';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';

import type { EndpointAppContextService } from '../../../endpoint/endpoint_app_context_services';
import {
  isolateHostTool,
  unisolateHostTool,
  getEndpointStatusTool,
  listEndpointsTool,
} from './tools';

const ID = 'endpoint-response-actions';
const NAME = 'endpoint-response-actions';
const BASE_PATH = 'skills/security/endpoint';
function toolName(name: string) {
  return `${ID}.${name}`;
}
export const ISOLATE_TOOL_ID = toolName('isolate_host');
export const UNISOLATE_TOOL_ID = toolName('unisolate_host');
export const GET_ENDPOINT_STATUS_TOOL_ID = toolName('get_endpoint_status');
export const LIST_ENDPOINTS_TOOL_ID = toolName('list_endpoints');

const SYSTEM_INSTRUCTIONS = `# Endpoint Response Actions Skill

## When to Use This Skill

Use this skill when the analyst requests any of the following in natural language:
- List available endpoints that response actions can target
- Isolate or un-isolate a host
- Check the status of a host (isolation state, last seen, online/offline)

## Conversation Flow

### 1. Parse Intent
Identify the action type from the analyst's message:
- **list** / **show** / **which endpoints** / **available hosts** → use \`list_endpoints\` tool
- **isolate** / **quarantine** / **disconnect** → use \`isolate_host\` tool
- **unisolate** / **release** / **reconnect** → use \`unisolate_host\` tool
- **status** / **check** / **is isolated** → use \`get_endpoint_status\` tool

### 2. Confirm Before Acting (Write Actions Only)
For isolation/un-isolation actions:
- Present the target host name
- State the expected impact clearly
- Wait for explicit analyst confirmation before dispatching

### 3. Execute and Report
- Call the appropriate tool
- Report the result inline: action ID, status, and any output
- If the action fails, provide the error message and action ID for manual follow-up

## Error Handling

| Scenario | Response |
|----------|----------|
| No endpoints found | Report that no endpoints with Elastic Defend are enrolled |
| Host not found | Ask analyst to clarify; try alternative hostname |
| Already isolated/unisolated | Report current status from \`get_endpoint_status\` |
| Action timeout | "Action timed out. Check status in Response Console." |
| Action failed | Report error message and action ID |
| Insufficient privileges | Inform analyst they lack permission |

## Best Practices
- When the analyst asks to see available endpoints, use \`list_endpoints\` first
- Always confirm host identity before executing write actions
- Always verify current status with \`get_endpoint_status\` before isolate/unisolate
- Keep the analyst informed with progress updates`;

export const createEndpointResponseActionsSkill = (
  endpointAppContextService: EndpointAppContextService
): SkillDefinition<typeof NAME, typeof BASE_PATH> => {
  return defineSkillType({
    id: ID,
    name: NAME,
    basePath: BASE_PATH,
    description:
      'Execute endpoint response actions (isolate, unisolate, check status) from chat conversations. Resolves hostnames to endpoint identities and dispatches actions through the Elastic Defend Response Actions service.',
    content: SYSTEM_INSTRUCTIONS,
    getInlineTools: () => [
      listEndpointsTool(endpointAppContextService),
      isolateHostTool(endpointAppContextService),
      unisolateHostTool(endpointAppContextService),
      getEndpointStatusTool(endpointAppContextService),
    ],
  });
};
