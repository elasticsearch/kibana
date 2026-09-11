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
  CONNECTOR_ID_MAX_LENGTH,
  type ConnectorContractUnion,
  generateYamlSchemaFromConnectors,
  TEMPLATE_EXPRESSION_MAX_LENGTH,
} from '../..';

const BASE_WORKFLOW = {
  name: 'test',
  triggers: [{ type: 'manual' }],
};

describe('generateYamlSchemaFromConnectors', () => {
  describe('strict mode', () => {
    it('should generate a valid YAML schema from connectors', () => {
      const connectors: ConnectorContractUnion[] = [
        {
          summary: 'Console',
          description: 'Console',
          type: 'console',
          paramsSchema: z.object({
            message: z.string(),
          }),
          outputSchema: z.object({
            message: z.string(),
          }),
        },
      ];
      const schema = generateYamlSchemaFromConnectors(connectors);
      expect(schema).toBeDefined();
    });

    it('rejects an empty steps array when the other required fields are valid', () => {
      const connectors: ConnectorContractUnion[] = [
        {
          summary: 'Console',
          description: 'Console',
          type: 'console',
          paramsSchema: z.object({
            message: z.string(),
          }),
          outputSchema: z.object({
            message: z.string(),
          }),
        },
      ];
      const schema = generateYamlSchemaFromConnectors(connectors);

      expect(() =>
        schema.parse({
          ...BASE_WORKFLOW,
          steps: [],
        })
      ).toThrow();
    });
  });

  describe('with field optionality', () => {
    it('does not require `with` for a step whose paramsSchema has no fields', () => {
      const connectors: ConnectorContractUnion[] = [
        {
          summary: 'No-input step',
          description: null,
          type: 'data.parseJson',
          paramsSchema: z.object({}),
          outputSchema: z.unknown(),
        },
      ];
      const schema = generateYamlSchemaFromConnectors(connectors);
      // Should parse fine without `with`
      expect(() =>
        schema.parse({
          ...BASE_WORKFLOW,
          steps: [{ name: 'parse', type: 'data.parseJson' }],
        })
      ).not.toThrow();
    });

    it('does not require `with` for a step whose paramsSchema has only optional fields', () => {
      const connectors: ConnectorContractUnion[] = [
        {
          summary: 'All-optional step',
          description: null,
          type: 'my.step',
          paramsSchema: z.object({ message: z.string().optional() }),
          outputSchema: z.unknown(),
        },
      ];
      const schema = generateYamlSchemaFromConnectors(connectors);
      expect(() =>
        schema.parse({
          ...BASE_WORKFLOW,
          steps: [{ name: 'step', type: 'my.step' }],
        })
      ).not.toThrow();
    });

    it('rejects a step connector-id longer than CONNECTOR_ID_MAX_LENGTH', () => {
      const connectors: ConnectorContractUnion[] = [
        {
          summary: 'Slack',
          description: null,
          type: 'slack',
          hasConnectorId: 'required',
          paramsSchema: z.object({ message: z.string().optional() }),
          outputSchema: z.unknown(),
        },
      ];
      const schema = generateYamlSchemaFromConnectors(connectors);

      expect(
        schema.safeParse({
          ...BASE_WORKFLOW,
          steps: [
            {
              name: 'notify',
              type: 'slack',
              'connector-id': 'x'.repeat(CONNECTOR_ID_MAX_LENGTH + 1),
            },
          ],
        }).success
      ).toBe(false);

      expect(
        schema.safeParse({
          ...BASE_WORKFLOW,
          steps: [
            {
              name: 'notify',
              type: 'slack',
              'connector-id': 'x'.repeat(CONNECTOR_ID_MAX_LENGTH),
            },
          ],
        }).success
      ).toBe(true);
    });

    it('requires `with` for a step that has required params', () => {
      const connectors: ConnectorContractUnion[] = [
        {
          summary: 'Required-input step',
          description: null,
          type: 'my.requiredStep',
          paramsSchema: z.object({ message: z.string() }),
          outputSchema: z.unknown(),
        },
      ];
      const schema = generateYamlSchemaFromConnectors(connectors);
      expect(() =>
        schema.parse({
          ...BASE_WORKFLOW,
          steps: [{ name: 'step', type: 'my.requiredStep' }],
        })
      ).toThrow();
    });
  });

  describe('lazy step union memoization', () => {
    it('returns the same discriminated union instance across visits', () => {
      const connectors: ConnectorContractUnion[] = [
        {
          summary: 'A',
          description: null,
          type: 'a.step',
          paramsSchema: z.object({}),
          outputSchema: z.unknown(),
        },
        {
          summary: 'B',
          description: null,
          type: 'b.step',
          paramsSchema: z.object({}),
          outputSchema: z.unknown(),
        },
      ];

      const schema = generateYamlSchemaFromConnectors(connectors) as z.ZodObject;
      const stepsArray = schema.shape.steps as z.ZodArray<z.ZodLazy<z.ZodType>>;
      const lazy = stepsArray.def.element as z.ZodLazy<z.ZodType>;
      const getter = (lazy as unknown as { _def: { getter: () => z.ZodType } })._def.getter;

      const first = getter();
      const second = getter();
      // Required for `z.toJSONSchema({ reused: 'ref' })` to dedupe via `$ref`.
      expect(first).toBe(second);
    });

    it('rejects a malformed `steps` mapping quickly', () => {
      const connectors: ConnectorContractUnion[] = Array.from({ length: 40 }, (_, i) => ({
        summary: `Connector ${i}`,
        description: null,
        type: `conn.${i}`,
        paramsSchema: z.object({ message: z.string().optional() }),
        outputSchema: z.unknown(),
      }));

      const schema = generateYamlSchemaFromConnectors(connectors);

      // Shape produced by pasting steps without a leading dash: `steps`
      // becomes a map instead of an array.
      const start = Date.now();
      const result = schema.safeParse({
        ...BASE_WORKFLOW,
        steps: { name: 'filter_results', type: 'conn.0' },
      });
      const elapsed = Date.now() - start;

      expect(result.success).toBe(false);
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('withTemplateStringSupport (array field widening)', () => {
    const arrayConnector: ConnectorContractUnion = {
      summary: 'Notifier',
      description: null,
      type: 'notify',
      paramsSchema: z.object({
        recipients: z.array(z.string()),
        subject: z.string(),
      }),
      outputSchema: z.unknown(),
    };

    const parse = (withValue: unknown) =>
      generateYamlSchemaFromConnectors([arrayConnector]).safeParse({
        ...BASE_WORKFLOW,
        steps: [{ name: 'step', type: 'notify', with: withValue }],
      });

    it('accepts a ${{ expr }} template for an array param', () => {
      expect(
        parse({ recipients: '${{ workflow.inputs.recipients }}', subject: 'hi' }).success
      ).toBe(true);
    });

    // Only `${{ … }}` survives as an array at runtime: WorkflowTemplatingEngine returns the raw
    // evaluated value for that form only, and renders everything else to a string. Accepting any
    // of the shapes below would let YAML be saved that hands the connector a string — or, for the
    // multi-expression forms, throws "The provided expression is invalid" mid-execution, because
    // evaluateExpression slices from the first `{{` to the last `}}`.
    it.each([
      ['a plain string', 'not-a-template'],
      ['a bare {{ expr }} template (renders to a string, not an array)', '{{ recipients }}'],
      ['text before the expression', 'prefix-${{ expr }}'],
      ['text after the expression', '${{ expr }}-suffix'],
      ['two concatenated expressions', '${{ a }}-${{ b }}'],
      ['an expression with literal text between two others', '${{ a }} literal ${{ b }}'],
      ['leading whitespace (the runtime check does not trim)', '  ${{ expr }}'],
      ['trailing whitespace (the runtime check does not trim)', '${{ expr }}  '],
    ])('rejects %s for an array param', (_label, recipients) => {
      expect(parse({ recipients, subject: 'hi' }).success).toBe(false);
    });

    it('rejects a template string exceeding TEMPLATE_EXPRESSION_MAX_LENGTH', () => {
      const long = `\${{ ${'x'.repeat(TEMPLATE_EXPRESSION_MAX_LENGTH)} }}`;
      expect(parse({ recipients: long, subject: 'hi' }).success).toBe(false);
    });

    it('does not widen non-array fields — string params remain string-only', () => {
      expect(parse({ recipients: ['a@b.com'], subject: '{{ not-widened }}' }).success).toBe(true);
      // A real Liquid expression is still valid as a string value, but a plain array is not
      expect(parse({ recipients: ['a@b.com'], subject: ['array', 'not', 'ok'] }).success).toBe(
        false
      );
    });

    it('widens optional array params and preserves optionality', () => {
      const connector: ConnectorContractUnion = {
        summary: 'Opt',
        description: null,
        type: 'opt.step',
        paramsSchema: z.object({ tags: z.array(z.string()).optional() }),
        outputSchema: z.unknown(),
      };
      const schema = generateYamlSchemaFromConnectors([connector]);
      // template string accepted
      expect(
        schema.safeParse({
          ...BASE_WORKFLOW,
          steps: [{ name: 's', type: 'opt.step', with: { tags: '${{ workflow.inputs.tags }}' } }],
        }).success
      ).toBe(true);
      // omitting the optional field is still valid
      expect(
        schema.safeParse({
          ...BASE_WORKFLOW,
          steps: [{ name: 's', type: 'opt.step', with: {} }],
        }).success
      ).toBe(true);
    });

    it('widens default-wrapped array params without making them required', () => {
      const connector: ConnectorContractUnion = {
        summary: 'Def',
        description: null,
        type: 'def.step',
        // Mirrors a real shipped connector: InferenceRerankParamsSchema declares
        // `input: z.array(z.string()).default([])` as a top-level param.
        paramsSchema: z.object({ tags: z.array(z.string()).default([]), query: z.string() }),
        outputSchema: z.unknown(),
      };
      const schema = generateYamlSchemaFromConnectors([connector]);
      expect(
        schema.safeParse({
          ...BASE_WORKFLOW,
          steps: [
            {
              name: 's',
              type: 'def.step',
              with: { tags: '${{ workflow.inputs.tags }}', query: 'q' },
            },
          ],
        }).success
      ).toBe(true);

      // Widening must not strip `.default()`. If it did, every existing workflow that omits a
      // defaulted array param would stop validating — including on update, since this schema
      // gates persistence and not just editor feedback.
      const omitted = schema.safeParse({
        ...BASE_WORKFLOW,
        steps: [{ name: 's', type: 'def.step', with: { query: 'q' } }],
      });
      expect(omitted.success).toBe(true);
      expect(omitted.data).toMatchObject({ steps: [{ with: { tags: [] } }] });
    });

    it('widens array params wrapped in both .optional() and .default()', () => {
      const connector: ConnectorContractUnion = {
        summary: 'Both',
        description: null,
        type: 'both.step',
        paramsSchema: z.object({ tags: z.array(z.string()).optional().default([]) }),
        outputSchema: z.unknown(),
      };
      const schema = generateYamlSchemaFromConnectors([connector]);
      // Stacked wrappers must still be unwrapped down to the array, otherwise the field is
      // silently skipped and the template string is reported as a type error.
      expect(
        schema.safeParse({
          ...BASE_WORKFLOW,
          steps: [{ name: 's', type: 'both.step', with: { tags: '${{ workflow.inputs.tags }}' } }],
        }).success
      ).toBe(true);
    });

    it('preserves the object unknownKeys policy of the original paramsSchema', () => {
      // A strict paramsSchema should still reject unknown keys after widening.
      const connector: ConnectorContractUnion = {
        summary: 'Strict',
        description: null,
        type: 'strict.step',
        paramsSchema: z.strictObject({ ids: z.array(z.string()) }),
        outputSchema: z.unknown(),
      };
      const schema = generateYamlSchemaFromConnectors([connector]);
      expect(
        schema.safeParse({
          ...BASE_WORKFLOW,
          steps: [
            {
              name: 's',
              type: 'strict.step',
              with: { ids: '${{ workflow.inputs.ids }}', unknown_key: 'bad' },
            },
          ],
        }).success
      ).toBe(false);
    });

    it('does not throw for a connector whose paramsSchema has object-level refinements', () => {
      const connector: ConnectorContractUnion = {
        summary: 'Refined',
        description: null,
        type: 'refined.step',
        paramsSchema: z
          .object({ ids: z.array(z.string()), name: z.string() })
          .refine((v) => v.ids.length > 0, 'ids must not be empty'),
        outputSchema: z.unknown(),
      };
      // Schema construction must not throw even though paramsSchema has a refinement.
      expect(() => generateYamlSchemaFromConnectors([connector])).not.toThrow();

      const schema = generateYamlSchemaFromConnectors([connector]);
      // Template string still accepted for the array field.
      expect(
        schema.safeParse({
          ...BASE_WORKFLOW,
          steps: [
            {
              name: 's',
              type: 'refined.step',
              with: { ids: '${{ workflow.inputs.ids }}', name: 'x' },
            },
          ],
        }).success
      ).toBe(true);
      // The object-level refinement is preserved: an empty ids array fails.
      expect(
        schema.safeParse({
          ...BASE_WORKFLOW,
          steps: [{ name: 's', type: 'refined.step', with: { ids: [], name: 'x' } }],
        }).success
      ).toBe(false);
    });
  });
});
