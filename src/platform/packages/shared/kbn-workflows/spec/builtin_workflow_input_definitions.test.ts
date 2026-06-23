/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import {
  builtinWorkflowInputDefinitionRefSchema,
  builtinWorkflowInputDefinitionRefValuesForZod,
  builtinWorkflowInputDefinitions,
  KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX,
  mergeKibanaBuiltinWorkflowInputDefinitionsIntoRootSchema,
} from './builtin_workflow_input_definitions';

describe('builtinWorkflowInputDefinitions', () => {
  it('registers alertingV2NotificationGroup with required top-level fields', () => {
    const schema = builtinWorkflowInputDefinitions.alertingV2NotificationGroup;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['id', 'policyId', 'groupKey', 'episodes']);
    expect(schema.properties?.id?.type).toBe('string');
    expect(schema.properties?.policyId?.type).toBe('string');
    expect(schema.properties?.groupKey?.type).toBe('object');
    expect(schema.properties?.episodes?.type).toBe('array');
  });

  it('keeps Monaco $ref enum values in sync with registry keys', () => {
    expect(builtinWorkflowInputDefinitionRefValuesForZod).toEqual(
      Object.keys(builtinWorkflowInputDefinitions).map(
        (id) => `${KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX}${id}`
      )
    );
  });

  it('accepts known built-in refs and rejects unbounded $ref strings in Zod', () => {
    const knownRef = builtinWorkflowInputDefinitionRefValuesForZod[0];
    expect(builtinWorkflowInputDefinitionRefSchema.safeParse(knownRef).success).toBe(true);
    expect(
      builtinWorkflowInputDefinitionRefSchema.safeParse('#/definitions/UserSchema').success
    ).toBe(true);
    expect(builtinWorkflowInputDefinitionRefSchema.safeParse('x'.repeat(513)).success).toBe(false);
  });

  it('merges built-in definitions under kibana.definitions without dropping existing entries', () => {
    const merged = mergeKibanaBuiltinWorkflowInputDefinitionsIntoRootSchema({
      type: 'object',
      kibana: {
        definitions: {
          customType: { type: 'string' },
        },
      },
    });

    expect(merged).toMatchObject({
      kibana: {
        definitions: {
          customType: { type: 'string' },
          alertingV2NotificationGroup: expect.objectContaining({ type: 'object' }),
        },
      },
    });
  });

  it('lets built-in definitions override colliding kibana.definitions keys', () => {
    const merged = mergeKibanaBuiltinWorkflowInputDefinitionsIntoRootSchema({
      kibana: {
        definitions: {
          alertingV2NotificationGroup: { type: 'string' },
        },
      },
    }) as { kibana: { definitions: { alertingV2NotificationGroup: { type: string } } } };

    expect(merged.kibana.definitions.alertingV2NotificationGroup.type).toBe('object');
  });

  it('exports $ref enum values through z.toJSONSchema for Monaco YAML autocomplete', () => {
    const jsonSchema = z.toJSONSchema(builtinWorkflowInputDefinitionRefSchema, {
      target: 'draft-7',
    }) as { enum?: string[]; anyOf?: Array<{ enum?: string[] }> };

    const enumValues =
      jsonSchema.enum ?? jsonSchema.anyOf?.flatMap((branch) => branch.enum ?? []) ?? [];

    expect(enumValues).toEqual(
      expect.arrayContaining([...builtinWorkflowInputDefinitionRefValuesForZod])
    );
  });
});
