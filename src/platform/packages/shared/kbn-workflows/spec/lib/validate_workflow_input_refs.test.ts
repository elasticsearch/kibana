/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isJsonSchemaPathValid, validateWorkflowInputRefs } from './validate_workflow_input_refs';
import {
  ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID,
  builtinWorkflowInputDefinitions,
  KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX,
} from '../builtin_workflow_input_definitions';
import type { WorkflowYaml } from '../schema';
import type { JsonSchema } from '../schema/common/json_model_shape_schema';

const NOTIFICATION_GROUP_REF = `${KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX}${ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID}`;

const notificationGroupSchema =
  builtinWorkflowInputDefinitions[ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID];

/** Minimal definition shape: `getInputsFromDefinition` falls back to root-level `inputs`. */
const definitionWithInputs = (inputs: unknown): Partial<WorkflowYaml> =>
  ({ inputs } as Partial<WorkflowYaml>);

const payloadDefinition = definitionWithInputs({
  properties: { payload: { $ref: NOTIFICATION_GROUP_REF } },
  required: ['payload'],
});

describe('isJsonSchemaPathValid', () => {
  it('treats the empty path as the schema root', () => {
    expect(isJsonSchemaPathValid('', notificationGroupSchema)).toBe(true);
  });

  it('accepts declared top-level properties', () => {
    expect(isJsonSchemaPathValid('policyId', notificationGroupSchema)).toBe(true);
    expect(isJsonSchemaPathValid('episodes', notificationGroupSchema)).toBe(true);
  });

  it('rejects undeclared properties', () => {
    expect(isJsonSchemaPathValid('policyName', notificationGroupSchema)).toBe(false);
  });

  it('walks into array items through a numeric index', () => {
    expect(isJsonSchemaPathValid('episodes[0].episode_status', notificationGroupSchema)).toBe(true);
  });

  it('rejects non-numeric array access', () => {
    expect(isJsonSchemaPathValid('episodes.first', notificationGroupSchema)).toBe(false);
  });

  it('rejects fields an array item does not declare', () => {
    expect(isJsonSchemaPathValid('episodes[0].not_a_field', notificationGroupSchema)).toBe(false);
  });

  // The Zod walk the editor uses drops `additionalProperties: true`, so these paths are the
  // reason this check reads the JSON Schema instead. Keep them if that walk is revisited.
  it('accepts any key below an open map, at any depth', () => {
    expect(isJsonSchemaPathValid('groupKey.whatever', notificationGroupSchema)).toBe(true);
    expect(isJsonSchemaPathValid("rules['rule-1'].name", notificationGroupSchema)).toBe(true);
    expect(isJsonSchemaPathValid('episodes[0].data.host.name.deep', notificationGroupSchema)).toBe(
      true
    );
  });

  it('rejects paths that walk past a scalar', () => {
    expect(isJsonSchemaPathValid('policyId.length', notificationGroupSchema)).toBe(false);
  });

  it('rejects a closed object with no matching property', () => {
    const closed: JsonSchema = {
      type: 'object',
      properties: { known: { type: 'string' } },
      additionalProperties: false,
    };
    expect(isJsonSchemaPathValid('unknown', closed)).toBe(false);
  });

  it('cannot index a tuple schema', () => {
    const tuple: JsonSchema = {
      type: 'array',
      items: [{ type: 'object', properties: { a: { type: 'string' } } }, { type: 'string' }],
    };
    // The first item schema stands in for every slot, so `a` resolves but `b` does not.
    expect(isJsonSchemaPathValid('0.a', tuple)).toBe(true);
    expect(isJsonSchemaPathValid('0.b', tuple)).toBe(false);
  });

  describe('nested $ref', () => {
    const rootSchema = {
      properties: { wrapper: { $ref: '#/definitions/Inner' } },
      definitions: {
        Inner: { type: 'object' as const, properties: { name: { type: 'string' as const } } },
      },
    };
    const wrapper: JsonSchema = {
      type: 'object',
      properties: { inner: { $ref: '#/definitions/Inner' } },
    };

    // The Zod walk turns a nested `$ref` into `z.any()`, which would accept `inner.missing`.
    it('follows the ref when a root schema is supplied', () => {
      expect(isJsonSchemaPathValid('inner.name', wrapper, { rootSchema })).toBe(true);
      expect(isJsonSchemaPathValid('inner.missing', wrapper, { rootSchema })).toBe(false);
    });

    it('fails the walk when no root schema is supplied', () => {
      expect(isJsonSchemaPathValid('inner.name', wrapper)).toBe(false);
    });
  });
});

