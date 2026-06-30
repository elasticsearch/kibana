/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DynamicStepContextSchema, ForEachContextSchema } from '@kbn/workflows';
import { expectZodSchemaEqual } from '@kbn/workflows/common/utils/zod/test_utils/expect_zod_schema_equal';
import { z } from '@kbn/zod/v4';
import {
  FOREACH_ITEM_SCHEMA_DESC,
  getForeachCollectionDiagnostic,
  getForeachItemSchema,
  getForeachStateSchema,
} from './get_foreach_state_schema';

describe('getForeachStateSchema', () => {
  it('should return plain foreach state if item type is not inferable', () => {
    const stepContext = DynamicStepContextSchema;
    const foreachStateSchema = getForeachStateSchema(stepContext, {
      foreach: '{{some.path.to.items}}',
      type: 'foreach',
      name: 'foreach-step',
    });
    expect(foreachStateSchema).toBeDefined();
    expect(foreachStateSchema.shape.item.description).toMatch(/Unable to parse foreach parameter/);
  });

  it('should return foreach state with item type if it is possible to infer from previous step output', () => {
    const itemSchema = z.object({ name: z.string(), surname: z.string() });
    const stepContext = DynamicStepContextSchema.extend({
      steps: z.object({
        previous_step: z.object({
          output: z.array(itemSchema),
        }),
      }),
    });
    const foreachStateSchema = getForeachStateSchema(stepContext, {
      foreach: '{{steps.previous_step.output}}',
      type: 'foreach',
      name: 'foreach-step',
    });
    expectZodSchemaEqual(
      foreachStateSchema,
      ForEachContextSchema.extend({
        item: itemSchema,
        items: z.array(itemSchema),
      })
    );
  });

  it('should return foreach state with item type if it is possible to infer from consts items', () => {
    const itemSchema = z.object({ name: z.string(), surname: z.string() });
    const stepContext = DynamicStepContextSchema.extend({
      consts: z.object({
        items: z.array(itemSchema),
      }),
    });
    const foreachStateSchema = getForeachStateSchema(stepContext, {
      foreach: '{{consts.items}}',
      type: 'foreach',
      name: 'foreach-step',
    });
    expectZodSchemaEqual(
      foreachStateSchema,
      ForEachContextSchema.extend({
        item: itemSchema,
        items: z.array(itemSchema),
      })
    );
  });

  it('should return an unknown schema with a description if inferred type is not an array', () => {
    const stepContext = DynamicStepContextSchema.extend({
      consts: z.object({
        items: z.object({ name: z.string(), surname: z.string() }),
      }),
    });
    const foreachStateSchema = getForeachStateSchema(stepContext, {
      foreach: '{{consts.items}}',
      type: 'foreach',
      name: 'foreach-step',
    });
    expect(foreachStateSchema).toBeDefined();
    expect(foreachStateSchema.shape.item.description).toMatch(
      /Expected array for foreach iteration, but got object/
    );
  });

  it('should try to parse the foreach parameter as JSON if it is not a valid variable path', () => {
    const stepContext = DynamicStepContextSchema.extend({
      consts: z.object({
        items: z.object({ name: z.string(), surname: z.string() }),
      }),
    });
    const foreachStateSchema = getForeachStateSchema(stepContext, {
      foreach: '[{"name": "item1"}, {"name": "item2"}, {"name": "item3"}]',
      type: 'foreach',
      name: 'foreach-step',
    });
    expectZodSchemaEqual(
      foreachStateSchema,
      ForEachContextSchema.extend({
        item: z.object({ name: z.string() }),
        items: z.array(z.object({ name: z.string() })),
      })
    );
  });

  it('should handle array foreach input', () => {
    const stepContext = DynamicStepContextSchema.extend({
      consts: z.object({
        items: z.object({ name: z.string(), surname: z.string() }),
      }),
    });
    const foreachStateSchema = getForeachStateSchema(stepContext, {
      foreach: [{ name: 'item1' }, { name: 'item2' }, { name: 'item3' }],
      type: 'foreach',
      name: 'foreach-step',
    });
    expectZodSchemaEqual(
      foreachStateSchema,
      ForEachContextSchema.extend({
        item: z.object({ name: z.string() }),
        items: z.array(z.object({ name: z.string() })),
      })
    );
  });

  it('should return {key, value} item schema when object has | entries filter', () => {
    const stepContext = DynamicStepContextSchema.extend({
      consts: z.object({
        settings: z.object({ name: z.string(), surname: z.string() }),
      }),
    });
    const foreachStateSchema = getForeachStateSchema(stepContext, {
      foreach: '{{consts.settings | entries}}',
      type: 'foreach',
      name: 'foreach-step',
    });
    expectZodSchemaEqual(
      foreachStateSchema,
      ForEachContextSchema.extend({
        item: z.object({ key: z.string(), value: z.unknown() }),
        items: z.array(z.object({ key: z.string(), value: z.unknown() })),
      })
    );
  });

  it('should return {key, value} item schema for deeply nested object with | entries filter and spaces', () => {
    const stepContext = DynamicStepContextSchema.extend({
      consts: z.object({
        es_settings_response: z.object({
          '.ds-logs-docker-000001': z.object({
            settings: z.object({
              index: z.object({
                lifecycle: z.object({ name: z.literal('old-policy') }),
              }),
            }),
          }),
        }),
      }),
    });
    const foreachStateSchema = getForeachStateSchema(stepContext, {
      foreach: '{{ consts.es_settings_response | entries }}',
      type: 'foreach',
      name: 'foreach-step',
    });
    expectZodSchemaEqual(
      foreachStateSchema,
      ForEachContextSchema.extend({
        item: z.object({ key: z.string(), value: z.unknown() }),
        items: z.array(z.object({ key: z.string(), value: z.unknown() })),
      })
    );
  });

  it('should return an unknown schema with a description if the foreach parameter is not a valid JSON', () => {
    const stepContext = DynamicStepContextSchema.extend({
      consts: z.object({
        items: z.object({ name: z.string(), surname: z.string() }),
      }),
    });
    const foreachStateSchema = getForeachStateSchema(stepContext, {
      foreach: 'invalid json',
      type: 'foreach',
      name: 'foreach-step',
    });
    expect(foreachStateSchema).toBeDefined();
    expect(foreachStateSchema.shape.item.description).toMatch(
      /Unable to parse foreach parameter as JSON/
    );
  });
});

