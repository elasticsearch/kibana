/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  TemplateSchema,
  ParsedTemplateSchema,
  ParsedTemplateDefinitionSchema,
  CreateTemplateInputSchema,
  UpdateTemplateInputSchema,
  PatchTemplateInputSchema,
} from './v1';
import { FieldSchema, isRefField } from './fields';

describe('TemplateSchema', () => {
  const validTemplate = {
    templateId: 'test-template-id',
    name: 'Test Template',
    owner: 'securitySolution',
    definition: 'fields:\n  - name: test_field\n    type: keyword',
    templateVersion: 1,
    deletedAt: null,
    author: 'test-user',
  };

  it('validates a valid template', () => {
    const result = TemplateSchema.safeParse(validTemplate);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validTemplate);
    }
  });

  it('accepts a template with deletedAt as ISO string', () => {
    const deletedDateString = '2024-01-15T10:00:00.000Z';
    const templateWithDeletedAt = {
      ...validTemplate,
      deletedAt: deletedDateString,
    };

    const result = TemplateSchema.safeParse(templateWithDeletedAt);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deletedAt).toEqual(deletedDateString);
    }
  });

  it('rejects template with missing required fields', () => {
    const invalidTemplate = {
      templateId: 'test-template-id',
      name: 'Test Template',
      // missing owner, definition, templateVersion, deletedAt
    };

    const result = TemplateSchema.safeParse(invalidTemplate);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('rejects template with invalid templateVersion type', () => {
    const invalidTemplate = {
      ...validTemplate,
      templateVersion: '1', // should be number
    };

    const result = TemplateSchema.safeParse(invalidTemplate);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('templateVersion');
    }
  });

  it('strips extra properties from template (zod default behavior)', () => {
    const templateWithExtra = {
      ...validTemplate,
      extraField: 'should be stripped',
    };

    // Zod default behavior strips unknown properties
    const result = TemplateSchema.safeParse(templateWithExtra);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(validTemplate);

    if (result.success) {
      expect('extraField' in result.data).toBe(false);
    }
  });

  it('does not accept random strings for deletedAt', () => {
    const templateWithStringDate = {
      ...validTemplate,
      deletedAt: 'not-an-iso-date-but-still-a-string',
    };

    const result = TemplateSchema.safeParse(templateWithStringDate);

    expect(result.success).not.toBe(true);
  });

  it('rejects template with number for deletedAt', () => {
    const invalidTemplate = {
      ...validTemplate,
      deletedAt: 12345, // should be string or null
    };

    const result = TemplateSchema.safeParse(invalidTemplate);

    expect(result.success).toBe(false);
  });
});

describe('FieldSchema', () => {
  const validField = {
    control: 'INPUT_TEXT',
    name: 'test_field',
    label: 'Test Field',
    type: 'keyword' as const,
  };

  it('validates a valid field', () => {
    const result = FieldSchema.safeParse(validField);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validField);
    }
  });

  it('accepts field without optional label', () => {
    const fieldWithoutLabel = {
      control: 'INPUT_TEXT',
      name: 'test_field',
      type: 'keyword' as const,
    };

    const result = FieldSchema.safeParse(fieldWithoutLabel);

    expect(result.success).toBe(true);
    if (result.success && !isRefField(result.data)) {
      expect(result.data.label).toBeUndefined();
    }
  });

  it('rejects field with invalid type', () => {
    const invalidField = {
      ...validField,
      type: 'text', // should be 'keyword'
    };

    const result = FieldSchema.safeParse(invalidField);

    expect(result.success).toBe(false);
  });

  it('accepts metadata with any structure', () => {
    const fieldWithComplexMetadata = {
      control: 'SELECT_BASIC',
      name: 'test_field',
      label: 'Test Field',
      type: 'keyword' as const,
      metadata: {
        options: ['a', 'b'],
        nested: {
          deeply: {
            value: 123,
          },
        },
        array: [1, 2, 3],
        boolean: true,
      },
    };

    const result = FieldSchema.safeParse(fieldWithComplexMetadata);

    expect(result.success).toBe(true);
  });
});

