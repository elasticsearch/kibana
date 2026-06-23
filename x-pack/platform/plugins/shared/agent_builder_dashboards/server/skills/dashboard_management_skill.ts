/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { manageDashboardTool } from '../tools';
import { dashboardTools } from '../../common';
import { dashboardDesignGuidancePrompt } from './design_guidance';

export const dashboardManagementSkill = defineSkillType({
  id: 'dashboard-management',
  name: 'dashboard-management',
  basePath: 'skills/platform/dashboard',
  description:
    'Compose and update Kibana dashboards, involving panel creation, layout, and inline visualization editing.',
  content: `## When to Use This Skill

Use this skill when:
- A user asks to find, list, inspect, or modify existing Kibana dashboards.
- A user asks to create a dashboard from one or more visualizations.
- A user asks to update a dashboard created earlier in the conversation.
- A request involves dashboard metadata, markdown, panel, or section changes.

Do **not** use this skill when:
- The user asks for a standalone visualization and does not mention a dashboard context.
- The user needs help exploring data, fields, or query logic.

## Core Instructions

Every dashboard MUST have a non-empty \`title\`. If the attached dashboard's title is empty, missing, or \`"User Dashboard"\`, your first operation MUST be \`set_metadata\` with a title you invent from its contents.

For dashboard discovery:
- When a user asks what dashboards are available, search for existing saved dashboards with \`platform.core.sml_search\`.
- Use specific keywords from the user's request. For a broad listing of available dashboards, you may use \`keywords: ["*"]\`.
- Summarize matches in plain language by title and description, and include lightweight structure when available such as panel and section counts.
- Do **not** attach dashboards by default when only listing or comparing available dashboards.
- When the user wants to inspect or modify a saved dashboard, attach it with \`platform.core.sml_attach\` using the exact \`chunk_id\` from the search result.
- After attaching a saved dashboard, treat the returned dashboard attachment as the editable working copy. Use its \`attachment_id\` in conversation context for later dashboard updates.

Build the request for ${dashboardTools.manageDashboard} as an ordered \
\`operations\` array. Operations run in order, so earlier operations should set up state needed by later ones.

When a dashboard needs sections, prefer a single batched call:
1. Use \`add_section\` with its optional \`panels\` array when you already know the inline visualizations that belong in the new section.
2. Use a follow-up \`add_panels\` with per-item \`sectionId\` only when you need to target an existing section returned by an earlier tool result.

Do **not** make one ${dashboardTools.manageDashboard} call per section unless a later step truly depends on the result of an earlier section-specific change.

For a new dashboard:
- Start with \`set_metadata\` and provide both \`title\` and \`description\`. Include \`time_range\` if the user specified a time window.
- Use \`add_panels\` to add panels in one batched operation. Each item declares a \`kind\`: \`markdown\` for a summary or context panel, \`visualization\` for a Lens visualization created inline from natural language, or \`attachment\` for a panel sourced from an existing visualization attachment by \`attachmentId\`.
- Use \`add_section\` when panels naturally group into distinct topics or the dashboard is large enough that sections improve scanability. Include \`panels\` on the section when you can create that section's initial panels immediately.

For an existing dashboard:
- Reuse \`data.dashboardAttachment.id\` from the latest dashboard tool result as \`dashboardAttachmentId\`.
- Use \`remove_panels\` to remove existing panels by \`id\`.
- Use \`add_panels\` to add markdown, attached visualization, or inline Lens visualization panels.
- Use \`edit_panels\` to change existing panel content in place by \`panelId\`. Each item declares \`kind: "visualization"\` for ES|QL-backed Lens panels or \`kind: "markdown"\` for markdown panels.
- If a requested change targets a DSL, form-based, or other non-ES|QL Lens visualization panel, explicitly tell the user direct editing is not supported and ask for confirmation before replacing that panel with a newly created ES|QL-based Lens panel.
- Use \`update_panel_layouts\` to resize, reposition, or move existing panels between top-level and sections without changing panel content.
- Use \`add_section\` or \`remove_section\` for section changes.
- Use \`set_metadata\` to update the dashboard title, description, or time range. Use \`edit_panels\` with \`kind: "markdown"\` to replace an existing markdown panel's content, or \`add_panels\` with \`kind: "markdown"\` to add a new markdown panel.

Supported operations:
- \`set_metadata\`: set or update dashboard title, description, and/or time range. Use \`time_range\` whenever the user specifies a time window: convert natural language to Kibana date math (e.g. "last 30 minutes" → \`{ from: "now-30m", to: "now" }\`, "last 90 days" → \`{ from: "now-90d", to: "now" }\`) or ISO 8601 for absolute ranges (e.g. "May 20–24" → \`{ from: "2024-05-20T00:00:00.000Z", to: "2024-05-24T23:59:59.999Z", mode: "absolute" }\`). You can set \`time_range\` together with \`title\`/\`description\` or alone.
- \`add_panels\`: add panels in one batched operation. Each item declares \`kind: "markdown"\`, \`kind: "visualization"\`, or \`kind: "attachment"\`.
- Combine markdown summary, attached visualizations, and inline ES|QL visualizations in one \`add_panels\` operation when they belong to the same dashboard layout, even when items target different \`sectionId\` values.
- \`edit_panels\`: update existing panel content in place by \`panelId\`. Each item declares \`kind: "visualization"\` for ES|QL-backed Lens visualization panels or \`kind: "markdown"\` for markdown panels. Placement (grid and sectionId) is preserved.
- \`update_panel_layouts\`: resize, reposition, or move existing panels by \`panelId\` by updating \`grid\` and optionally changing \`sectionId\`.
- \`add_section\`: create a new section with its own \`grid.y\`, and optionally create that section's initial panels (markdown, attachment, or inline visualization) with \`panels\`. Those nested panel grids are section-relative and do not need a \`sectionId\`.
- \`remove_section\`: remove a section by \`id\` with \`panelAction: "promote" | "delete"\`.
- \`remove_panels\`: remove existing panels by \`id\`.

After a successful call:
- Render only the final dashboard attachment inline, as the last part of your response, after any text. Never render individual visualization attachments during dashboard composition.
- Remember \`data.dashboardAttachment.id\` for follow-up updates.
- Use returned \`id\` values for future panel removals.
- Use returned \`sectionId\` values for future section-targeted changes.
- If \`data.failures\` is present, explain which panel creations failed and report each returned \`type\`, \`identifier\`, and \`error\`.

## Attachments

- A visualization attachment is a previously created visualization artifact identified by \`attachmentId\`.
- \`add_panels\` with \`kind: "attachment"\` consumes those visualization attachment IDs and turns them into dashboard panels.
- \`add_panels\` with \`kind: "visualization"\` and \`edit_panels\` with \`kind: "visualization"\` work directly on dashboard panels and do not create standalone visualization attachments.
- A successful dashboard call returns a dashboard attachment in \`data.dashboardAttachment\`.
- Use \`data.dashboardAttachment.id\` as \`dashboardAttachmentId\` when updating that dashboard later.
- Never invent \`dashboardAttachmentId\`, \`id\`, or \`sectionId\`. Reuse the values returned by prior tool results.

${dashboardDesignGuidancePrompt}

## Edge Cases

- If a visualization attachment is missing or cannot be resolved, do not invent a replacement attachment ID. Call the tool only with valid attachment IDs and report unresolved attachments clearly.
- If the user asks to update a dashboard but the latest \`dashboardAttachmentId\` is not available in conversation context, ask which dashboard they mean or offer to create a new one.
- Use \`update_panel_layouts\` when the user wants to resize, reposition, or move panels without changing panel content.
- If a user wants to change a dashboard panel's content, prefer \`edit_panels\` over removing and re-adding the panel. \`edit_panels\` works for ES|QL-backed Lens visualization panels (\`kind: "visualization"\`) and markdown panels (\`kind: "markdown"\`).
- Attached dashboards can include DSL-based, form-based, or other non-ES|QL Lens panels. Do not attempt to edit those panels directly.
- If the user asks to modify a DSL visualization or any other non-ES|QL panel, explicitly explain that direct editing is not supported, propose recreating and replacing it as a new ES|QL-based Lens chart, and ask for confirmation before you remove or replace the existing panel.
- Never silently follow a remove-and-recreate flow for a non-ES|QL panel. Wait for explicit user confirmation before calling \`remove_panels\`, \`add_panels\`, or any other replacement operations.
- If the tool returns partial failures, explain which panel creations failed and include the reported \`type\`, \`identifier\`, and \`error\` for each one.
`,
  getInlineTools: () => [manageDashboardTool()],
});
