/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Parser } from '@elastic/esql';

/**
 * Returns a FROM-only query (e.g. `FROM logs-*`) extracted from a full ES|QL
 * pipeline. Used for index-level field lookups such as resolving the time field.
 */
export function extractFromSourceQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const { root } = Parser.parse(trimmed);
    const fromCmd = root.commands.find((c) => c.name === 'from' || c.name === 'ts');
    if (!fromCmd) {
      return '';
    }

    return trimmed.slice(fromCmd.location.min, fromCmd.location.max + 1).trim();
  } catch {
    const match = trimmed.match(/^\s*(FROM\s+[^|]+)/i);
    return match ? match[1].trim() : '';
  }
}
