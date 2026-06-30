/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Painless field access utilities for `field_access_pattern: 'flexible'`.
// Which uses flat keys (e.g., 'a.b.c') for both reading and writing.

/**
 * Accessor for reading field values using flexible dot-notation.
 *
 * @example
 * painlessFieldAccessor('order.total') -> "$('order.total', null)"
 */
export function painlessFieldAccessor(field: string, defaultValue: string = 'null'): string {
  return `$('${field}', ${defaultValue})`;
}

/**
 * Accessor for writing field values using flat key notation.
 * Uses single bracket with the full dotted path to create flat keys,
 * consistent with how $() reads them.
 *
 * @example
 * painlessFieldAssignment('order.total') -> "ctx['order.total']"
 */
export function painlessFieldAssignment(field: string): string {
  return `ctx['${field}']`;
}

/**
 * Setter for writing field values via the Painless Field API.
 *
 * Unlike `painlessFieldAssignment` (which mutates `ctx` with a literal dotted
 * key), `field('a.b.c').set(value)` resolves the path with the same
 * nested-then-flat algorithm as the `$()` reader. This keeps reads and writes
 * symmetric under `field_access_pattern: 'flexible'`, so a value written to a
 * nested target (e.g. `attributes.app.action.duration_nano`) lands inside the
 * existing `attributes` object where downstream `$()` reads look for it.
 *
 * @example
 * painlessFieldSetter('order.total', 'extracted_0') -> "field('order.total').set(extracted_0)"
 */
export function painlessFieldSetter(field: string, valueExpr: string): string {
  return `field('${field}').set(${valueExpr})`;
}
