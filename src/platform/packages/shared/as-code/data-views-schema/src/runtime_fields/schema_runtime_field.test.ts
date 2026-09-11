/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod';
import { expectPrettyError } from '@kbn/zod-helpers/v4';
import { PRIMITIVE_RUNTIME_FIELD_TYPES, RUNTIME_FIELD_COMPOSITE_TYPE } from './common';
import type {
  compositeRuntimeFieldSchema,
  primitiveRuntimeFieldSchema,
} from './schema_embedded_runtime_field';
import { runtimeFieldSchema } from './schema_embedded_runtime_field';
import { savedRuntimeFieldSchema } from './schema_saved_runtime_fields';

const buildPrimitiveRuntimeField = (
  params: Partial<z.output<typeof primitiveRuntimeFieldSchema>>
) => {
  return { type: 'keyword' as const, script: 'some script', ...params };
};

const buildCompositeRuntimeField = (
  params: Partial<z.output<typeof compositeRuntimeFieldSchema>>
) => {
  return {
    type: RUNTIME_FIELD_COMPOSITE_TYPE,
    script: 'some script',
    fields: {},
    ...params,
  };
};

describe.each([
  { runtimeFieldSchemaType: runtimeFieldSchema, description: 'embedded' },
  { runtimeFieldSchemaType: savedRuntimeFieldSchema, description: 'saved' },
])(`given a $description runtime field`, ({ runtimeFieldSchemaType }) => {
  describe('given an invalid type', () => {
    it('should throw an error', () => {
      // Given
      const runtimeField = {
        type: 'invalid',
      };

      // When/Then
      expectPrettyError(runtimeFieldSchemaType.safeParse(runtimeField)).toMatch(/type/i);
    });
  });

  describe.each(PRIMITIVE_RUNTIME_FIELD_TYPES)('given a %s runtime field', (type) => {
    it('should be a valid type', () => {
      // Given
      const runtimeField = {
        type,
      };

      // When/Then
      expect(runtimeFieldSchemaType.parse(runtimeField)).toEqual(runtimeField);
    });
  });

  describe('given a composite runtime field', () => {
    it('should be a valid type', () => {
      // Given
      const runtimeField = {
        type: RUNTIME_FIELD_COMPOSITE_TYPE,
        fields: {},
      };

      // When/Then
      expect(runtimeFieldSchemaType.parse(runtimeField)).toEqual(runtimeField);
    });

    describe('when it does NOT have fields', () => {
      it('should throw an error', () => {
        // Given
        const runtimeField = {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
        };

        // When/Then
        expectPrettyError(runtimeFieldSchemaType.safeParse(runtimeField)).toMatch(
          /fields|required|invalid/i
        );
      });
    });

    describe('when fields is not a record', () => {
      it('should throw an error', () => {
        // Given
        const runtimeField = buildCompositeRuntimeField({
          // @ts-expect-error - we want to test an invalid type
          fields: [{ name: 'x', type: 'keyword' }],
        });

        // When/Then
        expectPrettyError(runtimeFieldSchemaType.safeParse(runtimeField)).toMatch(
          /fields|required|invalid/i
        );
      });
    });

    describe('when it has subfields', () => {
      describe('when the subfield DOES NOT have a type', () => {
        it('should throw an error', () => {
          // Given
          const runtimeField = buildCompositeRuntimeField({
            fields: {
              my_runtime_subfield: {
                // @ts-expect-error - we want to test an invalid type
                type: undefined,
              },
            },
          });

          // When/Then
          expectPrettyError(runtimeFieldSchemaType.safeParse(runtimeField)).toMatch(
            /my_runtime_subfield|fields|type/i
          );
        });
      });

      describe('when the subfield has an invalid type', () => {
        it('should throw an error', () => {
          // Given
          const runtimeField = buildCompositeRuntimeField({
            fields: {
              my_runtime_subfield: {
                // @ts-expect-error - we want to test an invalid type
                type: 'invalid',
              },
            },
          });

          // When/Then
          expectPrettyError(runtimeFieldSchemaType.safeParse(runtimeField)).toMatch(
            /my_runtime_subfield|fields|type/i
          );
        });
      });

      describe('when the subfield key is empty', () => {
        it('should throw an error', () => {
          // Given
          const runtimeField = buildCompositeRuntimeField({
            fields: { '': { type: 'keyword' } },
          });

          // When/Then
          expectPrettyError(runtimeFieldSchemaType.safeParse(runtimeField)).toMatch(
            /invalid_key|invalid|key|""/i
          );
        });
      });

      describe('when the subfield key is too long', () => {
        it('should throw an error', () => {
          // Given
          const longKey = 'a'.repeat(1001);
          const runtimeField = buildCompositeRuntimeField({
            fields: { [longKey]: { type: 'keyword' } },
          });

          // When/Then
          expectPrettyError(runtimeFieldSchemaType.safeParse(runtimeField)).toMatch(
            /too_big|maximum|1000|length|key/i
          );
        });
      });

      describe('when the subfield has a valid key and type', () => {
        it('should be valid', () => {
          // Given
          const runtimeField = buildCompositeRuntimeField({
            fields: { my_runtime_field: { type: 'keyword' } },
          });

          // When/Then
          expect(runtimeFieldSchemaType.parse(runtimeField)).toEqual(runtimeField);
        });
      });
    });

    describe('when it has top-level field formatting settings', () => {
      it('should throw an error', () => {
        // Given
        const runtimeField = buildCompositeRuntimeField({
          // @ts-expect-error - we want to test an invalid type
          format: { type: 'number', params: { decimals: 2 } },
        });

        // When/Then
        expectPrettyError(runtimeFieldSchemaType.safeParse(runtimeField)).toMatch(/format/i);
      });
    });

    describe.each(['custom_label', 'custom_description'])('when it has a top-level %s', (field) => {
      it('should throw an error', () => {
        // Given
        const runtimeField = buildCompositeRuntimeField({
          [field]: 'my_runtime_field',
        });

        // When/Then
        expectPrettyError(runtimeFieldSchemaType.safeParse(runtimeField)).toMatch(
          new RegExp(field)
        );
      });
    });
  });

  describe.each([
    ...PRIMITIVE_RUNTIME_FIELD_TYPES.map((type) => ({
      type,
      build: buildPrimitiveRuntimeField,
      buildWithFields: buildPrimitiveRuntimeField,
    })),
    {
      type: RUNTIME_FIELD_COMPOSITE_TYPE,
      build: buildCompositeRuntimeField,
      buildWithFields: (
        field: Partial<z.output<typeof compositeRuntimeFieldSchema>['fields'][string]>
      ) =>
        buildCompositeRuntimeField({
          fields: { my_runtime_subfield: { type: 'keyword', ...field } },
        }),
    },
  ])('given a $type runtime field', ({ build, buildWithFields }) => {
    describe('when it does NOT have a script', () => {
      it('should be valid', () => {
        // Given
        const runtimeField = build({ script: undefined });

        // When/Then
        expect(runtimeFieldSchemaType.parse(runtimeField)).toEqual(runtimeField);
      });
    });

    describe('when it has an empty script', () => {
      it('should throw an error', () => {
        // Given
        const runtimeField = build({ script: '' });

        // When/Then
        expectPrettyError(runtimeFieldSchemaType.safeParse(runtimeField)).toMatch(
          /script|Too small|length|empty/i
        );
      });
    });

    describe('when it has a script that is not a string', () => {
      it('should throw an error', () => {
        // Given
        // @ts-expect-error - we want to test an invalid type
        const runtimeField = build({ script: { source: 'some script' } });

        // When/Then
        expectPrettyError(runtimeFieldSchemaType.safeParse(runtimeField)).toMatch(
          /script|string|invalid_type|expected/i
        );
      });
    });

    describe('when it has a script that is a string', () => {
      it('should be valid', () => {
        // Given
        const runtimeField = build({ script: 'some script' });

        // When/Then
        expect(runtimeFieldSchemaType.parse(runtimeField)).toEqual(runtimeField);
      });
    });

    describe('when it has a format', () => {
      describe('when the format is not a string', () => {
        it('should throw an error', () => {
          // Given
          // @ts-expect-error - we want to test an invalid type
          const runtimeField = buildWithFields({ format: { type: 1, params: 1 } });

          // When/Then
          expectPrettyError(runtimeFieldSchemaType.safeParse(runtimeField)).toMatch(/format/);
        });
      });

      describe('when the format is a string', () => {
        describe('when the params are not present', () => {
          it('should be valid', () => {
            // Given
            const runtimeField = buildWithFields({
              format: { type: 'number', params: undefined },
            });

            // When/Then
            expect(runtimeFieldSchemaType.parse(runtimeField)).toEqual(runtimeField);
          });
        });
      });

      describe('when the params are present', () => {
        it('should be valid', () => {
          // Given
          const runtimeField = buildWithFields({
            format: { type: 'number', params: { pattern: '0.00' } },
          });

          // When/Then
          expect(runtimeFieldSchemaType.parse(runtimeField)).toEqual(runtimeField);
        });
      });
    });

    describe.each(['custom_label', 'custom_description'])('given a %s', (field) => {
      describe('when the it is not present', () => {
        it('should be valid', () => {
          // Given
          const runtimeField = buildWithFields({ [field]: undefined });

          // When/Then
          expect(runtimeFieldSchemaType.parse(runtimeField)).toEqual(runtimeField);
        });
      });

      describe('when it is not a string', () => {
        it('should throw an error', () => {
          // Given
          const runtimeField = buildWithFields({ [field]: 1 });

          // When/Then
          expectPrettyError(runtimeFieldSchemaType.safeParse(runtimeField)).toMatch(
            new RegExp(field)
          );
        });
      });

      describe('when it is a string', () => {
        describe('when it is empty', () => {
          it('should throw an error', () => {
            // Given
            const runtimeField = buildWithFields({ [field]: '' });

            // When/Then
            expectPrettyError(runtimeFieldSchemaType.safeParse(runtimeField)).toMatch(
              new RegExp(field)
            );
          });
        });

        describe('when it is a valid string', () => {
          it('should be valid', () => {
            // Given
            const runtimeField = buildWithFields({ [field]: 'my_runtime_field' });

            // When/Then
            expect(runtimeFieldSchemaType.parse(runtimeField)).toEqual(runtimeField);
          });
        });
      });
    });
  });
});
