/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import { getChartTypeSelectionPromptContent } from '@kbn/agent-builder-tools-base';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';

const chartTypeSelectionContent = getChartTypeSelectionPromptContent();

export const visualizationCreationSkill = defineSkillType({
  id: 'visualization-creation',
  name: 'visualization-creation',
  basePath: 'skills/platform/visualization',
  description:
    'Create standalone or reusable visualizations from grounded index and field context.',
  content: `## When to Use This Skill

Use this skill when:
- A user asks for one or more standalone visualizations (chart, metric, trend, breakdown, distribution).
- You explicitly want a reusable visualization attachment ID for later use.
- A user asks to update an existing visualization by attachment ID.

Do **not** use this skill when:
- The user only needs raw documents or table/query output without a visualization.
- The user first needs broad data discovery and exploration across unknown sources.
- The request is about persisted saved objects instead of in-memory attachment workflows.
- The primary goal is to compose or update a dashboard. Use the dashboard-management skill for dashboard panel creation and layout.

## Available Tools

- **${
    platformCoreTools.createVisualization
  }**: Create or update visualization configurations and return \`attachment_id\` when persistence succeeds.
- **${
    platformCoreTools.generateEsql
  }**: Generate ES|QL for complex requests before visualization creation.
- **${platformCoreTools.executeEsql}**: Validate ES|QL and inspect sample result shape.

## Visualization Creation Workflow

1. **Ensure grounded index and field context**
   - If index and fields are already known in context, continue directly.
   - If not, explore the data first to discover the right index and validate field names. Always use real field names from the index mapping, not invented ones.

2. **Prepare visualization intent**
   - For simple requests, pass natural language directly to ${
     platformCoreTools.createVisualization
   }.
   - For complex aggregations or joins, use ${platformCoreTools.generateEsql}.
   - Optionally run ${
     platformCoreTools.executeEsql
   } to validate result shape before visualization creation.

3. **Call ${platformCoreTools.createVisualization}**
   - Provide:
     - \`query\` (required, specific and field-accurate)
     - \`index\` (recommended)
     - \`chartType\` (optional, only if confident)
     - \`esql\` (optional, when you have a validated ES|QL)
     - \`attachment_id\` (optional, only when updating an existing visualization)
   - For multi-panel requests, call ${
     platformCoreTools.createVisualization
   } once per requested panel.

4. **Interpret output and preserve artifacts**
   - Save successful \`data.attachment_id\` values for follow-up operations.
   - If the tool returns \`data.attachment_id\`, include that ID in your response so the visualization attachment can be rendered in the conversation.
   - If \`attachment_id\` is missing, report that persistence failed and treat the result as non-reusable.

## Inline Rendering Guidelines

- **When creating standalone visualizations** (i.e. the user directly asked for a chart or visualization), render each visualization attachment inline so the user can see and interact with it immediately.
- **When creating visualizations as intermediate reusable artifacts** for a later workflow, do NOT render individual visualization attachments inline unless the user asked to inspect them. Only the final composed artifact should be rendered. Rendering intermediate visualizations clutters the conversation.

## Writing Effective Visualization Prompts

Good prompt patterns:
- "Show average system.cpu.total.pct over time grouped by host.name"
- "Display top 10 source.ip values by document count as a bar chart"
- "Show a single metric for error log count where log.level is error"

Poor prompt patterns:
- "Show CPU"
- "Make a chart"
- "Display everything"

Always reference real fields from the index mapping.

## Chart Type Guidance

Supported values for \`chartType\`: ${Object.values(SupportedChartType).join(', ')}.

${chartTypeSelectionContent}

When uncertain, omit \`chartType\` and let ${
    platformCoreTools.createVisualization
  } infer the best type from the request.

## Edge Cases

- **Requested field missing:** suggest nearest valid fields from the index mapping.
- **ES|QL returns no data:** explain and suggest broader time range/filters.
- **Unsupported chart request:** pick closest supported type and explain the substitution.
`,
  referencedContent: [
    {
      relativePath: './examples',
      name: 'create-visualization-requests',
      content: `# create_visualization Request Examples

## Create a new visualization

\`\`\`json
{
  "query": "Show average system.cpu.total.pct over time grouped by host.name",
  "index": "metrics-system.cpu-default",
  "chartType": "xy"
}
\`\`\`

## Create using pre-generated ES|QL

\`\`\`json
{
  "query": "Top 10 source IPs by request count",
  "index": "logs-nginx.access-default",
  "esql": "FROM logs-nginx.access-default | STATS requests = COUNT(*) BY source.ip | SORT requests DESC | LIMIT 10"
}
\`\`\`

## Update an existing visualization attachment

\`\`\`json
{
  "attachment_id": "viz-attachment-123",
  "query": "Update this chart to show 95th percentile response bytes over time",
  "index": "logs-nginx.access-default",
  "chartType": "xy"
}
\`\`\`
`,
    },
  ],
  getRegistryTools: () => [
    platformCoreTools.generateEsql,
    platformCoreTools.executeEsql,
    platformCoreTools.createVisualization,
  ],
});
