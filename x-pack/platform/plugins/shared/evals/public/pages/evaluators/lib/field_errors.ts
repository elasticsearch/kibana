/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as i18n from '../translations';

export type FieldErrorKey =
  | 'name'
  | 'description'
  | 'systemPrompt'
  | 'prompt'
  | 'evidence'
  | 'referenceDataKeys'
  | 'scores';

export type FieldErrors = Partial<Record<FieldErrorKey, string>>;

export const FIELD_ERROR_MESSAGES: Record<FieldErrorKey, string> = {
  name: i18n.NAME_INVALID_ERROR,
  description: i18n.DESCRIPTION_INVALID_ERROR,
  systemPrompt: i18n.SYSTEM_PROMPT_INVALID_ERROR,
  prompt: i18n.PROMPT_INVALID_ERROR,
  evidence: i18n.EVIDENCE_INVALID_ERROR,
  referenceDataKeys: i18n.REFERENCE_KEYS_INVALID_ERROR,
  scores: i18n.SCORES_INVALID_ERROR,
};

/** Maps a draft schema issue back to the form field the user can act on. */
export const toFieldErrorKey = (path: ReadonlyArray<PropertyKey>): FieldErrorKey | undefined => {
  const [root, branch, leaf] = path.map(String);

  if (root === 'name' || root === 'description') {
    return root;
  }
  if (root !== 'judge') {
    return undefined;
  }
  if (branch === 'system_prompt') {
    return 'systemPrompt';
  }
  if (branch === 'prompt' || branch === 'evidence') {
    return branch;
  }
  if (branch === 'reference_data_keys') {
    return 'referenceDataKeys';
  }
  return branch === 'output' && leaf === 'scores' ? 'scores' : undefined;
};

/** Collects the first error per field so each row shows one actionable message. */
export const toFieldErrors = (
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>
): FieldErrors => {
  const fieldErrors: FieldErrors = {};
  for (const { path } of issues) {
    const key = toFieldErrorKey(path);
    if (key && !fieldErrors[key]) {
      fieldErrors[key] = FIELD_ERROR_MESSAGES[key];
    }
  }
  return fieldErrors;
};
