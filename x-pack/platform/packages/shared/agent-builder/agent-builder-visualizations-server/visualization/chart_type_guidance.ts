/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import { chartTypeRegistry } from './chart_type_registry';

export const getChartTypeSelectionPromptContent = () =>
  [
    'Available chart types:',
    ...Object.entries(chartTypeRegistry).map(
      ([chartType, { prompt }]) => `- ${chartType}: ${prompt.selection.description}`
    ),
    '',
    'Guidelines:',
    ...Object.entries(chartTypeRegistry).map(([, { prompt }]) => `- ${prompt.selection.guideline}`),
    "- Consider the user's intent and the nature of the data being visualized",
  ].join('\n');

export const getChartTypeConfigPromptContent = (chartType: SupportedChartType) => {
  const perChartTypeRules = chartTypeRegistry[chartType].prompt.config?.perChartTypeRules;

  if (!perChartTypeRules?.length) {
    return '';
  }

  return [
    `CHART-SPECIFIC RULES FOR ${chartType.toUpperCase()}:`,
    ...perChartTypeRules.map((rule) => `- ${rule}`),
  ].join('\n');
};
