/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { generateYamlSchemaFromConnectors } from './generate_yaml_schema_from_connectors';
import { getWorkflowJsonSchema } from './get_workflow_json_schema';
import { getValidateWithYamlLsp } from './test_utils/validate_with_yaml_lsp';
import {
  builtinWorkflowInputDefinitionRefValuesForZod,
  KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX,
} from '../builtin_workflow_input_definitions';
import { JsonModelShapeSchema } from '../schema/common/json_model_shape_schema';

const BUILTIN_REF = `${KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX}alertingV2NotificationGroup`;

const WORKFLOW_WITH_BUILTIN_INPUT_REF = `
name: Built-in input ref workflow
version: "1"
enabled: true
triggers:
  - type: manual
    inputs:
      properties:
        notificationGroup:
          $ref: "${BUILTIN_REF}"
      required: [notificationGroup]
steps:
  - name: wait
    type: wait
    with:
      duration: 1s
`;

function collectBuiltinRefEnumValues(node: unknown, enumValues: string[] = []): string[] {
  if (!node || typeof node !== 'object') {
    return enumValues;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectBuiltinRefEnumValues(item, enumValues);
    }
    return enumValues;
  }

  const record = node as Record<string, unknown>;
  if (Array.isArray(record.enum)) {
    for (const value of record.enum) {
      if (
        typeof value === 'string' &&
        value.startsWith(KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX)
      ) {
        enumValues.push(value);
      }
    }
  }

  if (Array.isArray(record.anyOf)) {
    for (const branch of record.anyOf) {
      collectBuiltinRefEnumValues(branch, enumValues);
    }
  }

  for (const value of Object.values(record)) {
    collectBuiltinRefEnumValues(value, enumValues);
  }

  return enumValues;
}

describe('built-in workflow input definitions — Monaco / YAML editor schema', () => {
  it('surfaces built-in $ref enum on JsonModelShapeSchema for autocomplete', () => {
    const jsonSchema = z.toJSONSchema(JsonModelShapeSchema, { target: 'draft-7' });
    const enumValues = collectBuiltinRefEnumValues(jsonSchema);

    expect(enumValues).toEqual(
      expect.arrayContaining([...builtinWorkflowInputDefinitionRefValuesForZod])
    );
  });

  it('merges kibana.definitions into getWorkflowJsonSchema for $ref resolution', () => {
    const jsonSchema = getWorkflowJsonSchema(generateYamlSchemaFromConnectors([]));
    expect(jsonSchema).toMatchObject({
      kibana: {
        definitions: {
          alertingV2NotificationGroup: expect.objectContaining({ type: 'object' }),
        },
      },
    });
  });

  it('includes built-in $ref enum in workflow YAML JSON Schema used by Monaco', () => {
    const jsonSchema = getWorkflowJsonSchema(generateYamlSchemaFromConnectors([]));
    const enumValues = collectBuiltinRefEnumValues(jsonSchema);

    expect(enumValues).toEqual(
      expect.arrayContaining([...builtinWorkflowInputDefinitionRefValuesForZod])
    );
  });

  it('validates workflow YAML that references a built-in kibana definition via yaml-language-server', async () => {
    const jsonSchema = getWorkflowJsonSchema(generateYamlSchemaFromConnectors([]));
    if (!jsonSchema) {
      throw new Error('expected workflow JSON schema');
    }

    const validateWithYamlLsp = getValidateWithYamlLsp(jsonSchema as z.core.JSONSchema.JSONSchema);
    const diagnostics = await validateWithYamlLsp(
      'builtin_input_ref_workflow.yaml',
      WORKFLOW_WITH_BUILTIN_INPUT_REF
    );

    const inputRefDiagnostics = diagnostics.filter((diagnostic) =>
      diagnostic.path.includes('notificationGroup.$ref')
    );
    expect(inputRefDiagnostics).toEqual([]);
  });

  it('does not schema-reject unknown #/kibana/definitions refs (enum is suggest-only; union allows strings)', async () => {
    const jsonSchema = getWorkflowJsonSchema(generateYamlSchemaFromConnectors([]));
    if (!jsonSchema) {
      throw new Error('expected workflow JSON schema');
    }

    const unknownRefYaml = WORKFLOW_WITH_BUILTIN_INPUT_REF.replace(
      BUILTIN_REF,
      '#/kibana/definitions/not-a-real-built-in-type'
    );

    const validateWithYamlLsp = getValidateWithYamlLsp(jsonSchema as z.core.JSONSchema.JSONSchema);
    const diagnostics = await validateWithYamlLsp(
      'unknown_builtin_ref_workflow.yaml',
      unknownRefYaml
    );

    const inputRefDiagnostics = diagnostics.filter((diagnostic) =>
      diagnostic.path.includes('notificationGroup.$ref')
    );
    expect(inputRefDiagnostics).toEqual([]);
  });
});
