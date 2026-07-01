/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse as parseYaml } from 'yaml';
import type { ParsedTemplate } from '../../../../common/types/domain/template/v1';
import { ConnectorTypes } from '../../../../common/types/domain';
import { templateToYaml, templatesToYaml } from './templates_to_yaml';

describe('templatesToYaml', () => {
  it('serializes templates to YAML with tags and fields', () => {
    const templates: ParsedTemplate[] = [
      {
        templateId: 'template-1',
        name: 'My template',
        owner: 'securitySolution',
        description: 'Some description',
        tags: ['tag-a', 'tag-b'],
        author: 'alice',
        usageCount: 2,
        fieldCount: 2,
        lastUsedAt: '2024-01-02T00:00:00.000Z',
        isDefault: true,
        templateVersion: 3,
        latestVersion: 3,
        isLatest: true,
        deletedAt: null,
        definitionString: '',
        definition: {
          name: 'My template',
          fields: [
            {
              name: 'severity',
              label: 'Severity',
              control: 'SELECT_BASIC',
              type: 'keyword',
              metadata: {
                options: ['low', 'medium'],
                default: 'medium',
              },
            },
            {
              name: 'summary',
              label: 'Summary',
              control: 'INPUT_TEXT',
              type: 'keyword',
              metadata: {},
            },
          ],
        },
      },
    ];

    const yaml = templatesToYaml(templates);

    expect(yaml).toContain('templateId: "template-1"');
    expect(yaml).toContain('name: "My template"');
    expect(yaml).toContain('owner: "securitySolution"');
    expect(yaml).toContain('author: "alice"');
    expect(yaml).toContain('tags:');
    expect(yaml).toContain('  - "tag-a"');
    expect(yaml).toContain('  - "tag-b"');

    // Definition fields
    expect(yaml).toContain('definition:');
    expect(yaml).toContain('  fields:');
    expect(yaml).toContain('    - name: "severity"');
    expect(yaml).toContain('      control: "SELECT_BASIC"');
    expect(yaml).toContain('      metadata:');
    expect(yaml).toContain('        options:');
    expect(yaml).toContain('          - "low"');
    expect(yaml).toContain('          - "medium"');
    expect(yaml).toContain('        default: "medium"');

    // Non-select field should not include select metadata block
    expect(yaml).toContain('    - name: "summary"');
    expect(yaml).toContain('      control: "INPUT_TEXT"');
  });

  it('handles empty templates array', () => {
    const yaml = templatesToYaml([]);

    expect(yaml).toContain('# Bulk Export: 0 templates');
  });

  it('serializes DATE_PICKER field with show_time, timezone and default', () => {
    const templates: ParsedTemplate[] = [
      {
        templateId: 'template-dp',
        name: 'DatePicker Template',
        owner: 'securitySolution',
        templateVersion: 1,
        latestVersion: 1,
        isLatest: true,
        deletedAt: null,
        definitionString: '',
        definition: {
          name: 'DatePicker Template',
          fields: [
            {
              name: 'due_date',
              label: 'Due date',
              control: 'DATE_PICKER',
              type: 'date',
              metadata: {
                default: '2024-06-01T00:00:00.000Z',
                show_time: true,
                timezone: 'local',
              },
            },
          ],
        },
      },
    ];

    const yaml = templatesToYaml(templates);

    expect(yaml).toContain('      metadata:');
    expect(yaml).toContain('        default: "2024-06-01T00:00:00.000Z"');
    expect(yaml).toContain('        show_time: true');
    expect(yaml).toContain('        timezone: local');
  });

  it('serializes DATE_PICKER default when yaml parses it as a Date object (unquoted ISO)', () => {
    const templates: ParsedTemplate[] = [
      {
        templateId: 'template-dp',
        name: 'DatePicker Template',
        owner: 'securitySolution',
        templateVersion: 1,
        latestVersion: 1,
        isLatest: true,
        deletedAt: null,
        definitionString: '',
        definition: {
          name: 'DatePicker Template',
          fields: [
            {
              name: 'due_date',
              control: 'DATE_PICKER',
              type: 'date',
              // yaml parses unquoted ISO timestamps as native Date objects
              metadata: { default: new Date('2024-06-01T00:00:00.000Z') } as unknown as {
                show_time?: boolean;
                timezone?: 'utc' | 'local';
              },
            },
          ],
        },
      },
    ];

    const yaml = templatesToYaml(templates);

    expect(yaml).toContain('        default: "2024-06-01T00:00:00.000Z"');
  });

  it('serializes DATE_PICKER field without optional metadata when absent', () => {
    const templates: ParsedTemplate[] = [
      {
        templateId: 'template-dp',
        name: 'DatePicker Template',
        owner: 'securitySolution',
        templateVersion: 1,
        latestVersion: 1,
        isLatest: true,
        deletedAt: null,
        definitionString: '',
        definition: {
          name: 'DatePicker Template',
          fields: [
            {
              name: 'due_date',
              control: 'DATE_PICKER',
              type: 'date',
            },
          ],
        },
      },
    ];

    const yaml = templatesToYaml(templates);

    expect(yaml).not.toContain('show_time');
    expect(yaml).not.toContain('timezone');
  });

  it('serializes fields with display show_when conditions', () => {
    const templates: ParsedTemplate[] = [
      {
        templateId: 'template-cond',
        name: 'Conditions Template',
        owner: 'securitySolution',
        templateVersion: 1,
        latestVersion: 1,
        isLatest: true,
        deletedAt: null,
        definitionString: '',
        definition: {
          name: 'Conditions Template',
          fields: [
            {
              name: 'urgency_reason',
              control: 'TEXTAREA',
              type: 'keyword',
              display: {
                show_when: { field: 'priority', operator: 'eq', value: 'urgent' },
              },
            },
          ],
        },
      },
    ];

    const yaml = templatesToYaml(templates);

    expect(yaml).toContain('      display:');
    expect(yaml).toContain('show_when:');
    expect(yaml).toContain('field: priority');
    expect(yaml).toContain('operator: eq');
    expect(yaml).toContain('value: urgent');
  });

  it('serializes fields with validation rules', () => {
    const templates: ParsedTemplate[] = [
      {
        templateId: 'template-val',
        name: 'Validation Template',
        owner: 'securitySolution',
        templateVersion: 1,
        latestVersion: 1,
        isLatest: true,
        deletedAt: null,
        definitionString: '',
        definition: {
          name: 'Validation Template',
          fields: [
            {
              name: 'score',
              control: 'INPUT_NUMBER',
              type: 'integer',
              validation: { required: true, min: 0, max: 100 },
            },
            {
              name: 'code',
              control: 'INPUT_TEXT',
              type: 'keyword',
              validation: {
                min_length: 3,
                max_length: 10,
                pattern: { regex: '^[A-Z]+$', message: 'Must be uppercase' },
              },
            },
          ],
        },
      },
    ];

    const yaml = templatesToYaml(templates);

    expect(yaml).toContain('      validation:');
    expect(yaml).toContain('required: true');
    expect(yaml).toContain('min: 0');
    expect(yaml).toContain('max: 100');
    expect(yaml).toContain('min_length: 3');
    expect(yaml).toContain('max_length: 10');
    expect(yaml).toContain('regex: ^[A-Z]+$');
    expect(yaml).toContain('message: Must be uppercase');
  });

  it('serializes template-level severity, category and isEnabled', () => {
    const templates: ParsedTemplate[] = [
      {
        templateId: 'template-meta',
        name: 'Meta Template',
        owner: 'securitySolution',
        templateVersion: 1,
        latestVersion: 1,
        isLatest: true,
        isEnabled: false,
        deletedAt: null,
        definitionString: '',
        definition: {
          name: 'Meta Template',
          severity: 'high',
          category: 'Security',
          fields: [],
        },
      },
    ];

    const yaml = templatesToYaml(templates);

    expect(yaml).toContain('severity: high');
    expect(yaml).toContain('category: "Security"');
    expect(yaml).toContain('isEnabled: false');
  });

  describe('$ref field serialization', () => {
    const baseRefTemplate = (
      refField: ParsedTemplate['definition']['fields'][number]
    ): ParsedTemplate => ({
      templateId: 'tpl-ref',
      name: 'Ref template',
      owner: 'securitySolution',
      templateVersion: 1,
      latestVersion: 1,
      isLatest: true,
      deletedAt: null,
      definitionString: '',
      definition: {
        name: 'Ref template',
        fields: [refField],
      },
    });

    it('serializes a bare $ref entry without metadata', () => {
      const yaml = templatesToYaml([baseRefTemplate({ $ref: 'lib_field' })]);
      expect(yaml).toContain('    - $ref: "lib_field"');
      expect(yaml).not.toContain('metadata:');
    });

    it('serializes a $ref entry with name alias and metadata.default scalar', () => {
      const yaml = templatesToYaml([
        baseRefTemplate({
          name: 'my_alias',
          $ref: 'lib_field',
          metadata: { default: 'override_value' },
        }),
      ]);
      expect(yaml).toContain('    - name: "my_alias"');
      expect(yaml).toContain('      $ref: "lib_field"');
      expect(yaml).toContain('      metadata:');
      expect(yaml).toContain('        default: "override_value"');
    });

    it('serializes a $ref entry with an array string default', () => {
      const yaml = templatesToYaml([
        baseRefTemplate({
          $ref: 'lib_field',
          metadata: { default: ['a', 'b'] },
        }),
      ]);
      expect(yaml).toContain('        default:');
      expect(yaml).toContain('          - "a"');
      expect(yaml).toContain('          - "b"');
    });
  });
});

