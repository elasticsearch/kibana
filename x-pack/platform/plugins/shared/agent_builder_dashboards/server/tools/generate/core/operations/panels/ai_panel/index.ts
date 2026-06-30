/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { panelGridSchema } from '@kbn/agent-builder-dashboards-common';
import { z } from '@kbn/zod/v4';
import { definePanelType } from '../panel_type';

/**
 * AI panel — renders anything (KPI cards, status boards, custom charts)
 * from a natural-language prompt and an optional ES|QL query.
 */

export const aiPanelConfigSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(10000)
    .describe(
      'Describe exactly what the AI panel should render — chart type, data shape, visual style, color scheme. The LLM generates self-contained HTML.'
    ),
  esqlQuery: z
    .string()
    .max(1_000_000)
    .optional()
    .describe(
      '(optional) An ES|QL query whose results are passed as live data context when the panel renders.'
    ),
});

export const aiPanelConfigInputSchema = z.object({
  source: z.literal('config'),
  type: z.literal('ai_panel'),
  grid: panelGridSchema,
  config: aiPanelConfigSchema,
});

export const aiPanelDefinition = definePanelType({
  embeddableType: 'ai_panel',
});