describe('validateWorkflowInputRefs', () => {
  it('returns nothing when no refs are expected', () => {
    expect(
      validateWorkflowInputRefs({
        definition: definitionWithInputs(undefined),
        templateVariables: ['inputs.payload.nope'],
        expectedInputRefs: [],
      })
    ).toEqual([]);
  });

  it('accepts a workflow that declares the ref and uses only known fields', () => {
    expect(
      validateWorkflowInputRefs({
        definition: payloadDefinition,
        templateVariables: [
          'inputs.payload.policyId',
          'inputs.payload.episodes',
          'inputs.payload.episodes[0].severity',
          'inputs.payload.episodes[0].data.host.name',
          'inputs.payload.rules',
        ],
        expectedInputRefs: [NOTIFICATION_GROUP_REF],
      })
    ).toEqual([]);
  });

  it('ignores template variables outside the ref-bound input', () => {
    expect(
      validateWorkflowInputRefs({
        definition: payloadDefinition,
        templateVariables: ['steps.foo.output', 'consts.bar', 'inputs.other.baz'],
        expectedInputRefs: [NOTIFICATION_GROUP_REF],
      })
    ).toEqual([]);
  });

  it('reports a missing declaration and lists the inputs that are declared', () => {
    const violations = validateWorkflowInputRefs({
      definition: definitionWithInputs({ properties: { somethingElse: { type: 'string' } } }),
      templateVariables: [],
      expectedInputRefs: [NOTIFICATION_GROUP_REF],
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      ref: NOTIFICATION_GROUP_REF,
      reason: 'missing_input_ref',
    });
    expect(violations[0].message).toContain('somethingElse');
  });

  it('reports a missing declaration when the workflow declares no inputs at all', () => {
    const violations = validateWorkflowInputRefs({
      definition: definitionWithInputs(undefined),
      templateVariables: [],
      expectedInputRefs: [NOTIFICATION_GROUP_REF],
    });

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('missing_input_ref');
    expect(violations[0].message).toContain('(none)');
  });

  it('reports a ref that resolves to no known schema', () => {
    const unknownRef = `${KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX}doesNotExist`;
    const violations = validateWorkflowInputRefs({
      definition: definitionWithInputs({ properties: { payload: { $ref: unknownRef } } }),
      templateVariables: [],
      expectedInputRefs: [unknownRef],
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      ref: unknownRef,
      inputName: 'payload',
      reason: 'unresolvable_input_ref',
    });
  });

  it('reports each path the ref schema does not allow', () => {
    const violations = validateWorkflowInputRefs({
      definition: payloadDefinition,
      templateVariables: [
        'inputs.payload.policyId',
        'inputs.payload.policyName',
        'inputs.payload.episodes[0].nope',
      ],
      expectedInputRefs: [NOTIFICATION_GROUP_REF],
    });

    expect(violations).toHaveLength(2);
    expect(violations.map(({ path }) => path)).toEqual([
      'inputs.payload.policyName',
      'inputs.payload.episodes[0].nope',
    ]);
    expect(violations.every(({ reason }) => reason === 'unknown_input_ref_path')).toBe(true);
    expect(violations[0].message).toContain('episodes');
  });

  it('accepts a bare reference to the ref-bound input', () => {
    expect(
      validateWorkflowInputRefs({
        definition: payloadDefinition,
        templateVariables: ['inputs.payload'],
        expectedInputRefs: [NOTIFICATION_GROUP_REF],
      })
    ).toEqual([]);
  });

  it('checks every input bound to the ref', () => {
    const violations = validateWorkflowInputRefs({
      definition: definitionWithInputs({
        properties: {
          primary: { $ref: NOTIFICATION_GROUP_REF },
          secondary: { $ref: NOTIFICATION_GROUP_REF },
        },
      }),
      templateVariables: ['inputs.primary.bogus', 'inputs.secondary.bogus'],
      expectedInputRefs: [NOTIFICATION_GROUP_REF],
    });

    expect(violations.map(({ inputName }) => inputName)).toEqual(['primary', 'secondary']);
  });

  it('reports each expected ref independently', () => {
    const violations = validateWorkflowInputRefs({
      definition: payloadDefinition,
      templateVariables: [],
      expectedInputRefs: [NOTIFICATION_GROUP_REF, '#/definitions/SomethingElse'],
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      ref: '#/definitions/SomethingElse',
      reason: 'missing_input_ref',
    });
  });

  it('reads inputs from the manual trigger when present', () => {
    const violations = validateWorkflowInputRefs({
      definition: {
        triggers: [
          {
            type: 'manual',
            inputs: { properties: { payload: { $ref: NOTIFICATION_GROUP_REF } } },
          },
        ],
      } as unknown as Partial<WorkflowYaml>,
      templateVariables: ['inputs.payload.bogus'],
      expectedInputRefs: [NOTIFICATION_GROUP_REF],
    });

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('unknown_input_ref_path');
  });
});
