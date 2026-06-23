/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse as parseYaml } from 'yaml';
import { linkFieldFromLibrary, unlinkFieldFromTemplate } from './link_field_from_library';

const baseTemplate = `
name: My Template
fields:
  - name: inline_field
    control: INPUT_TEXT
    type: keyword
`.trim();

const emptyFieldsTemplate = `
name: My Template
fields: []
`.trim();

const noFieldsTemplate = `
name: My Template
`.trim();

describe('linkFieldFromLibrary', () => {
  it('appends a $ref entry to an existing fields array', () => {
    const result = linkFieldFromLibrary(baseTemplate, 'my_lib_field');
    const parsed = parseYaml(result) as { fields: Array<Record<string, string>> };
    const last = parsed.fields[parsed.fields.length - 1];
    expect(last).toEqual({ $ref: 'my_lib_field' });
  });

  it('creates a fields array when none exists', () => {
    const result = linkFieldFromLibrary(noFieldsTemplate, 'my_lib_field');
    const parsed = parseYaml(result) as { fields: Array<Record<string, string>> };
    expect(parsed.fields).toHaveLength(1);
    expect(parsed.fields[0]).toEqual({ $ref: 'my_lib_field' });
  });

  it('appends to an empty fields array', () => {
    const result = linkFieldFromLibrary(emptyFieldsTemplate, 'my_lib_field');
    const parsed = parseYaml(result) as { fields: Array<Record<string, string>> };
    expect(parsed.fields).toHaveLength(1);
    expect(parsed.fields[0]).toEqual({ $ref: 'my_lib_field' });
  });

  it('throws when a field with the same effective name already exists as an inline field', () => {
    expect(() => linkFieldFromLibrary(baseTemplate, 'inline_field')).toThrow(
      'Field "inline_field" already exists in this template'
    );
  });

  it('throws when a field with the same effective name already exists as a ref', () => {
    const withRef = `
name: My Template
fields:
  - $ref: existing_ref
`.trim();
    expect(() => linkFieldFromLibrary(withRef, 'existing_ref')).toThrow(
      'Field "existing_ref" already exists in this template'
    );
  });

  it('returns the original YAML unchanged when the input is empty', () => {
    expect(linkFieldFromLibrary('', 'some_field')).toBe('');
    expect(linkFieldFromLibrary('   ', 'some_field')).toBe('   ');
  });

  it('preserves other fields when appending', () => {
    const result = linkFieldFromLibrary(baseTemplate, 'new_lib_field');
    const parsed = parseYaml(result) as { fields: Array<Record<string, string>> };
    expect(parsed.fields[0]).toEqual({
      name: 'inline_field',
      control: 'INPUT_TEXT',
      type: 'keyword',
    });
    expect(parsed.fields[1]).toEqual({ $ref: 'new_lib_field' });
  });
});

describe('unlinkFieldFromTemplate', () => {
  it('removes a $ref entry matched by $ref value', () => {
    const withRef = `
name: My Template
fields:
  - name: inline_field
    control: INPUT_TEXT
    type: keyword
  - $ref: my_lib_field
`.trim();

    const result = unlinkFieldFromTemplate(withRef, 'my_lib_field');
    const parsed = parseYaml(result) as { fields: Array<Record<string, string>> };
    expect(parsed.fields).toHaveLength(1);
    expect(parsed.fields[0]).toEqual({
      name: 'inline_field',
      control: 'INPUT_TEXT',
      type: 'keyword',
    });
  });

  it('removes a $ref entry matched by override name', () => {
    const withNamedRef = `
name: My Template
fields:
  - name: override_name
    $ref: my_lib_field
`.trim();

    const result = unlinkFieldFromTemplate(withNamedRef, 'override_name');
    const parsed = parseYaml(result) as { fields: Array<Record<string, string>> | undefined };
    expect(!parsed.fields || parsed.fields.length === 0).toBe(true);
  });

  it('does not remove inline fields (no $ref)', () => {
    const result = unlinkFieldFromTemplate(baseTemplate, 'inline_field');
    const parsed = parseYaml(result) as { fields: Array<Record<string, string>> };
    expect(parsed.fields).toHaveLength(1);
  });

  it('returns unchanged YAML when the field name is not found', () => {
    const result = unlinkFieldFromTemplate(baseTemplate, 'nonexistent');
    expect(parseYaml(result)).toEqual(parseYaml(baseTemplate));
  });

  it('returns unchanged YAML when input is empty', () => {
    expect(unlinkFieldFromTemplate('', 'some_field')).toBe('');
    expect(unlinkFieldFromTemplate('   ', 'some_field')).toBe('   ');
  });

  it('returns unchanged YAML when there is no fields array', () => {
    const result = unlinkFieldFromTemplate(noFieldsTemplate, 'some_field');
    expect(parseYaml(result)).toEqual(parseYaml(noFieldsTemplate));
  });
});
