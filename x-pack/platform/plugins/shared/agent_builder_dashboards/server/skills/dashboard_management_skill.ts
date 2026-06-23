/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { generateDashboardTool } from '../tools';
import { dashboardGeneration } from './generation_guidance';
import { kibanaRendering } from './rendering_guidance';

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

${dashboardGeneration.guidance}

${kibanaRendering.guidance}
`,
  referencedContent: [
    ...(dashboardGeneration.referencedContent ?? []),
    ...(kibanaRendering.referencedContent ?? []),
  ],
  getInlineTools: () => [generateDashboardTool()],
});
