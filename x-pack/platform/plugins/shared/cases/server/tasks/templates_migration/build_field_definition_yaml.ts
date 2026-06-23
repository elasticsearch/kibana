/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { stringify as stringifyYaml } from 'yaml';
import { CustomFieldTypes } from '../../../common/types/domain/custom_field/v1';
import { FieldType } from '../../../common/types/domain/template/fields';

interface LegacyCustomField {
  key: string;
  type: string;
  label: string;
  required: boolean;
  defaultValue?: string | number | boolean | null;
}

/**
 * Builds a YAML string for a single FieldSchema entry from a legacy custom field configuration.
 * The returned `name` matches the legacy `key` so that per-case `customField.key` references
 * remain meaningful in the v2 system.
 */
export const buildFieldDefinitionYaml = (
  legacy: LegacyCustomField
): { name: string; yaml: string } => {
  const { key, label, type, required, defaultValue } = legacy;

  const fieldDef: Record<string, unknown> = {
    name: key,
    label,
  };

  if (required) {
    fieldDef.validation = { required: true };
  }

  if (type === CustomFieldTypes.TEXT) {
    fieldDef.type = 'keyword';
    fieldDef.control = FieldType.INPUT_TEXT;
    if (defaultValue !== null && defaultValue !== undefined) {
      fieldDef.metadata = { default: String(defaultValue) };
    }
  } else if (type === CustomFieldTypes.NUMBER) {
    fieldDef.type = 'integer';
    fieldDef.control = FieldType.INPUT_NUMBER;
    if (defaultValue !== null && defaultValue !== undefined) {
      const asNum = Number(defaultValue);
      if (!Number.isNaN(asNum)) {
        fieldDef.metadata = { default: asNum };
      }
    }
  } else if (type === CustomFieldTypes.TOGGLE) {
    fieldDef.type = 'keyword';
    fieldDef.control = FieldType.SELECT_BASIC;
    fieldDef.metadata =
      defaultValue !== null && defaultValue !== undefined
        ? { options: ['true', 'false'], default: String(defaultValue) }
        : { options: ['true', 'false'] };
  } else {
    // Unknown type: store as plain keyword text field
    fieldDef.type = 'keyword';
    fieldDef.control = FieldType.INPUT_TEXT;
  }

  return { name: key, yaml: stringifyYaml(fieldDef, { lineWidth: 0 }) };
};