describe('ParsedTemplateSchema', () => {
  const validParsedTemplate = {
    templateId: 'test-template-id',
    name: 'Test Template',
    owner: 'securitySolution',
    definition: {
      name: 'template-definition-name',
      fields: [
        {
          control: 'INPUT_TEXT',
          name: 'field1',
          type: 'keyword' as const,
        },
        {
          control: 'SELECT_BASIC',
          name: 'field2',
          label: 'Field 2',
          type: 'keyword' as const,
          metadata: { options: ['a', 'b', 'c'] },
        },
      ],
    },
    definitionString:
      'name: template-definition-name\nfields:\n  - control: INPUT_TEXT\n    name: field1\n    type: keyword',
    templateVersion: 2,
    deletedAt: null,
    author: 'test-user',
    isLatest: true,
    latestVersion: 2,
  };

  it('validates a valid parsed template', () => {
    const result = ParsedTemplateSchema.safeParse(validParsedTemplate);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validParsedTemplate);
    }
  });

  it('validates parsed template with empty fields array', () => {
    const templateWithNoFields = {
      ...validParsedTemplate,
      definition: {
        name: 'template-definition-name',
        fields: [],
      },
    };

    const result = ParsedTemplateSchema.safeParse(templateWithNoFields);

    expect(result.success).toBe(true);
  });

  it('rejects parsed template with string definition', () => {
    const invalidTemplate = {
      ...validParsedTemplate,
      definition: 'should be an object',
    };

    const result = ParsedTemplateSchema.safeParse(invalidTemplate);

    expect(result.success).toBe(false);
  });

  it('rejects parsed template missing isLatest', () => {
    const { isLatest, ...templateWithoutIsLatest } = validParsedTemplate;

    const result = ParsedTemplateSchema.safeParse(templateWithoutIsLatest);

    expect(result.success).toBe(false);
  });

  it('rejects parsed template with invalid field in definition', () => {
    const templateWithInvalidField = {
      ...validParsedTemplate,
      definition: {
        name: 'template-definition-name',
        fields: [
          {
            control: 'INPUT_TEXT',
            name: 'valid_field',
            type: 'keyword' as const,
            metadata: {},
          },
          {
            // missing required properties
            control: 'SELECT_BASIC',
          },
        ],
      },
    };

    const result = ParsedTemplateSchema.safeParse(templateWithInvalidField);

    expect(result.success).toBe(false);
  });

  it('rejects parsed template with duplicate field names', () => {
    const templateWithDuplicateFields = {
      ...validParsedTemplate,
      definition: {
        fields: [
          {
            control: 'INPUT_TEXT',
            name: 'duplicate_field',
            type: 'keyword' as const,
            metadata: {},
          },
          {
            control: 'SELECT_BASIC',
            name: 'duplicate_field',
            label: 'Duplicate Field',
            type: 'keyword' as const,
            metadata: { options: ['a', 'b'] },
          },
        ],
      },
    };

    const result = ParsedTemplateSchema.safeParse(templateWithDuplicateFields);

    expect(result.success).toBe(false);
  });
});

