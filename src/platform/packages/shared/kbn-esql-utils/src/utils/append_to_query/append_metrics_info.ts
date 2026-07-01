/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BasicPrettyPrinter, Parser, Walker } from '@elastic/esql';
import { hasTransformationalCommand, getLimitFromESQLQuery } from '../query_parsing_helpers';
import { appendToESQLQuery, escapeStringValue } from './utils';
import { sanitazeESQLInput } from '../sanitaze_input';

const METRICS_INFO_SUFFIX = ' | METRICS_INFO';

/**
 * Appends "| METRICS_INFO" to an ES|QL query if it has no transformational commands.
 * SORT is removed; LIMIT, if present, is re-appended at the end.
 * When `dimensions` are provided, two filters are added: a pre-METRICS_INFO
 * `WHERE ... IS NOT NULL` (document-level) and a post-METRICS_INFO
 * `WHERE MV_CONTAINS(dimension_fields, ...)` so only metrics that declare every
 * selected dimension are returned.
 * @param esql the ES|QL query.
 * @param dimensions selected dimension field names to filter by.
 * @returns the query with "| METRICS_INFO" added, or an empty string if not allowed.
 */
export function buildMetricsInfoQuery(esql?: string, dimensions?: string[]): string {
  const trimmed = esql?.trim();
  if (!trimmed) {
    return '';
  }

  if (hasTransformationalCommand(trimmed)) {
    return '';
  }

  const { errors, root } = Parser.parse(trimmed);
  if (errors.length > 0) {
    return '';
  }

  // Avoid double append
  const hasMetricsInfo =
    Walker.matchAll(root, { type: 'command', name: 'metrics_info' }).length > 0;
  if (hasMetricsInfo) {
    return trimmed;
  }

  const hasLimit = Walker.matchAll(root, { type: 'command', name: 'limit' }).length > 0;
  // Remove sort cause sorting for METRICS_INFO the user needs to pass only the fields from METRICS_INFO response
  const baseCommands = root.commands.filter((cmd) => cmd.name !== 'sort' && cmd.name !== 'limit');
  const baseQuery = BasicPrettyPrinter.print({ ...root, commands: baseCommands }).trim();

  // Wrap dimensions in TO_STRING() to prevent verification_exception when a dimension
  // field has conflicting type mappings across data streams (e.g., keyword in one index,
  // long in another). TO_STRING resolves the type ambiguity for the IS NOT NULL check.
  // See: https://www.elastic.co/docs/reference/query-languages/esql/esql-multi-index
  const nonNullDimensionFilter =
    dimensions
      ?.map((dimension) => `TO_STRING(${sanitazeESQLInput(dimension)}) IS NOT NULL`)
      .join(' AND ') ?? [];

  const esqlQuery = appendToESQLQuery(
    baseQuery,
    nonNullDimensionFilter?.length > 0 ? `| WHERE ${nonNullDimensionFilter}` : ''
  );

  // The pre-METRICS_INFO filter narrows documents. This post-METRICS_INFO filter
  // guarantees each returned metric declares every selected dimension.
  const declaredDimensionFilter =
    dimensions
      ?.map((dimension) => `MV_CONTAINS(dimension_fields, ${escapeStringValue(dimension)})`)
      .join(' AND ') ?? [];
  const declaredDimensionFilterSuffix =
    declaredDimensionFilter?.length > 0 ? ` | WHERE ${declaredDimensionFilter}` : '';

  const limitSuffix = hasLimit ? ` | LIMIT ${getLimitFromESQLQuery(trimmed)}` : '';
  return `${esqlQuery}${METRICS_INFO_SUFFIX}${declaredDimensionFilterSuffix}${limitSuffix}`;
}
