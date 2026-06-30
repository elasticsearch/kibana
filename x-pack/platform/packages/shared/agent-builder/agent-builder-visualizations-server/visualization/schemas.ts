/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import parse from 'joi-to-json';
import type { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import { chartTypeRegistry } from './chart_type_registry';

/**
 * Matches descriptions that carry constraint or usage info worth keeping
 * in the LLM prompt (numbers, ranges, defaults, examples, units).
 * Everything else (e.g. "Label for the operation") is stripped to save tokens.
 */
const USEFUL_DESCRIPTION_RE =
  /(\d|default|e\.g\.|i\.e\.|example|must|between|minimum|maximum|at least|at most|up to|pixels|millisecond|factor|typical|legacy|truncat)/i;

const trimSchemaDescriptions = (node: unknown): unknown => {
  if (Array.isArray(node)) {
    return node.map(trimSchemaDescriptions);
  }
  if (node !== null && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (
        key === 'description' &&
        typeof value === 'string' &&
        !USEFUL_DESCRIPTION_RE.test(value)
      ) {
        continue;
      }
      result[key] = trimSchemaDescriptions(value);
    }
    return result;
  }
  return node;
};

const jsonSchemas = Object.fromEntries(
  Object.entries(chartTypeRegistry).map(([chartType, { schema }]) => [
    chartType,
    trimSchemaDescriptions(parse(schema.getSchema())) as object,
  ])
) as Record<SupportedChartType, object>;

export const getSchemaForChartType = (chartType: SupportedChartType): object =>
  jsonSchemas[chartType];