describe('RADIO_GROUP field serialization', () => {
  const baseTemplate: ParsedTemplate = {
    templateId: 'tpl-radio',
    name: 'Radio template',
    owner: 'securitySolution',
    tags: [],
    usageCount: 0,
    fieldCount: 1,
    templateVersion: 1,
    latestVersion: 1,
    isLatest: true,
    deletedAt: null,
    definition: { name: 'Radio template', fields: [] },
    definitionString: 'name: Radio template\nfields: []',
  };

  it('serializes options as a YAML sequence and default as a scalar', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Radio template',
        fields: [
          {
            name: 'severity',
            control: 'RADIO_GROUP',
            type: 'keyword',
            metadata: {
              options: ['low', 'medium', 'high'],
              default: 'medium',
            },
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).toContain('      control: "RADIO_GROUP"');
    expect(yaml).toContain('        options:');
    expect(yaml).toContain('          - "low"');
    expect(yaml).toContain('          - "medium"');
    expect(yaml).toContain('          - "high"');
    expect(yaml).toContain('        default: "medium"');
    // default must be a scalar, not a YAML sequence
    expect(yaml).not.toMatch(/default:\n\s+- /);
  });

  it('omits the default line when no default is provided', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Radio template',
        fields: [
          {
            name: 'env',
            control: 'RADIO_GROUP',
            type: 'keyword',
            metadata: {
              options: ['staging', 'production'],
            },
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).toContain('        options:');
    expect(yaml).not.toContain('        default:');
  });
});

