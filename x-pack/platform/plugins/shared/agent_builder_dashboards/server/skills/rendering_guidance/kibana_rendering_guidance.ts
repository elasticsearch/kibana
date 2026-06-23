/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { attachmentTools } from '@kbn/agent-builder-common';
import { DASHBOARD_ATTACHMENT_TYPE } from '@kbn/agent-builder-dashboards-common';
import { dashboardTools } from '../../../common';
import type { DashboardGuidanceModule } from '../guidance_module';

const guidance = `## Kibana Workflow

In Kibana, a dashboard request follows three stages: resolve inputs, generate (which also persists), then render.

1. **Resolve inputs**:
   - To work with a saved dashboard, search for it with \`platform.core.sml_search\`, then attach it with \`platform.core.sml_attach\` using the exact \`chunk_id\` from the search result. The attached \`${DASHBOARD_ATTACHMENT_TYPE}\` attachment is your editable working copy; pass its \`attachment_id\` to generation as \`dashboardAttachmentId\`.
   - To put an existing visualization onto a dashboard, read that visualization attachment's content with \`${attachmentTools.read}\` and pass its configuration as a \`source: "config"\` panel input (with panel \`type: "vis"\` and \`config\`). The generation core never reads attachments itself, so the visualization config must be passed by value here.
2. **Generate** (persists automatically):
   - Call ${dashboardTools.generateDashboard} with \`dashboardAttachmentId\` set to the dashboard you are editing (omit it for a new dashboard) and your batched \`operations\`. The tool reads the current payload from that reference, applies the operations, and persists the result as a \`${DASHBOARD_ATTACHMENT_TYPE}\` attachment for you.
   - It returns \`data.attachment_id\`, \`data.version\`, a compact \`data.dashboard\` summary, and optional \`data.failures\`. Do **not** pass the dashboard payload back into any tool — reference \`data.attachment_id\` instead.
3. **Render**:
   - Render the persisted attachment inline with a render-attachment tag using the returned \`attachment_id\` and \`version\`:
     \`<render_attachment id="{attachment_id}" version="{version}" />\`

## Discovering Dashboards

- When a user asks what dashboards are available, search with \`platform.core.sml_search\`.
- Use specific keywords from the user's request. For a broad listing, you may use \`keywords: ["*"]\`.
- Summarize matches in plain language by title and description, and include lightweight structure when available such as panel and section counts.
- Do **not** attach dashboards by default when only listing or comparing available dashboards.

## After Rendering

- Render only the final dashboard attachment inline, as the last part of your response, after any text. Never render individual visualization attachments during dashboard composition.
- Remember the dashboard's \`attachment_id\`. On later updates, pass the same \`attachment_id\` back as \`dashboardAttachmentId\` so generation edits the existing dashboard in place.
- Use returned panel \`id\` values for future panel removals, and section \`id\` values for future section-targeted changes.
- Never invent an \`attachment_id\`, panel \`id\`, or \`sectionId\`. Reuse values returned by prior tool results.
- If the generation result includes \`data.failures\`, explain which panel creations failed and report each returned \`type\`, \`identifier\`, and \`error\`.

## Rendering Edge Cases

- If the user asks to update a dashboard but no \`attachment_id\` is available in conversation context, ask which dashboard they mean or offer to create a new one.
- If generation fails, surface the returned error message rather than retrying blindly.`;

export const kibanaRendering: DashboardGuidanceModule = {
  guidance,
};
