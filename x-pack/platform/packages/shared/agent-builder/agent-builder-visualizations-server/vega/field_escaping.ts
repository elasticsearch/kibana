/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Vega(-Lite) interprets a dot in a field reference as a nested-property accessor,
 * so an ES|QL column such as `host.name` would be read as `name` inside `host`.
 * Escaping the dots (`host\.name`) makes Vega treat the whole string as a flat
 * field name, which is what ES|QL result columns always are.
 */

// Matches a dot that is not already escaped with a preceding backslash.
const UNESCAPED_DOT = /(?<!\\)\./g;

const escapeFieldName = (name: string): string => name.replace(UNESCAPED_DOT, '\\.');

/**
 * Walk a Vega-Lite spec and escape dots in every `field` reference so flat ES|QL
 * column names containing dots are not misread as nested paths. Returns a new
 * object; the input is not mutated.
 */
export const escapeVegaFieldReferences = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => escapeVegaFieldReferences(item)) as unknown as T;
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'field' && typeof item === 'string') {
        result[key] = escapeFieldName(item);
      } else {
        result[key] = escapeVegaFieldReferences(item);
      }
    }
    return result as T;
  }

  return value;
};
