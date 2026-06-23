/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse as parseYaml } from 'yaml';
import { insertFieldFromLibrary } from './insert_field_from_library';

const baseTemplate = `
name: My Template
fields:
  - name: existing_field
    control: INPUT_TEXT
    type: keyword
`.trim();

const noFieldsTemplate = `
name: My Template
`.trim();

const fieldDefinitionYaml = `
name: new_field
control: SELECT_BASIC
type: keyword
metadata:
  options:
    - low
    - high
  default: low
`.trim();

describe('insertFieldFromLibrary', () => {
  it('appends a field definition to an existing fields array', () => {
    const result = insertFieldFromLibrary(baseTemplate, fieldDefinitionYaml);
    const parsed = parseYaml(result) as { fields: Array<Record<string, unknown>> };
    expect(parsed.fields).toHaveLength(2);
    expect(parsed.fields[1].name).toBe('new_field');
    expect(parsed.fields[1].control).toBe('SELECT_BASIC');
  });

  it('creates a fields array when none exists', () => {
    const result = insertFieldFromLibrary(noFieldsTemplate, fieldDefinitionYaml);
    const parsed = parseYaml(result) as { fields: Array<Record<string, unknown>> };
    expect(parsed.fields).toHaveLength(1);
    expect(parsed.fields[0].name).toBe('new_field');
  });

  it('preserves existing fields when appending', () => {
    const result = insertFieldFromLibrary(baseTemplate, fieldDefinitionYaml);
    const parsed = parseYaml(result) as { fields: Array<Record<string, unknown>> };
    expect(parsed.fields[0].name).toBe('existing_field');
  });

  it('throws when the field name already exists in the template', () => {
    const duplicateField = `
name: existing_field
control: INPUT_TEXT
type: keyword
`.trim();
    expect(() => insertFieldFromLibrary(baseTemplate, duplicateField)).toThrow(
      'Field "existing_field" already exists in this template'
    );
  });

  it('throws when the field definition YAML is missing a name', () => {
    const noNameField = `
control: INPUT_TEXT
type: keyword
`.trim();
    expect(() => insertFieldFromLibrary(baseTemplate, noNameField)).toThrow(
      'Invalid field definition: missing field name'
    );
  });

  it('returns the original YAML unchanged when the template input is empty', () => {
    expect(insertFieldFromLibrary('', fieldDefinitionYaml)).toBe('');
    expect(insertFieldFromLibrary('   ', fieldDefinitionYaml)).toBe('   ');
  });
});
