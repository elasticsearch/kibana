/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { platformCoreTools } from '@kbn/agent-builder-common';
import { generateDashboardTool } from '../tools';
import { dashboardTools } from '../../common';

export const aiPanelAuthoringSkill = defineSkillType({
  id: 'ai-panel-authoring',
  name: 'ai-panel-authoring',
  basePath: 'skills/platform/dashboard',
  description:
    'Creates AI-generated dashboard panels for content that is not chart-based: KPI cards, status boards, mixed text-and-data layouts, narrative summaries. Use only when neither Lens (standard charts) nor Vega (complex/custom charts) is appropriate.',
  content: `## Panel type decision tree

Three panel types exist. Pick the right one before calling this skill:

| Content type | Use |
|---|---|
| Standard charts — bar, line, area, pie, histogram, data table, metric | \`type: "vis"\` (Lens) via dashboard-management skill |
| Complex or custom charts — sankey, treemap, radar, word cloud, funnel, network graph, bubble chart, gauge, calendar heatmap | \`type: "vega"\` via vega skill |
| Non-chart content — KPI cards, status boards, color-coded health indicators, mixed text-and-data layouts, narrative panels, anything that is not fundamentally a chart | \`type: "ai_panel"\` — **this skill** |

Do **not** use \`type: "ai_panel"\` for anything that Lens or Vega can produce. It is the last resort for content that does not fit a chart primitive.

## When \`type: "ai_panel"\` is the right choice

- KPI cards or metric summaries with custom styling or conditional coloring
- Status boards (e.g. green/yellow/red health per category)
- Mixed layouts combining text, numbers, and visual elements in one panel
- Departure-board or table-style panels with custom row coloring
- Narrative or annotation panels that reference live data
- Any panel the user explicitly describes as a layout, card, or board rather than a chart

## Panel Schema

\`\`\`json
{
  "source": "config",
  "type": "ai_panel",
  "config": {
    "prompt": "Describe exactly what to render — layout, data shape, visual style, color scheme.",
    "esqlQuery": "FROM index | STATS ... | LIMIT 10"
  },
  "grid": { "x": 0, "y": 0, "w": 24, "h": 8 }
}
\`\`\`

- \`config.prompt\` (required): be specific. Bad: "show error counts". Good: "A status board with one card per service. Card background: green if error_rate < 1%, yellow if < 5%, red otherwise."
- \`config.esqlQuery\` (optional): live data context. Generate with \`${platformCoreTools.generateEsql}\` when the panel should reflect real index data.

## Core Instructions

### Step 1 — Confirm this is not a chart

Only proceed with \`type: "ai_panel"\` if the content cannot be expressed as a Lens chart or a Vega visualisation. If in doubt, prefer Lens or Vega.

### Step 2 — Decide if live data is needed

If the panel should reflect real index data, use \`${platformCoreTools.generateEsql}\` to produce the ES|QL query, then pass it as \`config.esqlQuery\`.

If the panel is static (hardcoded values, welcome card, layout), omit \`esqlQuery\`.

### Step 3 — Build the dashboard

Call \`${dashboardTools.generateDashboard}\` with:
- A \`set_metadata\` operation first (title + description)
- An \`add_panels\` operation with the panel items

You may mix \`type: "ai_panel"\`, \`type: "vis"\` (Lens), \`type: "vega"\`, and \`type: "markdown"\` in the same \`add_panels\` call.

The connector is resolved automatically — do not ask the user for a connector ID.
`,
  getInlineTools: () => [generateDashboardTool()],
  getRegistryTools: () => [platformCoreTools.generateEsql, platformCoreTools.executeEsql],
});
