/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { platformCoreTools } from '@kbn/agent-builder-common';

export const changePointDetectionSkill = defineSkillType({
  id: 'change-point-detection',
  name: 'change-point-detection',
  basePath: 'skills/platform/visualization',
  description:
    'Detect statistical change points and abrupt trend shifts in time-series metrics using ES|QL CHANGE_POINT. Use when the user explicitly asks for change point analysis, sudden changes, or trend shifts over time.',
  content: `## When to Use This Skill

Use this skill only when the user explicitly asks about change points, sudden shifts, or abrupt trend breaks in a time-series metric. Do not activate for generic anomaly or data-analysis requests.

## Available Tools

- **${platformCoreTools.generateEsql}**: Generate a valid ES|QL query containing a CHANGE_POINT command.
- **${platformCoreTools.detectChangePoints}**: Execute the CHANGE_POINT query and render an annotated area chart per entity group.

## Workflow

1. **Build the query** — Use \`${platformCoreTools.generateEsql}\` to produce an ES|QL query ending with \`CHANGE_POINT <value> ON <time> [BY <entity>]\`. The query shape is documented in the \`${platformCoreTools.detectChangePoints}\` tool description.

2. **Run the analysis** — Call \`${platformCoreTools.detectChangePoints}\` with the query and an appropriate \`time_range\`. Do not set \`save_charts\` unless the user asks to save.

3. **Summarize results** — Report which entities showed change points and what type of change occurred (e.g. step_change, distribution_change). Mention the p-value as a confidence indicator.

## Saving Charts to a Dashboard

When the user asks to save a chart or add it to a dashboard, re-call \`${platformCoreTools.detectChangePoints}\` with \`save_charts: true\`. If the user wants only one specific entity, narrow the query with an entity filter and set \`max_charts: 1\` to create a single attachment. Charts that include an \`attachment_id\` in the result can be added to a dashboard via the existing composition flow.

## Constraints

- Only call \`${platformCoreTools.detectChangePoints}\` when the user explicitly requests change point analysis.
- The query must contain a top-level \`CHANGE_POINT\` command. \`FORK\`-based queries are not supported.
- If screen context shows \`query_language\` is not \`esql\`, ask the user to switch to ES|QL mode before proceeding.`,
  getRegistryTools: () => [platformCoreTools.generateEsql, platformCoreTools.detectChangePoints],
});
