/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { SavedObject, Logger } from '@kbn/core/server';
import type { Template } from '../../../common/types/domain/template/v1';
import {
  buildExtendedFieldsFromTemplate,
  parseTemplateDefinition,
  resolveV2Template,
} from './v2_template_utils';
import type { CasesClient } from '../../client';
import type { FieldDefinition } from '../../../common/types/domain/field_definition/latest';

const mockLogger = loggingSystemMock.createLogger() as unknown as Logger;

const makeTemplateSO = (
  id: string,
  definition: string,
  overrides: Partial<Template> = {}
): SavedObject<Template> => ({
  id,
  type: 'cases-templates',
  references: [],
  attributes: {
    templateId: id,
    name: 'Test template',
    owner: 'securitySolution',
    definition,
    templateVersion: 1,
    deletedAt: null,
    ...overrides,
  },
});

const childYaml = `
name: "Child Template"
description: "Child description"
tags:
  - tag-child
severity: high
category: "Malware"
fields: []
`;

describe('parseTemplateDefinition', () => {
  it('parses valid YAML', () => {
    const result = parseTemplateDefinition(childYaml);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Child Template');
    expect(result?.description).toBe('Child description');
    expect(result?.tags).toEqual(['tag-child']);
    expect(result?.severity).toBe('high');
    expect(result?.category).toBe('Malware');
  });

  it('returns null for invalid YAML', () => {
    const result = parseTemplateDefinition(': bad yaml: [');
    expect(result).toBeNull();
  });

  it('returns null when schema validation fails (missing required name)', () => {
    const result = parseTemplateDefinition('description: "no name"\nfields: []');
    expect(result).toBeNull();
  });
});

describe('resolveV2Template', () => {
  const makeClient = (impl: Partial<CasesClient['templates']>): CasesClient =>
    ({
      templates: {
        getAllTemplates: jest.fn(),
        getTemplate: jest.fn(),
        createTemplate: jest.fn(),
        updateTemplate: jest.fn(),
        deleteTemplate: jest.fn(),
        getTags: jest.fn(),
        getAuthors: jest.fn(),
        ...impl,
      },
    } as unknown as CasesClient);

  beforeEach(() => jest.clearAllMocks());

  it('returns parsed definition for a valid template', async () => {
    const client = makeClient({
      getTemplate: jest.fn().mockResolvedValue(makeTemplateSO('t1', childYaml)),
    });

    const result = await resolveV2Template(client, 't1', '1', 'securitySolution', mockLogger);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Child Template');
  });

  it('returns null and logs warn when template not found', async () => {
    const client = makeClient({
      getTemplate: jest.fn().mockResolvedValue(undefined),
    });

    const result = await resolveV2Template(
      client,
      'missing-id',
      '1',
      'securitySolution',
      mockLogger
    );
    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('not found or has been deleted'),
      expect.any(Object)
    );
  });

  it('returns null and logs warn when template owner does not match', async () => {
    const client = makeClient({
      getTemplate: jest
        .fn()
        .mockResolvedValue(makeTemplateSO('t1', childYaml, { owner: 'observability' })),
    });

    const result = await resolveV2Template(client, 't1', '1', 'securitySolution', mockLogger);
    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('belongs to owner'),
      expect.any(Object)
    );
  });

  it('returns null and logs warn when definition YAML is invalid', async () => {
    const client = makeClient({
      getTemplate: jest.fn().mockResolvedValue(makeTemplateSO('t1', ': invalid yaml [')),
    });

    const result = await resolveV2Template(client, 't1', '1', 'securitySolution', mockLogger);
    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('invalid definition'),
      expect.any(Object)
    );
  });
});

describe('buildExtendedFieldsFromTemplate', () => {
  const makeClientWithDefs = (defs: FieldDefinition[]): CasesClient =>
    ({
      fieldDefinitions: {
        getFieldDefinitions: jest
          .fn()
          .mockResolvedValue({ fieldDefinitions: defs, total: defs.length }),
      },
    } as unknown as CasesClient);

  it('returns an empty map when the definition has no fields', async () => {
    const result = await buildExtendedFieldsFromTemplate(
      makeClientWithDefs([]),
      { name: 'T', fields: [] },
      'securitySolution'
    );
    expect(result).toEqual({});
  });

  it('coerces an inline numeric default to a string key', async () => {
    const result = await buildExtendedFieldsFromTemplate(
      makeClientWithDefs([]),
      {
        name: 'T',
        fields: [
          {
            name: 'count',
            type: 'long',
            control: 'INPUT_NUMBER',
            label: 'Count',
            metadata: { default: 42 },
          },
        ],
      },
      'securitySolution'
    );
    expect(result).toEqual({ count_as_long: '42' });
  });

  it('resolves a $ref field from the library and includes its default', async () => {
    const libraryDef: FieldDefinition = {
      fieldDefinitionId: 'fd-1',
      name: 'lib_field',
      owner: 'securitySolution',
      definition:
        'name: lib_field\ntype: keyword\ncontrol: INPUT_TEXT\nlabel: Lib field\nmetadata:\n  default: "from-library"',
    };

    const result = await buildExtendedFieldsFromTemplate(
      makeClientWithDefs([libraryDef]),
      { name: 'T', fields: [{ $ref: 'lib_field' }] },
      'securitySolution'
    );
    expect(result).toEqual({ lib_field_as_keyword: 'from-library' });
  });

  it('skips a $ref field that has no matching library definition', async () => {
    const result = await buildExtendedFieldsFromTemplate(
      makeClientWithDefs([]),
      { name: 'T', fields: [{ $ref: 'missing_field' }] },
      'securitySolution'
    );
    expect(result).toEqual({});
  });
});
