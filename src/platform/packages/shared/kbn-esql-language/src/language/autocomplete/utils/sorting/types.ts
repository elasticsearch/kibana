/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export enum SuggestionCategory {
  CUSTOM_ACTION = 'custom_action',
  PROMQL_METRIC_QUALIFIER = 'promql_metric_qualifier', // PromQL label selector {}, range selector [5m]
  LANGUAGE_KEYWORD = 'language_keyword', // BY, WHERE, ON, WITH, AS
  CONSTANT_VALUE = 'constant_value', // Prompt text, query text constants
  USER_DEFINED_COLUMN = 'user_defined_column',
  TIME_PARAM = 'time_param',
  RECOMMENDED_FIELD = 'recommended_field',
  LOOKUP_COMMON_FIELD = 'lookup_common_field',
  ECS_FIELD = 'ecs_field',
  TIME_FIELD = 'time_field',
  FIELD = 'field',

  OPERATOR = 'operator', // All operators

  FUNCTION_TIME_SERIES_AGG = 'function_ts_agg',
  FUNCTION_AGG = 'function_agg',
  FUNCTION_SCALAR = 'function_scalar',

  COMMAND = 'command', // Source commands (FROM, etc.)

  RECOMMENDED_QUERY_WITH_PRIORITY = 'recommended_query_with_priority', // Search query (highest priority recommended query)
  RECOMMENDED_QUERY = 'recommended_query',

  VALUE = 'value', // METADATA, settings, special keywords
  SUBQUERY = 'subquery', // (FROM ...) subquery
  NEW_LINE = 'new_line',
  PIPE = 'pipe',
  COMMA = 'comma',
  UNKNOWN = 'unknown',
}

export interface SortingContext {
  command: string;
  /** Optional specific location/clause within the command (e.g., 'BY' for STATS BY clause) */
  location?: string;
}
