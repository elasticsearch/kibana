/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InlineField, RefField } from './fields';
import { FieldType, isInlineField } from './fields';
import { evaluateCondition } from './evaluate_conditions';
import { getFieldSnakeKey } from '../../../utils';

const validatePattern = (
  label: string,
  value: string,
  validation: InlineField['validation'],
  errors: string[]
): void => {
  if (!validation?.pattern) return;
  const { regex, message } = validation.pattern;
  try {
    if (!new RegExp(regex).test(value)) {
      errors.push(message ?? `Field "${label}" does not match pattern ${regex}`);
    }
  } catch {
    // invalid regex in template definition — skip silently
  }
};

const validateLengthConstraints = (
  label: string,
  value: string,
  validation: InlineField['validation'],
  errors: string[]
): void => {
  if (validation?.min_length !== undefined && value.length < validation.min_length) {
    errors.push(`Field "${label}" must be at least ${validation.min_length} characters`);
  }
  if (validation?.max_length !== undefined && value.length > validation.max_length) {
    errors.push(`Field "${label}" must be at most ${validation.max_length} characters`);
  }
};

const validateNumericConstraints = (
  label: string,
  value: string,
  validation: InlineField['validation'],
  errors: string[]
): void => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    errors.push(`Field "${label}" must be a number`);
    return;
  }
  if (validation?.min !== undefined && num < validation.min) {
    errors.push(`Field "${label}" must be >= ${validation.min}`);
  }
  if (validation?.max !== undefined && num > validation.max) {
    errors.push(`Field "${label}" must be <= ${validation.max}`);
  }
};

const validateOptions = (
  label: string,
  value: string,
  options: string[],
  errors: string[]
): void => {
  if (!options.includes(value)) {
    errors.push(`Field "${label}" must be one of: ${options.join(', ')}`);
  }
};

const validateCheckboxGroupOptions = (
  label: string,
  value: string,
  options: string[],
  errors: string[]
): void => {
  try {
    const selected: unknown = JSON.parse(value);
    if (!Array.isArray(selected)) return;
    const invalid = (selected as unknown[]).filter((v) => !options.includes(String(v)));
    if (invalid.length > 0) {
      errors.push(`Field "${label}" contains invalid options: ${invalid.join(', ')}`);
    }
  } catch {
    // malformed JSON — skip silently
  }
};

const validateField = (field: InlineField, value: string, errors: string[]): void => {
  const label = field.label ?? field.name;

  validatePattern(label, value, field.validation, errors);

  if (field.control === FieldType.INPUT_TEXT || field.control === FieldType.TEXTAREA) {
    validateLengthConstraints(label, value, field.validation, errors);
  } else if (field.control === FieldType.INPUT_NUMBER) {
    validateNumericConstraints(label, value, field.validation, errors);
  } else if (field.control === FieldType.SELECT_BASIC || field.control === FieldType.RADIO_GROUP) {
    validateOptions(
      label,
      value,
      (field.metadata as { options?: string[] })?.options ?? [],
      errors
    );
  } else if (field.control === FieldType.CHECKBOX_GROUP) {
    validateCheckboxGroupOptions(
      label,
      value,
      (field.metadata as { options?: string[] })?.options ?? [],
      errors
    );
  }
};

export const validateExtendedFields = (
  extendedFields: Record<string, string>,
  fields: Array<RefField | InlineField>,
  { partial = false, onClose = false }: { partial?: boolean; onClose?: boolean } = {}
): string[] => {
  const errors: string[] = [];
  const inlineFields = fields.filter(isInlineField);

  // 1. Build valid key set
  const validKeys = new Set(inlineFields.map((f) => getFieldSnakeKey(f.name, f.type)));

  // 2. Unknown keys
  for (const key of Object.keys(extendedFields)) {
    if (!validKeys.has(key)) {
      errors.push(`Unknown extended field key: "${key}"`);
    }
  }

  // 3. Build helper maps
  const fieldValues: Record<string, string | undefined> = {};
  const fieldTypeMap: Record<string, string> = {};
  for (const field of inlineFields) {
    fieldValues[field.name] = extendedFields[getFieldSnakeKey(field.name, field.type)];
    fieldTypeMap[field.name] = field.type;
  }

  // 4. Per-field validation
  for (const field of inlineFields) {
    const isHidden =
      field.display?.show_when != null &&
      !evaluateCondition(field.display.show_when, fieldValues, fieldTypeMap);

    // In partial-update mode, skip fields not present in the request — the server
    // merges them so an absent key retains its existing stored value.
    const value = fieldValues[field.name];
    if (!isHidden && !(partial && value === undefined)) {
      const isArrayField =
        field.control === FieldType.CHECKBOX_GROUP || field.control === FieldType.USER_PICKER;
      const isEmpty =
        value === undefined || value === null || value === '' || (isArrayField && value === '[]');

      const isRequired =
        field.validation?.required === true ||
        (field.validation?.required_when
          ? evaluateCondition(field.validation.required_when, fieldValues, fieldTypeMap)
          : false) ||
        (onClose && field.validation?.required_on_close === true);

      if (isRequired && isEmpty) {
        errors.push(`Field "${field.label ?? field.name}" is required`);
      } else if (!isEmpty) {
        validateField(field, value, errors);
      }
    }
  }

  return errors;
};