describe('CHECKBOX_GROUP field serialization', () => {
  const baseTemplate: ParsedTemplate = {
    templateId: 'tpl-1',
    name: 'Checkbox template',
    owner: 'securitySolution',
    tags: [],
    usageCount: 0,
    fieldCount: 1,
    templateVersion: 1,
    latestVersion: 1,
    isLatest: true,
    deletedAt: null,
    definition: { name: 'Checkbox template', fields: [] },
    definitionString: 'name: Checkbox template\nfields: []',
  };

  it('serializes options and defaults as YAML sequences', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Checkbox template',
        fields: [
          {
            name: 'affected_systems',
            control: 'CHECKBOX_GROUP',
            type: 'keyword',
            metadata: {
              options: ['api', 'ui', 'database'],
              default: ['api', 'database'],
            },
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).toContain('      control: "CHECKBOX_GROUP"');
    expect(yaml).toContain('        options:');
    expect(yaml).toContain('          - "api"');
    expect(yaml).toContain('          - "ui"');
    expect(yaml).toContain('          - "database"');
    expect(yaml).toContain('        default:');
    // default items are a subset of options
    const lines = yaml.split('\n');
    const defaultIdx = lines.findIndex((l) => l.trim() === 'default:');
    expect(defaultIdx).toBeGreaterThan(-1);
    const defaultBlock = lines.slice(defaultIdx + 1, defaultIdx + 3).join('\n');
    expect(defaultBlock).toContain('"api"');
    expect(defaultBlock).toContain('"database"');
    expect(defaultBlock).not.toContain('"ui"');
  });

  it('omits the default block when no defaults are provided', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Checkbox template',
        fields: [
          {
            name: 'tags',
            control: 'CHECKBOX_GROUP',
            type: 'keyword',
            metadata: {
              options: ['a', 'b', 'c'],
            },
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).toContain('        options:');
    expect(yaml).not.toContain('        default:');
  });

  it('omits the default block when defaults array is empty', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Checkbox template',
        fields: [
          {
            name: 'tags',
            control: 'CHECKBOX_GROUP',
            type: 'keyword',
            metadata: {
              options: ['a', 'b'],
              default: [],
            },
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).toContain('        options:');
    expect(yaml).not.toContain('        default:');
  });
});

