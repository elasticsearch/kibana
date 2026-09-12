/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const CONTROL_CHARACTER_ERROR = i18n.translate(
  'utils.inputValueValidation.controlCharacterErrorMessage',
  {
    defaultMessage: 'Control characters prevent matching. Remove them and re-enter the value.',
  }
);

// C0 controls (incl. tab, LF, CR), DEL and C1 controls.
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F-\u009F]/;

/** Returns true when a value (or any array member) still contains a control character after trimming. */
export const hasControlCharacters = (value?: string | string[]): boolean => {
  if (value === undefined) {
    return false;
  }

  const values = Array.isArray(value) ? value : [value];

  return values.some((member) => CONTROL_CHARACTER_PATTERN.test(member.trim()));
};

/** Trims edge whitespace; array members that become empty are dropped. */
export const trimInputValues = (value: string | string[]): string | string[] => {
  if (Array.isArray(value)) {
    return value.map((member) => member.trim()).filter((member) => member.length > 0);
  }

  return value.trim();
};