describe('ParsedTemplateDefinitionSchema', () => {
  const baseDefinition = {
    name: 'template-definition-name',
    fields: [],
  };

  it('validates a definition without connector or settings (both optional)', () => {
    const result = ParsedTemplateDefinitionSchema.safeParse(baseDefinition);

    expect(result.success).toBe(true);
  });

  describe('connector', () => {
    it('validates a Jira connector with its dynamic fields', () => {
      const result = ParsedTemplateDefinitionSchema.safeParse({
        ...baseDefinition,
        connector: {
          type: '.jira',
          id: 'my-jira-id',
          fields: { issueType: '10001', priority: 'High', parent: null },
        },
      });

      expect(result.success).toBe(true);
    });

    it('validates a ServiceNow ITSM connector', () => {
      const result = ParsedTemplateDefinitionSchema.safeParse({
        ...baseDefinition,
        connector: {
          type: '.servicenow',
          id: 'sn-id',
          fields: {
            impact: '2',
            severity: '1',
            urgency: '2',
            category: 'software',
            subcategory: null,
          },
        },
      });

      expect(result.success).toBe(true);
    });

    it('validates the .none connector', () => {
      const result = ParsedTemplateDefinitionSchema.safeParse({
        ...baseDefinition,
        connector: { type: '.none', id: 'none', fields: null },
      });

      expect(result.success).toBe(true);
    });

    it('does not require name on the connector', () => {
      const result = ParsedTemplateDefinitionSchema.safeParse({
        ...baseDefinition,
        connector: {
          type: '.jira',
          id: 'my-jira-id',
          fields: { issueType: '10001', priority: 'High', parent: null },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.connector).not.toHaveProperty('name');
      }
    });

    it('rejects a wrong-typed value for a known connector field', () => {
      const result = ParsedTemplateDefinitionSchema.safeParse({
        ...baseDefinition,
        connector: {
          type: '.jira',
          id: 'my-jira-id',
          // issueType must be string | null, not a number
          fields: { issueType: 123, priority: 'High', parent: null },
        },
      });

      expect(result.success).toBe(false);
    });

    it('strips a field key that does not belong to the connector type (structural union)', () => {
      // Runtime Zod parse strips unknown keys; the Monaco editor rejects them via the generated
      // JSON schema (`additionalProperties: false`) — covered in template_json_schema.test.ts.
      const result = ParsedTemplateDefinitionSchema.safeParse({
        ...baseDefinition,
        connector: {
          type: '.jira',
          id: 'my-jira-id',
          // `impact` belongs to ServiceNow, not Jira
          fields: { issueType: '10001', priority: 'High', parent: null, impact: '2' },
        },
      });

      expect(result.success).toBe(true);
      if (result.success && result.data.connector?.type === '.jira') {
        expect(result.data.connector.fields).not.toHaveProperty('impact');
      }
    });

    it('rejects a connector missing the id', () => {
      const result = ParsedTemplateDefinitionSchema.safeParse({
        ...baseDefinition,
        connector: {
          type: '.jira',
          fields: { issueType: '10001', priority: 'High', parent: null },
        },
      });

      expect(result.success).toBe(false);
    });

    it('rejects an unknown connector type', () => {
      const result = ParsedTemplateDefinitionSchema.safeParse({
        ...baseDefinition,
        connector: { type: '.not-a-connector', id: 'x', fields: null },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('settings', () => {
    it('validates syncAlerts and extractObservables', () => {
      const result = ParsedTemplateDefinitionSchema.safeParse({
        ...baseDefinition,
        settings: { syncAlerts: true, extractObservables: false },
      });

      expect(result.success).toBe(true);
    });

    it('allows either setting independently', () => {
      const syncOnly = ParsedTemplateDefinitionSchema.safeParse({
        ...baseDefinition,
        settings: { syncAlerts: false },
      });
      const extractOnly = ParsedTemplateDefinitionSchema.safeParse({
        ...baseDefinition,
        settings: { extractObservables: true },
      });

      expect(syncOnly.success).toBe(true);
      expect(extractOnly.success).toBe(true);
    });

    it('rejects a non-boolean setting value', () => {
      const result = ParsedTemplateDefinitionSchema.safeParse({
        ...baseDefinition,
        settings: { syncAlerts: 'yes' },
      });

      expect(result.success).toBe(false);
    });
  });
});

describe('CreateTemplateInputSchema', () => {
  const validCreateInput = {
    owner: 'securitySolution',
    definition: 'fields:\n  - name: test_field\n    type: keyword',
  };

  it('validates valid create template input', () => {
    const result = CreateTemplateInputSchema.safeParse(validCreateInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validCreateInput);
    }
  });

  it('strips templateId from input (omit behavior)', () => {
    const inputWithTemplateId = {
      ...validCreateInput,
      templateId: 'will-be-stripped',
    };

    const result = CreateTemplateInputSchema.safeParse(inputWithTemplateId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect('templateId' in result.data).toBe(false);
    }
  });

  it('strips templateVersion from input (omit behavior)', () => {
    const inputWithVersion = {
      ...validCreateInput,
      templateVersion: 1,
    };

    const result = CreateTemplateInputSchema.safeParse(inputWithVersion);

    expect(result.success).toBe(true);
    if (result.success) {
      expect('templateVersion' in result.data).toBe(false);
    }
  });

  it('strips deletedAt from input (omit behavior)', () => {
    const inputWithDeletedAt = {
      ...validCreateInput,
      deletedAt: null,
    };

    const result = CreateTemplateInputSchema.safeParse(inputWithDeletedAt);

    expect(result.success).toBe(true);
    if (result.success) {
      expect('deletedAt' in result.data).toBe(false);
    }
  });

  it('rejects create input missing required fields', () => {
    const incompleteInput = {
      name: 'New Template',
      // missing owner and definition
    };

    const result = CreateTemplateInputSchema.safeParse(incompleteInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('UpdateTemplateInputSchema', () => {
  const validUpdateInput = {
    owner: 'securitySolution',
    definition: 'fields:\n  - name: updated_field\n    type: keyword',
  };

  it('validates valid update template input', () => {
    const result = UpdateTemplateInputSchema.safeParse(validUpdateInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validUpdateInput);
    }
  });

  it('strips templateId from input (omit behavior)', () => {
    const inputWithTemplateId = {
      ...validUpdateInput,
      templateId: 'will-be-stripped',
    };

    const result = UpdateTemplateInputSchema.safeParse(inputWithTemplateId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect('templateId' in result.data).toBe(false);
    }
  });

  it('strips templateVersion from input (omit behavior)', () => {
    const inputWithVersion = {
      ...validUpdateInput,
      templateVersion: 2,
    };

    const result = UpdateTemplateInputSchema.safeParse(inputWithVersion);

    expect(result.success).toBe(true);
    if (result.success) {
      expect('templateVersion' in result.data).toBe(false);
    }
  });

  it('strips deletedAt from input (omit behavior)', () => {
    const inputWithDeletedAt = {
      ...validUpdateInput,
      deletedAt: '2024-01-15T10:00:00.000Z',
    };

    const result = UpdateTemplateInputSchema.safeParse(inputWithDeletedAt);

    expect(result.success).toBe(true);
    if (result.success) {
      expect('deletedAt' in result.data).toBe(false);
    }
  });

  it('accepts update input without name', () => {
    const updateWithoutName = {
      owner: 'securitySolution',
      definition: 'fields:\n  - name: updated_field\n    type: keyword',
    };

    const result = UpdateTemplateInputSchema.safeParse(updateWithoutName);

    expect(result.success).toBe(true);
  });

  it('requires owner and definition (PUT semantics)', () => {
    const partialUpdate = {
      // missing owner and definition
    };

    const result = UpdateTemplateInputSchema.safeParse(partialUpdate);

    expect(result.success).toBe(false);
  });
});

describe('PatchTemplateInputSchema', () => {
  it('validates patch with all fields', () => {
    const fullPatch = {
      name: 'Patched Template',
      owner: 'securitySolution',
      definition: 'fields:\n  - name: patched_field\n    type: keyword',
    };

    const result = PatchTemplateInputSchema.safeParse(fullPatch);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(fullPatch);
    }
  });

  it('validates patch with only name', () => {
    const namePatch = {
      name: 'New Name Only',
    };

    const result = PatchTemplateInputSchema.safeParse(namePatch);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(namePatch);
      expect('owner' in result.data).toBe(false);
      expect('definition' in result.data).toBe(false);
    }
  });

  it('validates patch with only owner', () => {
    const ownerPatch = {
      owner: 'cases',
    };

    const result = PatchTemplateInputSchema.safeParse(ownerPatch);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(ownerPatch);
    }
  });

  it('validates patch with only definition', () => {
    const definitionPatch = {
      definition: 'fields:\n  - name: single_field\n    type: keyword',
    };

    const result = PatchTemplateInputSchema.safeParse(definitionPatch);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(definitionPatch);
    }
  });

  it('validates empty patch object', () => {
    const emptyPatch = {};

    const result = PatchTemplateInputSchema.safeParse(emptyPatch);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({});
    }
  });

  it('validates patch with combination of fields', () => {
    const partialPatch = {
      name: 'Updated Name',
      definition: 'fields:\n  - name: new_field\n    type: keyword',
      // owner is intentionally omitted
    };

    const result = PatchTemplateInputSchema.safeParse(partialPatch);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Updated Name');
      expect(result.data.definition).toContain('new_field');
      expect('owner' in result.data).toBe(false);
    }
  });

  it('strips templateId from patch', () => {
    const patchWithTemplateId = {
      name: 'Updated',
      templateId: 'will-be-stripped',
    };

    const result = PatchTemplateInputSchema.safeParse(patchWithTemplateId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect('templateId' in result.data).toBe(false);
    }
  });

  it('strips templateVersion from patch', () => {
    const patchWithVersion = {
      name: 'Updated',
      templateVersion: 5,
    };

    const result = PatchTemplateInputSchema.safeParse(patchWithVersion);

    expect(result.success).toBe(true);
    if (result.success) {
      expect('templateVersion' in result.data).toBe(false);
    }
  });

  it('strips deletedAt from patch', () => {
    const patchWithDeletedAt = {
      name: 'Updated',
      deletedAt: '2024-01-15T10:00:00.000Z',
    };

    const result = PatchTemplateInputSchema.safeParse(patchWithDeletedAt);

    expect(result.success).toBe(true);
    if (result.success) {
      expect('deletedAt' in result.data).toBe(false);
    }
  });

  it('rejects patch with invalid field types', () => {
    const invalidPatch = {
      name: 123, // should be string
    };

    const result = PatchTemplateInputSchema.safeParse(invalidPatch);

    expect(result.success).toBe(false);
  });
});
