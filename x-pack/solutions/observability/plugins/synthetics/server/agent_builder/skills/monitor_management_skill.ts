/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { ALLOWED_MONITOR_SCHEDULES_IN_MINUTES } from '../../../common/agent_builder/attachments/monitor_attachment_schema';
import { MONITOR_MANAGEMENT_SKILL_ID, syntheticsTools } from '../common/constants';
import { manageMonitorTool } from '../tools/manage_monitor';

const allowedSchedulesList = ALLOWED_MONITOR_SCHEDULES_IN_MINUTES.join(', ');

export const createMonitorManagementSkill = () =>
  defineSkillType({
    id: MONITOR_MANAGEMENT_SKILL_ID,
    name: 'monitor-management',
    basePath: 'skills/observability',
    description:
      'Compose and modify Synthetics HTTP monitors within a conversation. Use when a user asks to create, draft, or adjust the configuration of an uptime/availability monitor.',
    content: `## When to Use This Skill

Use this skill when:
- A user asks to create a new Synthetics HTTP monitor from natural language requirements.
- A user asks to modify the URL, schedule, locations, name, description, or tags of a draft monitor in the conversation.
- A user wants to validate that a monitor draft is ready to save.

Do **not** use this skill for:
- Browser, TCP, or ICMP monitor types — only HTTP is supported in this MVP. If the user asks for a different type, explain the current limitation and offer to compose an HTTP monitor instead.
- Listing, searching, or inspecting saved Synthetics monitors — those flows are owned by the read-only \`observability.synthetics_monitor\` attachment (loaded automatically when the user attaches an existing monitor).
- Querying or analyzing monitor run data — use observability data exploration skills for that.

---

## Composing and Modifying Monitors

Build the request for \`${syntheticsTools.manageMonitor}\` as an ordered \`operations\` array. Operations run in sequence.

For a new monitor, start with \`set_metadata\` (name is required for new monitors), then \`set_url\`, \`set_schedule\`, and \`set_locations\`.

For an existing monitor draft, pass the \`monitorAttachmentId\` and only include the operations needed for the changes requested.

### Operations

1. **\`set_metadata\`** — set \`name\` (required for new monitors, max 255 chars), \`description\` (optional, max 2048 chars), and \`tags\` (optional array, max 20 entries, each up to 128 chars). Partial updates supported: a metadata operation without \`name\` preserves the existing name.
2. **\`set_url\`** — set the URL the monitor should check (must be a valid URL, e.g. \`https://example.com\`).
3. **\`set_schedule\`** — set how often the monitor runs. Both fields required:
   - \`number\`: a string drawn from the Synthetics allow-list (${allowedSchedulesList}).
   - \`unit\`: must be \`"m"\` (minutes is the only supported unit).
4. **\`set_locations\`** — replace the locations array (at least one required). Each location is \`{ id: string, label?: string, isServiceManaged?: boolean }\`. Use \`isServiceManaged: true\` for Elastic-managed locations and \`false\` for user-defined private locations.
5. **\`validate\`** — validate the accumulated monitor against the schema. Throws a structured error listing every missing or invalid field if the monitor is not ready to save.

## Final Validation

Always include \`{ operation: "validate" }\` as the **last operation** in the final \`${syntheticsTools.manageMonitor}\` call. If validation fails, read the issues in the error, fix them with additional operations, and retry the call with \`validate\` at the end.

## Rendering Attachments

After **every** call to \`${syntheticsTools.manageMonitor}\` you **MUST** render the monitor attachment inline in your response using the \`<render_attachment>\` tag:

\`\`\`
<render_attachment id="<monitorAttachment.id>" version="<version>" />
\`\`\`

where \`<monitorAttachment.id>\` and \`<version>\` come from the tool result.

This renders the interactive monitor card with the **Save monitor** / **Update monitor** action buttons. **Do not** summarise the monitor in a markdown table or bulleted list instead — without the \`<render_attachment>\` tag the user has no way to save the monitor and your turn is incomplete.

## Persistence

The \`${syntheticsTools.manageMonitor}\` tool only manages the **in-memory attachment** — it never writes to Elasticsearch. Tell the user to persist their changes by clicking the **Save monitor** button on the rendered attachment (or **Update monitor** if it has already been saved). Do not attempt to create, update, delete, enable, or disable Synthetics monitors directly via API calls.

Reminder: every turn that calls \`${syntheticsTools.manageMonitor}\` MUST end with a \`<render_attachment id="{monitorAttachment.id}" version="{version}"/>\` tag — the **Save monitor** button only exists on that rendered card.

## Discovering Existing Locations

When the user does not specify locations explicitly, prefer the Elastic-managed locations from the user's environment. If unsure, ask which region(s) they want the monitor to run from before calling \`${syntheticsTools.manageMonitor}\`. Do not invent location IDs — the tool validates that at least one location is present but does not verify the IDs against the Synthetics service.`,
    getInlineTools: () => [manageMonitorTool()],
  });
