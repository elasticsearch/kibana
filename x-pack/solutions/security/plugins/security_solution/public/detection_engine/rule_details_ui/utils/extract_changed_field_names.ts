/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleHistoryItem } from '../../../../common/api/detection_engine/rule_management';

/**
 * Rule field names that are excluded from the visible "changed fields" list
 * and from the diff view in the flyout. These are bookkeeping fields that
 * change on every rule write and would otherwise dominate the UI.
 */
export const IGNORED_DIFF_FIELDS: ReadonlySet<string> = new Set([
  'rule_source',
  'revision',
  'updated_at',
  'updated_by',
  'created_at',
  'created_by',
  'execution_summary',
  'meta',
]);

/**
 * Extract the list of changed-field names from a history item, stripping out
 * fields that should never be shown to the user. The source is the
 * `old_values` RFC 7396 merge patch — its top-level keys are exactly the
 * fields that differ between this revision and the previous one.
 */
export const extractChangedFieldNames = (
  item: Pick<RuleHistoryItem, 'old_values'>,
  ignored = IGNORED_DIFF_FIELDS
): string[] => {
  if (!item.old_values) {
    return [];
  }

  return Object.keys(item.old_values).filter((field) => !ignored.has(field));
};
