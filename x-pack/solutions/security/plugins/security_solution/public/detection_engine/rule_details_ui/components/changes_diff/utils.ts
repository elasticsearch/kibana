/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { IGNORED_DIFF_FIELDS } from '../../utils/extract_changed_field_names';

export function reconstructBefore(
  after: Record<string, unknown>,
  oldValues: Record<string, unknown>
): Record<string, unknown> {
  const before = { ...after };

  for (const [key, val] of Object.entries(oldValues)) {
    if (!IGNORED_DIFF_FIELDS.has(key)) {
      if (val === null) {
        delete before[key];
      } else {
        before[key] = val;
      }
    }
  }

  return before;
}