describe('display and validation serialization', () => {
  const baseTemplate: ParsedTemplate = {
    templateId: 'tpl-cond',
    name: 'Conditions template',
    owner: 'securitySolution',
    tags: [],
    usageCount: 0,
    fieldCount: 1,
    templateVersion: 1,
    latestVersion: 1,
    isLatest: true,
    deletedAt: null,
    definition: { name: 'Conditions template', fields: [] },
    definitionString: 'name: Conditions template\nfields: []',
  };

  it('serializes display.show_when with a simple condition rule', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Conditions template',
        fields: [
          {
            name: 'details',
            control: 'TEXTAREA',
            type: 'keyword',
            display: {
              show_when: { field: 'env', operator: 'eq', value: 'production' },
            },
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).toContain('      display:');
    expect(yaml).toContain('        show_when:');
    expect(yaml).toContain('          field: env');
    expect(yaml).toContain('          operator: eq');
    expect(yaml).toContain('          value: production');
  });

  it('serializes display.show_when with a compound condition', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Conditions template',
        fields: [
          {
            name: 'notes',
            control: 'TEXTAREA',
            type: 'keyword',
            display: {
              show_when: {
                combine: 'all',
                rules: [
                  { field: 'env', operator: 'eq', value: 'prod' },
                  { field: 'severity', operator: 'neq', value: 'low' },
                ],
              },
            },
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).toContain('      display:');
    expect(yaml).toContain('        show_when:');
    expect(yaml).toContain('          combine: all');
    expect(yaml).toContain('          rules:');
    expect(yaml).toContain('            - field: env');
    expect(yaml).toContain('            - field: severity');
  });

  it('omits display when not present', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Conditions template',
        fields: [{ name: 'summary', control: 'INPUT_TEXT', type: 'keyword' }],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).not.toContain('display:');
  });

  it('serializes simple validation flags', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Conditions template',
        fields: [
          {
            name: 'score',
            control: 'INPUT_NUMBER',
            type: 'integer',
            validation: { required: true, min: 1, max: 100 },
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).toContain('      validation:');
    expect(yaml).toContain('        required: true');
    expect(yaml).toContain('        min: 1');
    expect(yaml).toContain('        max: 100');
  });

  it('serializes validation.pattern', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Conditions template',
        fields: [
          {
            name: 'ticket_id',
            control: 'INPUT_TEXT',
            type: 'keyword',
            validation: { pattern: { regex: '^[A-Z]+-\\d+$', message: 'Must be a ticket ID' } },
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).toContain('      validation:');
    expect(yaml).toContain('        pattern:');
    expect(yaml).toContain('          regex:');
    expect(yaml).toContain('          message: Must be a ticket ID');
  });

  it('serializes validation.required_when with a condition', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Conditions template',
        fields: [
          {
            name: 'reason',
            control: 'TEXTAREA',
            type: 'keyword',
            validation: {
              required_when: { field: 'severity', operator: 'eq', value: 'critical' },
            },
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).toContain('      validation:');
    expect(yaml).toContain('        required_when:');
    expect(yaml).toContain('          field: severity');
    expect(yaml).toContain('          operator: eq');
    expect(yaml).toContain('          value: critical');
  });

  it('omits validation when not present', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Conditions template',
        fields: [{ name: 'summary', control: 'INPUT_TEXT', type: 'keyword' }],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).not.toContain('validation:');
  });
});

