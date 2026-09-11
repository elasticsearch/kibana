/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { assertBoundedSchema } from './assert_bounded_schema';
import type { BoundedSchemaSubject } from './assert_bounded_schema';

// Default subject with the same shape used by the builder-fields registry.
// Limits are generous unless overridden, so individual tests can narrow them
// to drive the specific cap they are exercising.
const defaultSubject: BoundedSchemaSubject = {
  kind: 'Builder type',
  schemaProperty: 'builderFieldsSchema',
  rootPath: 'builder_fields',
  limits: {
    stringLength: 8_192,
    arrayItems: 64,
    totalBytes: 262_144,
  },
};

function subject(overrides?: Partial<BoundedSchemaSubject['limits']>): BoundedSchemaSubject {
  return { ...defaultSubject, limits: { ...defaultSubject.limits, ...overrides } };
}

function passes(schema: z.ZodType, overrides?: Partial<BoundedSchemaSubject['limits']>): void {
  expect(() => assertBoundedSchema(schema, 'test.type', subject(overrides))).not.toThrow();
}

function rejects(
  schema: z.ZodType,
  match: string | RegExp,
  overrides?: Partial<BoundedSchemaSubject['limits']>
): void {
  expect(() => assertBoundedSchema(schema, 'test.type', subject(overrides))).toThrow(match);
}

// ---------------------------------------------------------------------------
// Acceptance
// ---------------------------------------------------------------------------

describe('assertBoundedSchema acceptance', () => {
  it('accepts an empty strict object', () => {
    passes(z.object({}).strict());
  });

  it('accepts a strict object with a bounded string field', () => {
    passes(z.object({ name: z.string().max(100) }).strict());
  });

  it('accepts a strict object with numeric and boolean fields', () => {
    passes(z.object({ score: z.number(), enabled: z.boolean() }).strict());
  });

  it('accepts an integer field', () => {
    passes(z.object({ count: z.int() }).strict());
  });

  it('accepts a bounded array of bounded strings', () => {
    passes(z.object({ tags: z.array(z.string().max(64)).max(10) }).strict());
  });

  it('accepts a bounded array of objects', () => {
    passes(
      z
        .object({
          items: z
            .array(z.object({ label: z.string().max(50), value: z.number() }).strict())
            .max(5),
        })
        .strict()
    );
  });

  it('accepts a string enum', () => {
    passes(z.enum(['low', 'medium', 'high']));
  });

  it('accepts a string literal', () => {
    passes(z.literal('hello'));
  });

  it('accepts a numeric literal', () => {
    passes(z.literal(42));
  });

  it('accepts a nullable bounded string', () => {
    passes(z.string().max(100).nullable());
  });

  it('accepts a union of bounded types', () => {
    passes(z.union([z.string().max(50), z.number()]));
  });

  it('accepts nested strict objects', () => {
    passes(
      z
        .object({
          outer: z.object({ inner: z.string().max(10) }).strict(),
        })
        .strict()
    );
  });

  it('accepts a string at exactly the stringLength cap', () => {
    passes(z.string().max(8_192));
  });

  it('accepts an array at exactly the arrayItems cap', () => {
    passes(z.array(z.string().max(10)).max(64));
  });
});

// ---------------------------------------------------------------------------
// Rejection: unconstrained types
// ---------------------------------------------------------------------------

describe('assertBoundedSchema rejection: unconstrained types', () => {
  it('rejects z.unknown()', () => {
    rejects(
      z.object({ x: z.unknown() }).strict(),
      /unconstrained \(z\.any \/ z\.unknown are not allowed\)/
    );
  });

  it('rejects z.any()', () => {
    rejects(
      z.object({ x: z.any() }).strict(),
      /unconstrained \(z\.any \/ z\.unknown are not allowed\)/
    );
  });

  it('rejects z.record() (open-ended object)', () => {
    // z.record() emits additionalProperties: <schema> rather than false,
    // which the bounds walk treats the same as a non-strict object.
    rejects(z.record(z.string(), z.number()), /additionalProperties must be false/);
  });

  it('rejects z.record() nested inside a strict object', () => {
    rejects(
      z.object({ meta: z.record(z.string(), z.string().max(50)) }).strict(),
      /additionalProperties must be false/
    );
  });
});

// ---------------------------------------------------------------------------
// Rejection: unbounded strings
// ---------------------------------------------------------------------------

describe('assertBoundedSchema rejection: unbounded strings', () => {
  it('rejects a string field with no max()', () => {
    rejects(z.object({ name: z.string() }).strict(), /string is missing maxLength/);
  });

  it('rejects a string field nested inside an array item with no max()', () => {
    rejects(
      z.object({ tags: z.array(z.object({ label: z.string() }).strict()).max(5) }).strict(),
      /string is missing maxLength/
    );
  });

  it('rejects a string with maxLength one above the stringLength cap', () => {
    rejects(z.string().max(8_193), /maxLength 8193 exceeds framework cap 8192/);
  });

  it('accepts a string at exactly the stringLength cap in an object', () => {
    passes(z.object({ note: z.string().max(8_192) }).strict());
  });
});

