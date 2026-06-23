/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse as parseYaml } from 'yaml';
import { buildFieldDefinitionYaml } from './build_field_definition_yaml';
import { CustomFieldTypes } from '../../../common/types/domain/custom_field/v1';
import { FieldType } from '../../../common/types/domain/template/fields';

interface YamlField {
  name: string;
  label: string;
  type: string;
  control: string;
  validation?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

const parse = (yaml: string) => parseYaml(yaml) as YamlField;

describe('buildFieldDefinitionYaml', () => {
  describe('returned name', () => {
    it('equals the legacy key', () => {
      const { name } = buildFieldDefinitionYaml({
        key: 'my_key',
        label: 'My Label',
        type: CustomFieldTypes.TEXT,
        required: false,
      });
      expect(name).toBe('my_key');
    });
  });

  describe('TEXT custom field', () => {
    it('maps to keyword / INPUT_TEXT', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_text',
        label: 'Text Field',
        type: CustomFieldTypes.TEXT,
        required: false,
      });
      const parsed = parse(yaml);
      expect(parsed.name).toBe('cf_text');
      expect(parsed.label).toBe('Text Field');
      expect(parsed.type).toBe('keyword');
      expect(parsed.control).toBe(FieldType.INPUT_TEXT);
    });

    it('includes default value when present', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_text',
        label: 'Text Field',
        type: CustomFieldTypes.TEXT,
        required: false,
        defaultValue: 'hello',
      });
      expect(parse(yaml).metadata?.default).toBe('hello');
    });

    it('omits metadata when defaultValue is null', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_text',
        label: 'Text Field',
        type: CustomFieldTypes.TEXT,
        required: false,
        defaultValue: null,
      });
      expect(parse(yaml).metadata).toBeUndefined();
    });

    it('omits metadata when defaultValue is undefined', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_text',
        label: 'Text Field',
        type: CustomFieldTypes.TEXT,
        required: false,
      });
      expect(parse(yaml).metadata).toBeUndefined();
    });

    it('includes required validation when required is true', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_text',
        label: 'Text Field',
        type: CustomFieldTypes.TEXT,
        required: true,
      });
      expect(parse(yaml).validation?.required).toBe(true);
    });

    it('omits validation when required is false', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_text',
        label: 'Text Field',
        type: CustomFieldTypes.TEXT,
        required: false,
      });
      expect(parse(yaml).validation).toBeUndefined();
    });
  });

  describe('NUMBER custom field', () => {
    it('maps to integer / INPUT_NUMBER', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_number',
        label: 'Number Field',
        type: CustomFieldTypes.NUMBER,
        required: false,
      });
      const parsed = parse(yaml);
      expect(parsed.type).toBe('integer');
      expect(parsed.control).toBe(FieldType.INPUT_NUMBER);
    });

    it('includes numeric default value', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_number',
        label: 'Number Field',
        type: CustomFieldTypes.NUMBER,
        required: false,
        defaultValue: 42,
      });
      expect(parse(yaml).metadata?.default).toBe(42);
    });

    it('omits metadata when defaultValue is NaN after coercion', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_number',
        label: 'Number Field',
        type: CustomFieldTypes.NUMBER,
        required: false,
        defaultValue: 'not-a-number',
      });
      expect(parse(yaml).metadata).toBeUndefined();
    });

    it('omits metadata when defaultValue is null', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_number',
        label: 'Number Field',
        type: CustomFieldTypes.NUMBER,
        required: false,
        defaultValue: null,
      });
      expect(parse(yaml).metadata).toBeUndefined();
    });
  });

  describe('TOGGLE custom field', () => {
    it('maps to keyword / SELECT_BASIC with true/false options', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_toggle',
        label: 'Toggle Field',
        type: CustomFieldTypes.TOGGLE,
        required: false,
      });
      const parsed = parse(yaml);
      expect(parsed.type).toBe('keyword');
      expect(parsed.control).toBe(FieldType.SELECT_BASIC);
      expect(parsed.metadata?.options).toEqual(['true', 'false']);
    });

    it('includes default when defaultValue is true', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_toggle',
        label: 'Toggle Field',
        type: CustomFieldTypes.TOGGLE,
        required: false,
        defaultValue: true,
      });
      expect(parse(yaml).metadata?.default).toBe('true');
    });

    it('includes default when defaultValue is false', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_toggle',
        label: 'Toggle Field',
        type: CustomFieldTypes.TOGGLE,
        required: false,
        defaultValue: false,
      });
      expect(parse(yaml).metadata?.default).toBe('false');
    });

    it('omits default key from metadata when defaultValue is null', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_toggle',
        label: 'Toggle Field',
        type: CustomFieldTypes.TOGGLE,
        required: false,
        defaultValue: null,
      });
      const parsed = parse(yaml);
      expect(parsed.metadata?.options).toEqual(['true', 'false']);
      expect(parsed.metadata?.default).toBeUndefined();
    });
  });

  describe('unknown type', () => {
    it('falls back to keyword / INPUT_TEXT', () => {
      const { yaml } = buildFieldDefinitionYaml({
        key: 'cf_unknown',
        label: 'Unknown Field',
        type: 'future_type',
        required: false,
      });
      const parsed = parse(yaml);
      expect(parsed.type).toBe('keyword');
      expect(parsed.control).toBe(FieldType.INPUT_TEXT);
    });
  });
});
