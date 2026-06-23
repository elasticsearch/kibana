/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { dashboardTools } from '../../../common';
import type { DashboardGuidanceModule } from '../guidance_module';
import { dashboardDesignGuidancePrompt } from './design';

const guidance = `## Building a Dashboard

The ${dashboardTools.generateDashboard} tool builds the resulting dashboard from the current dashboard (if any) plus an ordered \`operations\` array. This section describes the \`operations\` vocabulary; see the environment workflow below for how the current dashboard is referenced and how the result is surfaced.

Every dashboard MUST have a non-empty \`title\`. If the current dashboard's title is empty, missing, or \`"User Dashboard"\`, your first operation MUST be \`set_metadata\` with a title you invent from its contents.

Operations run in order, so earlier operations should set up state needed by later ones. Batch all operations into a single ${dashboardTools.generateDashboard} call whenever possible.

When a dashboard needs sections, prefer a single batched call:
1. Use \`add_section\` with its optional \`panels\` array when you already know the panels that belong in the new section.
2. Use a follow-up \`add_panels\` with per-item \`sectionId\` only when you need to target an existing section returned by an earlier tool result.

For a new dashboard:
- Start with \`set_metadata\` and provide both \`title\` and \`description\`. Include \`time_range\` if the user specified a time window.
- Use \`add_panels\` to add panels in one batched operation. A single \`add_panels\` call may mix panel kinds and target different \`sectionId\` values, so batch related panels together.
- Use \`add_section\` when panels naturally group into distinct topics or the dashboard is large enough that sections improve scanability. Include \`panels\` on the section when you can create that section's initial panels immediately.

For an existing dashboard:
- Prefer \`edit_panels\` to change existing panel content in place rather than removing and re-adding a panel.
- If a requested change targets a DSL, form-based, or other non-ES|QL Lens visualization panel, explicitly tell the user direct editing is not supported and ask for confirmation before replacing that panel with a newly created ES|QL-based Lens panel.
- Use \`update_panel_layouts\` to resize, reposition, or move existing panels between top-level and sections without changing panel content.

## Panel Inputs

- Use \`source: "request"\` to create or edit a Lens panel from a natural-language / ES|QL query — this is the only correct way to make a **new** visualization. Never hand-build a Lens \`config\` for a new visualization.
- Use \`source: "config"\` only for content you have already resolved (an existing visualization's config, or markdown). The generation tool never reads an attachment or saved-object store, so the config must be supplied directly.

${dashboardDesignGuidancePrompt}

## ES|QL

Omit the \`esql\` field on visualization panels unless you received a validated query from a prior tool result or the user pasted one explicitly. Do not write or derive ES|QL yourself — the tool generates it from the natural language \`query\`.

## Generation Edge Cases

- Never invent a \`source: "config"\` payload for content you have not actually resolved. If you cannot obtain a panel's configuration, report it clearly instead of fabricating one.
- Use \`update_panel_layouts\` when the user wants to resize, reposition, or move panels without changing panel content.
- If a user wants to change a dashboard panel's content, prefer \`edit_panels\` over removing and re-adding the panel. \`edit_panels\` works for ES|QL-backed Lens visualization panels (\`source: "request"\`) and markdown panels (\`source: "config"\`, \`type: "markdown"\`).
- A dashboard can include DSL-based, form-based, or other non-ES|QL Lens panels. Do not attempt to edit those panels directly.
- If the user asks to modify a DSL visualization or any other non-ES|QL panel, explicitly explain that direct editing is not supported, propose recreating and replacing it as a new ES|QL-based Lens chart, and ask for confirmation before you remove or replace the existing panel.
- Never silently follow a remove-and-recreate flow for a non-ES|QL panel. Wait for explicit user confirmation before regenerating the dashboard with replacement operations.`;

/**
 * Environment-agnostic dashboard *generation* guidance.
 *
 * The `guidance` describes how to build a dashboard, including the detailed design guidance
 * (composition + panel layout) inlined directly. It deliberately says nothing about how the
 * current dashboard is referenced or how the result is returned/surfaced. Those are
 * environment-specific and avoided here so the block can be reused across environments. Pair it with
 * an environment-specific rendering guidance block (e.g. the Kibana one) that explains how the
 * generated dashboard is surfaced.
 */
export const dashboardGeneration: DashboardGuidanceModule = {
  guidance,
};