// ---------------------------------------------------------------------------
// Rejection: unbounded arrays
// ---------------------------------------------------------------------------

describe('assertBoundedSchema rejection: unbounded arrays', () => {
  it('rejects an array field with no max()', () => {
    rejects(
      z.object({ tags: z.array(z.string().max(50)) }).strict(),
      /array is missing maxItems/
    );
  });

  it('rejects an array with maxItems one above the arrayItems cap', () => {
    rejects(
      z.object({ tags: z.array(z.string().max(10)).max(65) }).strict(),
      /maxItems 65 exceeds framework cap 64/
    );
  });

  it('accepts an array at exactly the arrayItems cap', () => {
    passes(z.object({ tags: z.array(z.string().max(10)).max(64) }).strict());
  });
});

// ---------------------------------------------------------------------------
// Rejection: non-strict objects
// ---------------------------------------------------------------------------

describe('assertBoundedSchema rejection: non-strict objects', () => {
  it('rejects a plain z.object() without .strict()', () => {
    // Without .strict() the object is stripping (additionalProperties absent),
    // not closed (additionalProperties: false).
    rejects(
      z.object({ name: z.string().max(10) }),
      /object must be closed \(use \.strict\(\); additionalProperties must be false\)/
    );
  });

  it('rejects a non-strict nested object', () => {
    rejects(
      z
        .object({
          outer: z.object({ inner: z.string().max(10) }),
        })
        .strict(),
      /object must be closed/
    );
  });
});

// ---------------------------------------------------------------------------
// Rejection: structural disallowed constructs
// ---------------------------------------------------------------------------

describe('assertBoundedSchema rejection: disallowed constructs', () => {
  it('rejects schemas that produce allOf (z.intersection)', () => {
    // z.intersection emits allOf in the JSON Schema output, which the bounds
    // walk rejects because it cannot statically bound schemas expressed that way.
    const intersected = z.intersection(
      z.object({ a: z.string().max(10) }).strict(),
      z.object({ b: z.number() }).strict()
    );
    rejects(intersected, /uses allOf\/not/);
  });
});

// ---------------------------------------------------------------------------
// Rejection: total byte cap
// ---------------------------------------------------------------------------

describe('assertBoundedSchema rejection: total byte cap', () => {
  it('passes when worst-case bytes exactly equal the totalBytes cap', () => {
    // z.object({ n: z.string().max(10) }).strict()
    // byte count: 2 (braces) + (key "n": 3) + (colon: 1) + (value: 12) = 18
    passes(z.object({ n: z.string().max(10) }).strict(), { totalBytes: 18 });
  });

  it('rejects when worst-case bytes exceed the totalBytes cap by one', () => {
    rejects(
      z.object({ n: z.string().max(10) }).strict(),
      /worst-case size 18 exceeds framework cap 17/,
      { totalBytes: 17 }
    );
  });
});

// ---------------------------------------------------------------------------
// Byte estimator: pinned arithmetic
//
// Each test below verifies the estimator's exact arithmetic by setting
// totalBytes to the computed value (should pass) and to computed-1 (should
// fail with the byte count in the error message).  The computed values are
// derived from the source algorithm:
//
//   string:  maxLength + 2  (quotes around the content)
//   number / integer / boolean / null: 16  (fixed constant)
//   object:  2 (braces) + sum_i[ (i>0 ? 1 : 0) + keyLen(i)+2 + 1 + childBytes(i) ]
//   array:   2 (brackets) + maxItems * elementBytes + max(0, maxItems-1)  (commas)
//   enum:    max(JSON.stringify(value).length  for each member)
//   literal: JSON.stringify(value).length
//   union:   max(branchBytes)
// ---------------------------------------------------------------------------