describe('TEXTAREA field serialization', () => {
  const baseTemplate: ParsedTemplate = {
    templateId: 'tpl-textarea',
    name: 'Textarea template',
    owner: 'securitySolution',
    tags: [],
    usageCount: 0,
    fieldCount: 1,
    templateVersion: 1,
    latestVersion: 1,
    isLatest: true,
    deletedAt: null,
    definition: { name: 'Textarea template', fields: [] },
    definitionString: 'name: Textarea template\nfields: []',
  };

  it('serializes TEXTAREA with markdown: true', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Textarea template',
        fields: [
          {
            name: 'instructions',
            control: 'TEXTAREA',
            type: 'keyword',
            metadata: { markdown: true, default: '## Steps' },
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).toContain('      control: "TEXTAREA"');
    expect(yaml).toContain('      metadata:');
    expect(yaml).toContain('        default: "## Steps"');
    expect(yaml).toContain('        markdown: true');
  });

  it('serializes TEXTAREA with only default (no markdown)', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Textarea template',
        fields: [
          {
            name: 'details',
            control: 'TEXTAREA',
            type: 'keyword',
            metadata: { default: 'Enter details here...' },
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).toContain('      metadata:');
    expect(yaml).toContain('        default: "Enter details here..."');
    expect(yaml).not.toContain('markdown');
  });

  it('omits metadata block when TEXTAREA has no metadata', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Textarea template',
        fields: [
          {
            name: 'notes',
            control: 'TEXTAREA',
            type: 'keyword',
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).toContain('      control: "TEXTAREA"');
    expect(yaml).not.toContain('metadata:');
  });

  it('omits metadata block when markdown is false and no default', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Textarea template',
        fields: [
          {
            name: 'notes',
            control: 'TEXTAREA',
            type: 'keyword',
            metadata: { markdown: false },
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).not.toContain('metadata:');
    expect(yaml).not.toContain('markdown');
  });

  it('serializes TEXTAREA with only markdown: true (no default)', () => {
    const template: ParsedTemplate = {
      ...baseTemplate,
      definition: {
        name: 'Textarea template',
        fields: [
          {
            name: 'instructions',
            control: 'TEXTAREA',
            type: 'keyword',
            metadata: { markdown: true },
          },
        ],
      },
    };

    const yaml = templatesToYaml([template]);

    expect(yaml).toContain('      metadata:');
    expect(yaml).toContain('        markdown: true');
    expect(yaml).not.toContain('default:');
  });
});

describe('templateToYaml', () => {
  it('serializes a single template with a template header', () => {
    const template: ParsedTemplate = {
      templateId: 'template-1',
      name: 'My template',
      owner: 'securitySolution',
      description: 'Some description',
      tags: ['tag-a'],
      author: 'alice',
      usageCount: 2,
      fieldCount: 1,
      templateVersion: 1,
      latestVersion: 1,
      isLatest: true,
      definitionString: 'name: My template\nfields: []',
      deletedAt: null,
      definition: {
        name: 'My template',
        fields: [
          {
            name: 'summary',
            control: 'INPUT_TEXT',
            type: 'keyword',
            metadata: {},
          },
        ],
      },
    };

    const yaml = templateToYaml(template);

    expect(yaml).toContain('# Template: My template');
    expect(yaml).toContain('templateId: "template-1"');
    expect(yaml).toContain('author: "alice"');
  });
});

describe('connector and settings serialization', () => {
  const buildTemplate = (definition: Partial<ParsedTemplate['definition']>): ParsedTemplate => ({
    templateId: 'template-1',
    name: 'My template',
    owner: 'securitySolution',
    templateVersion: 1,
    latestVersion: 1,
    isLatest: true,
    deletedAt: null,
    definitionString: '',
    definition: {
      name: 'My template',
      fields: [],
      ...definition,
    },
  });

  it('emits a connector block and round-trips its per-type fields losslessly', () => {
    const template = buildTemplate({
      connector: {
        type: ConnectorTypes.jira,
        id: 'jira-1',
        fields: { issueType: '10001', priority: 'High', parent: null },
      },
    });

    const yaml = templateToYaml(template);
    const parsed = parseYaml(yaml);

    expect(parsed.connector).toEqual({
      type: '.jira',
      id: 'jira-1',
      fields: { issueType: '10001', priority: 'High', parent: null },
    });
  });

  it('emits a settings block that round-trips', () => {
    const template = buildTemplate({
      settings: { syncAlerts: false, extractObservables: true },
    });

    const yaml = templateToYaml(template);
    const parsed = parseYaml(yaml);

    expect(parsed.settings).toEqual({ syncAlerts: false, extractObservables: true });
  });

  it('omits connector and settings when the definition has neither', () => {
    const yaml = templateToYaml(buildTemplate({}));
    const parsed = parseYaml(yaml);

    expect(parsed).not.toHaveProperty('connector');
    expect(parsed).not.toHaveProperty('settings');
  });
});