describe('getForeachCollectionDiagnostic', () => {
  it('returns null when item schema is resolved', () => {
    const itemSchema = z.object({ id: z.string() });
    const stepContext = DynamicStepContextSchema.extend({
      steps: z.object({
        previous: z.object({ output: z.array(itemSchema) }),
      }),
    });
    const resolved = getForeachItemSchema(stepContext, 'steps.previous.output');
    expect(getForeachCollectionDiagnostic(resolved, 'steps.previous.output')).toBeNull();
  });

  it('returns error when path cannot be resolved', () => {
    const unresolved = getForeachItemSchema(DynamicStepContextSchema, 'steps.missing.output');
    expect(getForeachCollectionDiagnostic(unresolved, 'steps.missing.output')).toEqual({
      message: 'Collection steps.missing.output is invalid',
      severity: 'error',
    });
    expect(unresolved.description).toBe(FOREACH_ITEM_SCHEMA_DESC.UNRESOLVED_PATH);
  });

  it('returns warning for runtime JSON string collections', () => {
    const stepContext = DynamicStepContextSchema.extend({
      steps: z.object({
        previous: z.object({ output: z.string() }),
      }),
    });
    const runtimeJson = getForeachItemSchema(stepContext, 'steps.previous.output');
    expect(getForeachCollectionDiagnostic(runtimeJson, 'steps.previous.output')).toEqual({
      message: FOREACH_ITEM_SCHEMA_DESC.RUNTIME_JSON,
      severity: 'warning',
    });
  });
});