describe('assertBoundedSchema byte estimator', () => {
  describe('string', () => {
    it('charges maxLength + 2 for a bounded string', () => {
      // bare string schema with maxLength: 10 → 12 bytes
      const schema = z.string().max(10);
      passes(schema, { totalBytes: 12 });
      rejects(schema, /worst-case size 12 exceeds framework cap 11/, { totalBytes: 11 });
    });

    it('charges maxLength + 2 for maxLength: 0', () => {
      // "" serialises to 2 characters → 0 + 2 = 2 bytes
      const schema = z.string().max(0);
      passes(schema, { totalBytes: 2 });
      rejects(schema, /worst-case size 2 exceeds framework cap 1/, { totalBytes: 1 });
    });
  });

  describe('scalars (number, integer, boolean, null)', () => {
    it('charges 16 for a number field', () => {
      const schema = z.number();
      passes(schema, { totalBytes: 16 });
      rejects(schema, /worst-case size 16 exceeds framework cap 15/, { totalBytes: 15 });
    });

    it('charges 16 for an integer field', () => {
      const schema = z.int();
      passes(schema, { totalBytes: 16 });
      rejects(schema, /worst-case size 16 exceeds framework cap 15/, { totalBytes: 15 });
    });

    it('charges 16 for a boolean field', () => {
      const schema = z.boolean();
      passes(schema, { totalBytes: 16 });
      rejects(schema, /worst-case size 16 exceeds framework cap 15/, { totalBytes: 15 });
    });
  });

  describe('object', () => {
    it('charges 2 for an empty strict object', () => {
      // "{}" = 2 bytes
      const schema = z.object({}).strict();
      passes(schema, { totalBytes: 2 });
      rejects(schema, /worst-case size 2 exceeds framework cap 1/, { totalBytes: 1 });
    });

    it('accounts for key length, colon, and value for each field', () => {
      // z.object({ x: z.string().max(5) }).strict()
      // key "x":  1 char + 2 quotes = 3
      // value:    5 + 2 = 7
      // object:   2 + (0 + 3 + 1 + 7) = 13
      const schema = z.object({ x: z.string().max(5) }).strict();
      passes(schema, { totalBytes: 13 });
      rejects(schema, /worst-case size 13 exceeds framework cap 12/, { totalBytes: 12 });
    });

    it('adds a comma between fields', () => {
      // z.object({ name: z.string().max(5), count: z.number() }).strict()
      // key "name": 4+2=6, value: 5+2=7  → first field: 0+6+1+7=14
      // key "count": 5+2=7, value: 16    → second field: 1+7+1+16=25
      // object: 2+14+25=41
      const schema = z.object({ name: z.string().max(5), count: z.number() }).strict();
      passes(schema, { totalBytes: 41 });
      rejects(schema, /worst-case size 41 exceeds framework cap 40/, { totalBytes: 40 });
    });

    it('accumulates bytes across deeply nested objects', () => {
      // z.object({ inner: z.object({ x: z.number() }).strict() }).strict()
      // inner.x:  16 bytes; key "x": 3
      // inner object: 2 + (0+3+1+16) = 22
      // key "inner": 5+2=7
      // outer: 2 + (0+7+1+22) = 32
      const schema = z
        .object({ inner: z.object({ x: z.number() }).strict() })
        .strict();
      passes(schema, { totalBytes: 32 });
      rejects(schema, /worst-case size 32 exceeds framework cap 31/, { totalBytes: 31 });
    });
  });

  describe('array', () => {
    it('charges 2 + maxItems * elementBytes + (maxItems - 1) for a non-empty array', () => {
      // z.array(z.string().max(5)).max(3)
      // element: 5+2=7; 3 items, 2 commas
      // 2 + 3*7 + 2 = 25
      const schema = z.array(z.string().max(5)).max(3);
      passes(schema, { totalBytes: 25 });
      rejects(schema, /worst-case size 25 exceeds framework cap 24/, { totalBytes: 24 });
    });

    it('charges 2 for an array with maxItems 0', () => {
      // 2 + 0 * element + max(0, -1) = 2
      const schema = z.array(z.string().max(5)).max(0);
      passes(schema, { totalBytes: 2 });
      rejects(schema, /worst-case size 2 exceeds framework cap 1/, { totalBytes: 1 });
    });

    it('charges 2 + elementBytes for a maxItems 1 array (no comma)', () => {
      // z.array(z.string().max(5)).max(1)
      // 2 + 1*7 + max(0, 0) = 9
      const schema = z.array(z.string().max(5)).max(1);
      passes(schema, { totalBytes: 9 });
      rejects(schema, /worst-case size 9 exceeds framework cap 8/, { totalBytes: 8 });
    });

    it('multiplies nested array maxima', () => {
      // z.object({ matrix: z.array(z.array(z.string().max(5)).max(4)).max(3) }).strict()
      // inner array: 2 + 4*7 + 3 = 33
      // outer array: 2 + 3*33 + 2 = 103
      // key "matrix": 6+2=8
      // object: 2 + (0+8+1+103) = 114
      const schema = z
        .object({ matrix: z.array(z.array(z.string().max(5)).max(4)).max(3) })
        .strict();
      passes(schema, { totalBytes: 114 });
      rejects(schema, /worst-case size 114 exceeds framework cap 113/, { totalBytes: 113 });
    });
  });

  describe('enum', () => {
    it('returns the length of the longest member serialised as JSON', () => {
      // ['a', 'bb', 'ccc'] → '"a"'(3), '"bb"'(4), '"ccc"'(5) → max=5
      const schema = z.enum(['a', 'bb', 'ccc']);
      passes(schema, { totalBytes: 5 });
      rejects(schema, /worst-case size 5 exceeds framework cap 4/, { totalBytes: 4 });
    });

    it('serialises string members with enclosing quotes', () => {
      // z.enum(['low', 'medium', 'high'])
      // '"low"'=5, '"medium"'=8, '"high"'=6 → max=8
      const schema = z.enum(['low', 'medium', 'high']);
      passes(schema, { totalBytes: 8 });
      rejects(schema, /worst-case size 8 exceeds framework cap 7/, { totalBytes: 7 });
    });
  });

  describe('literal', () => {
    it('returns the length of the value serialised as JSON for a string literal', () => {
      // z.literal('hi') → JSON.stringify('hi') = '"hi"' → length 4
      const schema = z.literal('hi');
      passes(schema, { totalBytes: 4 });
      rejects(schema, /worst-case size 4 exceeds framework cap 3/, { totalBytes: 3 });
    });

    it('returns the length of the value serialised as JSON for a numeric literal', () => {
      // z.literal(42) → JSON.stringify(42) = '42' → length 2
      const schema = z.literal(42);
      passes(schema, { totalBytes: 2 });
      rejects(schema, /worst-case size 2 exceeds framework cap 1/, { totalBytes: 1 });
    });
  });

  describe('union', () => {
    it('returns the max byte count across all branches', () => {
      // z.union([z.string().max(5), z.number()])
      // branch 0: 5+2=7; branch 1: 16 → max=16
      const schema = z.union([z.string().max(5), z.number()]);
      passes(schema, { totalBytes: 16 });
      rejects(schema, /worst-case size 16 exceeds framework cap 15/, { totalBytes: 15 });
    });

    it('charges 16 for the null branch of a nullable string', () => {
      // z.string().max(5).nullable() → anyOf [string(max:5), null]
      // branch 0: 7; branch 1: 16 → max=16
      const schema = z.string().max(5).nullable();
      passes(schema, { totalBytes: 16 });
      rejects(schema, /worst-case size 16 exceeds framework cap 15/, { totalBytes: 15 });
    });
  });

  describe('representative multi-field schema', () => {
    it('sums bytes across all top-level fields of a realistic schema', () => {
      // A schema resembling a simple detection rule type with four fields.
      // All byte counts use the source algorithm (see file header).
      //
      // Values:
      //   query:       string(max:200)          → 200+2=202
      //   language:    enum(['kql','eql'])       → max('"kql"'=5, '"eql"'=5)=5
      //   max_signals: number                   → 16
      //   tags:        array(string(max:64)).max(10)
      //                  element=64+2=66; 2+10*66+max(0,9)=671
      //
      // Object fields (first has no leading comma; each other has +1):
      //   query:       0 + (5+2) + 1 + 202 = 210
      //   language:    1 + (8+2) + 1 +   5 =  17
      //   max_signals: 1 + (11+2) + 1 + 16 =  31
      //   tags:        1 +  (4+2) + 1 + 671 = 679
      //
      // total: 2 + 210 + 17 + 31 + 679 = 939
      const schema = z
        .object({
          query: z.string().max(200),
          language: z.enum(['kql', 'eql']),
          max_signals: z.number(),
          tags: z.array(z.string().max(64)).max(10),
        })
        .strict();

      passes(schema, { totalBytes: 939 });
      rejects(schema, /worst-case size 939 exceeds framework cap 938/, { totalBytes: 938 });
    });
  });
});

// ---------------------------------------------------------------------------
// Error message content
// ---------------------------------------------------------------------------

describe('assertBoundedSchema error messages', () => {
  it('includes the kind, typeName, and schemaProperty in every error', () => {
    // The prefix is: `${kind} "${typeName}" ${schemaProperty}`
    expect(() =>
      assertBoundedSchema(z.string(), 'my.type', {
        kind: 'Builder type',
        schemaProperty: 'builderFieldsSchema',
        rootPath: 'builder_fields',
        limits: { stringLength: 8_192, arrayItems: 64, totalBytes: 262_144 },
      })
    ).toThrow(/Builder type "my\.type" builderFieldsSchema/);
  });

  it('includes the schema path in the error for a nested field', () => {
    expect(() =>
      assertBoundedSchema(
        z.object({ nested: z.object({ missing: z.string() }).strict() }).strict(),
        'test.type',
        subject()
      )
    ).toThrow(/at builder_fields\.nested\.missing/);
  });

  it('includes the rootPath in the error for the root node', () => {
    expect(() => assertBoundedSchema(z.string(), 'test.type', subject())).toThrow(
      /at builder_fields:/
    );
  });
});
