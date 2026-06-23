/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { stringify as yamlStringify } from 'yaml';
import {
  getFieldCamelKey,
  getFieldSnakeKey,
  parseFieldDefinitionsToInlineFields,
} from './template_fields';
import type { FieldDefinition } from '../types/domain/field_definition/latest';

describe('template field key utils', () => {
  describe('getFieldSnakeKey', () => {
    it('combines name and type with _as_', () => {
      expect(getFieldSnakeKey('risk_score', 'keyword')).toBe('risk_score_as_keyword');
    });

    it('handles single-word name and type', () => {
      expect(getFieldSnakeKey('severity', 'text')).toBe('severity_as_text');
    });

    it('handles multi-segment names', () => {
      expect(getFieldSnakeKey('my_custom_field', 'number')).toBe('my_custom_field_as_number');
    });
  });

  describe('getFieldCamelKey', () => {
    it('returns the camelCase version of the snake key', () => {
      expect(getFieldCamelKey('risk_score', 'keyword')).toBe('riskScoreAsKeyword');
    });

    it('handles single-word name and type', () => {
      expect(getFieldCamelKey('severity', 'text')).toBe('severityAsText');
    });

    it('handles multi-segment names', () => {
      expect(getFieldCamelKey('my_custom_field', 'number')).toBe('myCustomFieldAsNumber');
    });

    it('is consistent with camelCase applied to getFieldSnakeKey output', () => {
      const name = 'some_field';
      const type = 'date';
      const snakeKey = getFieldSnakeKey(name, type);
      expect(getFieldCamelKey(name, type)).toBe(
        snakeKey.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      );
    });
  });

  describe('parseFieldDefinitionsToInlineFields', () => {
    const makeDef = (
      overrides: Partial<FieldDefinition> & { defYaml?: object } = {}
    ): FieldDefinition => {
      const { defYaml, ...rest } = overrides;
      return {
        fieldDefinitionId: 'fd-1',
        name: 'my_field',
        owner: 'securitySolution',
        description: '',
        isGlobal: true,
        definition: yamlStringify(
          defYaml ?? { name: 'my_field', type: 'keyword', control: 'INPUT_TEXT', label: 'My Field' }
        ),
        ...rest,
      };
    };

    it('returns inline fields for valid definitions', () => {
      const fields = parseFieldDefinitionsToInlineFields([makeDef()]);
      expect(fields).toHaveLength(1);
      expect(fields[0].name).toBe('my_field');
    });

    it('returns an empty array for an empty input', () => {
      expect(parseFieldDefinitionsToInlineFields([])).toEqual([]);
    });

    it('skips definitions with malformed YAML', () => {
      const bad = makeDef({ definition: 'not: valid: yaml: [broken' });
      const good = makeDef({
        name: 'ok',
        definition: yamlStringify({
          name: 'ok',
          type: 'keyword',
          control: 'INPUT_TEXT',
          label: 'OK',
        }),
      });
      const fields = parseFieldDefinitionsToInlineFields([bad, good]);
      expect(fields).toHaveLength(1);
      expect(fields[0].name).toBe('ok');
    });

    it('skips definitions that fail FieldSchema validation', () => {
      const invalid = makeDef({ defYaml: { not_a_valid_field: true } });
      expect(parseFieldDefinitionsToInlineFields([invalid])).toHaveLength(0);
    });
  });
});
