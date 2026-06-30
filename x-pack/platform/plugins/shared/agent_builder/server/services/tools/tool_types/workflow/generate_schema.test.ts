/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { WorkflowDetailDto } from '@kbn/workflows/types/v1';
import { generateSchema } from './generate_schema';

function buildWorkflow(overrides: Partial<WorkflowDetailDto> = {}): WorkflowDetailDto {
  return {
    id: 'wf-test',
    name: 'Test workflow',
    enabled: true,
    createdAt: '2020-01-01T00:00:00.000Z',
    createdBy: 'test',
    lastUpdatedAt: '2020-01-01T00:00:00.000Z',
    lastUpdatedBy: 'test',
    yaml: '',
    valid: true,
    definition: {
      name: 'Test',
      version: '1',
      enabled: true,
      steps: [],
      triggers: [{ type: 'manual' }],
      inputs: [],
    },
    ...overrides,
  } as WorkflowDetailDto;
}

describe('generateSchema', () => {
  it('maps normalized choice (string + enum) to a Zod enum so tool JSON Schema lists allowed strings', () => {
    const workflow = buildWorkflow({
      definition: {
        name: 'Test',
        version: '1',
        enabled: true,
        steps: [],
        triggers: [
          {
            type: 'manual',
            inputs: [
              {
                name: 'tool_name',
                type: 'choice' as const,
                options: ['search_code', 'search_repositories'],
                description: 'Tool to use',
                required: true,
              },
            ],
          },
        ],
      } as WorkflowDetailDto['definition'],
    });

    const schema = generateSchema({ workflow });
    const jsonSchema = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });

    expect(jsonSchema.properties?.tool_name).toMatchObject({
      type: 'string',
      enum: ['search_code', 'search_repositories'],
      description: 'Tool to use',
    });
  });

  it('maps plain string inputs without enum to an unrestricted string', () => {
    const workflow = buildWorkflow({
      definition: {
        name: 'Test',
        version: '1',
        enabled: true,
        steps: [],
        triggers: [
          {
            type: 'manual',
            inputs: [
              {
                name: 'query',
                type: 'string' as const,
                required: false,
              },
            ],
          },
        ],
      } as WorkflowDetailDto['definition'],
    });

    const schema = generateSchema({ workflow });
    const jsonSchema = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });

    expect(jsonSchema.properties?.query).toMatchObject({ type: 'string' });
    expect(jsonSchema.properties?.query).not.toHaveProperty('enum');
  });

  it('maps legacy root-level inputs to workflow tool parameters', () => {
    const workflow = buildWorkflow({
      definition: {
        name: 'Test',
        version: '1',
        enabled: true,
        steps: [],
        triggers: [{ type: 'manual' }],
        inputs: [
          {
            name: 'query',
            type: 'string' as const,
            required: true,
            description: 'Search query',
          },
          {
            name: 'limit',
            type: 'number' as const,
            required: false,
          },
        ],
      } as WorkflowDetailDto['definition'],
    });

    const schema = generateSchema({ workflow });
    const jsonSchema = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });

    expect(jsonSchema.properties?.query).toMatchObject({
      type: 'string',
      description: 'Search query',
    });
    expect(jsonSchema.properties?.limit).toMatchObject({ type: 'number' });
    expect(jsonSchema.required).toContain('query');
    expect(jsonSchema.required).not.toContain('limit');
  });

  it('maps JSON Schema object inputs with string enum to the same enum list', () => {
    const workflow = buildWorkflow({
      definition: {
        name: 'Test',
        version: '1',
        enabled: true,
        steps: [],
        triggers: [
          {
            type: 'manual',
            inputs: {
              properties: {
                status: {
                  type: 'string',
                  enum: ['active', 'inactive'],
                },
              },
              required: ['status'],
            },
          },
        ],
      },
    });

    const schema = generateSchema({ workflow });
    const jsonSchema = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });

    expect(jsonSchema.properties?.status).toMatchObject({
      type: 'string',
      enum: ['active', 'inactive'],
    });
  });
});
