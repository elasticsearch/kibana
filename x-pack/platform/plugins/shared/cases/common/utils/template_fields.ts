/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { camelCase } from 'lodash';
import { parse as parseYaml } from 'yaml';
import { FieldSchema, isInlineField } from '../types/domain/template/fields';
import type { InlineField } from '../types/domain/template/fields';
import type { FieldDefinition } from '../types/domain/field_definition/latest';

export const getFieldSnakeKey = (name: string, type: string): string => `${name}_as_${type}`;

export const getFieldCamelKey = (name: string, type: string): string =>
  camelCase(getFieldSnakeKey(name, type));

/**
 * Parses an array of field definitions into resolved inline fields, skipping any
 * definitions that are malformed or describe reference (non-inline) fields.
 */
export const parseFieldDefinitionsToInlineFields = (defs: FieldDefinition[]): InlineField[] => {
  const fields: InlineField[] = [];
  for (const fd of defs) {
    try {
      const parsed = parseYaml(fd.definition);
      const result = FieldSchema.safeParse(parsed);
      if (result.success && isInlineField(result.data)) {
        fields.push(result.data as InlineField);
      }
    } catch {
      // Ignore malformed definitions
    }
  }
  return fields;
};
