/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { stringify as yamlStringify } from 'yaml';
import type { Template } from '../../../../common/types/domain/template/v1';
import { parseTemplate } from './parse_template';

const buildDefinition = (name: string) =>
  yamlStringify({
    name,
    fields: [
      {
        control: 'INPUT_TEXT',
        name: 'test_field',
        label: 'Test Field',
        type: 'keyword',
      },
    ],
  });

const createTemplate = (overrides?: Partial<Template>): Template => ({
  templateId: 'template-1',
  name: 'Test Template',
  owner: 'securitySolution',
  definition: buildDefinition('Test Template'),
  templateVersion: 1,
  deletedAt: null,
  author: 'test-user',
  isLatest: true,
  ...overrides,
});

describe('parseTemplate', () => {
  it('parses the YAML definition into a structured object', () => {
    const template = createTemplate();
    const result = parseTemplate(template);

    expect(result.definition).toEqual({
      name: 'Test Template',
      fields: [
        expect.objectContaining({
          control: 'INPUT_TEXT',
          name: 'test_field',
          label: 'Test Field',
          type: 'keyword',
        }),
      ],
    });
  });

  it('preserves all template fields in the output', () => {
    const template = createTemplate({
      description: 'A description',
      tags: ['tag-1', 'tag-2'],
      fieldCount: 1,
      fieldNames: [{ name: 'test_field', label: 'Test Field', type: 'keyword', control: 'TEXT' }],
      usageCount: 5,
      lastUsedAt: '2024-01-15T10:00:00.000Z',
      isDefault: true,
    });

    const result = parseTemplate(template);

    expect(result.templateId).toBe('template-1');
    expect(result.name).toBe('Test Template');
    expect(result.owner).toBe('securitySolution');
    expect(result.templateVersion).toBe(1);
    expect(result.deletedAt).toBeNull();
    expect(result.description).toBe('A description');
    expect(result.tags).toEqual(['tag-1', 'tag-2']);
    expect(result.author).toBe('test-user');
    expect(result.fieldCount).toBe(1);
    expect(result.fieldNames).toEqual([
      { name: 'test_field', label: 'Test Field', type: 'keyword', control: 'TEXT' },
    ]);
    expect(result.usageCount).toBe(5);
    expect(result.lastUsedAt).toBe('2024-01-15T10:00:00.000Z');
    expect(result.isDefault).toBe(true);
  });

  it('does not include fieldSearchMatches (it is a list-only enrichment)', () => {
    const template = createTemplate();
    const result = parseTemplate(template);

    expect(result).not.toHaveProperty('fieldSearchMatches');
  });

  it('adds isLatest and latestVersion to the output', () => {
    const template = createTemplate();
    const result = parseTemplate(template);

    expect(result.isLatest).toBe(true);
    expect(result.latestVersion).toBe(1);
  });

  it('parses severity and category from the definition', () => {
    const definition = yamlStringify({
      name: 'Template with severity',
      severity: 'high',
      category: 'security',
      fields: [],
    });
    const template = createTemplate({ definition });
    const result = parseTemplate(template);

    expect(result.definition.severity).toBe('high');
    expect(result.definition.category).toBe('security');
  });

  it('omits severity and category when not present in the definition', () => {
    const template = createTemplate();
    const result = parseTemplate(template);

    expect(result.definition.severity).toBeUndefined();
    expect(result.definition.category).toBeUndefined();
  });

  it('includes definitionString with the original YAML', () => {
    const template = createTemplate();
    const result = parseTemplate(template);

    expect(result.definitionString).toBe(template.definition);
    expect(typeof result.definitionString).toBe('string');
  });

  it('preserves YAML comments in definitionString', () => {
    const yamlWithComments = `# Template header
name: Test Template
# Field configuration
fields:
  - control: INPUT_TEXT
    name: test_field
    type: keyword`;

    const template = createTemplate({ definition: yamlWithComments });
    const result = parseTemplate(template);

    expect(result.definitionString).toBe(yamlWithComments);
    expect(result.definitionString).toContain('# Template header');
    expect(result.definitionString).toContain('# Field configuration');
  });
});
