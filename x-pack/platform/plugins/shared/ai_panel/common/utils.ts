/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// @ is a common ES|QL field prefix (e.g. @timestamp) — convert to "_at_" so the resulting
// identifier preserves word boundaries wherever @ appears:
//   "@timestamp"  → "at_timestamp"  (@→_at_, leading _ then stripped by last replace)
//   "field@name"  → "field_at_name" (clean separator on both sides)
const AT_SIGN = /@/g;
// Any remaining non-alphanumeric characters become underscores.
const NON_ALPHANUMERIC = /[^a-zA-Z0-9]+/g;
// Clean up any leading/trailing underscores left by the replacements.
const LEADING_TRAILING_UNDERSCORES = /^_+|_+$/g;

/**
 * Normalizes an ES|QL column name to a valid Liquid template identifier.
 *
 * - `@` is converted to `_at_` so word boundaries are preserved in all positions.
 *   `@timestamp` → `at_timestamp`; `field@name` → `field_at_name`.
 * - All other non-alphanumeric characters (dots, hyphens, spaces, …) collapse to `_`.
 * - Leading/trailing underscores are stripped.
 *
 * Examples:
 *   "@timestamp"       → "at_timestamp"
 *   "category.keyword" → "category_keyword"
 *   "my-field name"    → "my_field_name"
 */
export const normalizeColumnName = (s: string): string =>
  s
    .replace(AT_SIGN, '_at_')
    .replace(NON_ALPHANUMERIC, '_')
    .replace(LEADING_TRAILING_UNDERSCORES, '');

/**
 * Maps an ordered list of column names to their normalized Liquid-safe keys.
 */
export const columnNamesToKeys = (columnNames: string[]): string[] =>
  columnNames.map(normalizeColumnName);
