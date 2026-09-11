/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { RegisteredBuilderType } from '@kbn/alerting-v2-rule-builders';
import { assertValidDefinition } from './assert_valid_definition';
import { FoldedVersionsSet } from './folded_versions';
import type { FoldedVersionsRecord } from './folded_versions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const simpleSchema = z.object({ value: z.string().max(100) }).strict();

const makeQuery = (): import('@kbn/alerting-v2-rule-builders').GeneratedQuery => ({
  query: {
    format: 'standalone',
    breach: { query: 'FROM logs-* | LIMIT 10' },
  },
});

/** A FoldedVersionsRecord that considers every (type, version) pair as folded. */
const allFolded: FoldedVersionsRecord = { has: () => true };

/** Builds a minimal valid definition; overrides narrow specific properties. */
function makeDefinition(overrides: Partial<RegisteredBuilderType> = {}): RegisteredBuilderType {
  return {
    type: 'test.my_type',
    name: 'Test type',
    builderFieldsSchema: simpleSchema as unknown as RegisteredBuilderType['builderFieldsSchema'],
    generateQuery: jest.fn(() => makeQuery()),
    ...overrides,
  };
}

/** Shorthand: expect assertValidDefinition not to throw. */
function passes(
  definition: Partial<RegisteredBuilderType>,
  foldedVersions: FoldedVersionsRecord = allFolded
): void {
  expect(() => assertValidDefinition(makeDefinition(definition), foldedVersions)).not.toThrow();
}

/** Shorthand: expect assertValidDefinition to throw with a matching message. */
function rejects(
  definition: Partial<RegisteredBuilderType>,
  match: string | RegExp,
  foldedVersions: FoldedVersionsRecord = allFolded
): void {
  expect(() => assertValidDefinition(makeDefinition(definition), foldedVersions)).toThrow(match);
}

// ---------------------------------------------------------------------------
// Prerequisites (unchanged from the original three trivial checks)
// ---------------------------------------------------------------------------

describe('assertValidDefinition — prerequisites', () => {
  it('accepts a valid minimal definition', () => {
    passes({});
  });

  it('rejects an empty type string', () => {
    rejects({ type: '' }, 'Builder type definition requires a non-empty type');
  });

  it('rejects a null builderFieldsSchema', () => {
    rejects({ builderFieldsSchema: null as never }, 'requires a builderFieldsSchema');
  });

  it('rejects a non-function generateQuery', () => {
    rejects({ generateQuery: 'not-a-function' as never }, 'requires a generateQuery function');
  });
});

// ---------------------------------------------------------------------------
// Check 2: id format
// ---------------------------------------------------------------------------

describe('assertValidDefinition — check 2: id format', () => {
  it('accepts a valid single-segment id', () => {
    passes({ type: 'mytype' });
  });

  it('accepts a valid dot-separated id', () => {
    passes({ type: 'security.detection.query' });
  });

  it('accepts an id with underscores', () => {
    passes({ type: 'my_solution.my_domain.my_type' });
  });

  it('accepts an id with digits', () => {
    passes({ type: 'solution123.domain456.type789' });
  });

  it('accepts an id of exactly 64 characters', () => {
    // 63 chars of 'a' + '.' + 'b' = 65 — too long; use 32+1+31=64.
    passes({ type: `${'a'.repeat(32)}.${'b'.repeat(31)}` });
  });

  it('rejects an id that exceeds 64 characters', () => {
    rejects({ type: 'a'.repeat(65) }, /id format check/);
  });

  it('rejects an id with uppercase letters', () => {
    rejects({ type: 'Security.Detection.Query' }, /id format check/);
  });

  it('rejects an id with a hyphen', () => {
    rejects({ type: 'security.detection-query' }, /id format check/);
  });

  it('rejects an id that starts with a dot', () => {
    rejects({ type: '.security.detection' }, /id format check/);
  });

  it('rejects an id that ends with a dot', () => {
    rejects({ type: 'security.detection.' }, /id format check/);
  });

  it('rejects an id with consecutive dots', () => {
    rejects({ type: 'security..detection' }, /id format check/);
  });

  it('rejects an id with a space', () => {
    rejects({ type: 'security detection' }, /id format check/);
  });
});

// ---------------------------------------------------------------------------
// Check 3: bounded schema
//
// The bounded-schema checks live in assert_bounded_schema.test.ts.
// Here we just verify the check is run and its rejection surfaces from
// assertValidDefinition.
// ---------------------------------------------------------------------------

describe('assertValidDefinition — check 3: bounded schema (delegation smoke test)', () => {
  it('rejects an unbounded schema (string without .max())', () => {
    const unbounded = z.object({ name: z.string() }).strict();
    rejects(
      { builderFieldsSchema: unbounded as unknown as RegisteredBuilderType['builderFieldsSchema'] },
      /string is missing maxLength/
    );
  });

  it('rejects a schema with .default()', () => {
    const withDefault = z.object({ val: z.string().max(10).default('x') }).strict();
    rejects(
      {
        builderFieldsSchema: withDefault as unknown as RegisteredBuilderType['builderFieldsSchema'],
      },
      /default/
    );
  });

  it('rejects a schema with .transform()', () => {
    const withTransform = z
      .object({
        val: z
          .string()
          .max(10)
          .transform((x) => x.toUpperCase()),
      })
      .strict();
    rejects(
      {
        builderFieldsSchema:
          withTransform as unknown as RegisteredBuilderType['builderFieldsSchema'],
      },
      /transform/
    );
  });
});

// ---------------------------------------------------------------------------
// Check 4: ignore_above consistency
// ---------------------------------------------------------------------------

describe('assertValidDefinition — check 4: ignore_above consistency', () => {
  const shortStringSchema = z.object({ query: z.string().max(100) }).strict();
  const longStringSchema = z.object({ note: z.string().max(8192) }).strict();

  it('accepts a schema whose strings are all <= 4096 with no manifest', () => {
    passes({
      builderFieldsSchema:
        shortStringSchema as unknown as RegisteredBuilderType['builderFieldsSchema'],
    });
  });

  it('accepts a schema with a long string when the manifest declares the sub-field', () => {
    const manifest = {
      type: 'test.my_type',
      currentVersion: 1,
      versions: {
        1: { addedSubFieldMappings: { note: { type: 'text' as const } } },
      },
    };
    passes({
      builderFieldsSchema:
        longStringSchema as unknown as RegisteredBuilderType['builderFieldsSchema'],
      manifest,
    });
  });

  it('rejects a schema with a string > 4096 when no manifest sub-field is declared', () => {
    rejects(
      {
        builderFieldsSchema:
          longStringSchema as unknown as RegisteredBuilderType['builderFieldsSchema'],
      },
      /ignore_above consistency check/
    );
  });

  it('rejects when the manifest exists but does not declare the long field', () => {
    const manifest = {
      type: 'test.my_type',
      currentVersion: 1,
      versions: { 1: { addedSubFieldMappings: { other_field: { type: 'text' as const } } } },
    };
    rejects(
      {
        builderFieldsSchema:
          longStringSchema as unknown as RegisteredBuilderType['builderFieldsSchema'],
        manifest,
      },
      /ignore_above consistency check/
    );
  });

  it('accepts when the long string is declared in a later manifest version', () => {
    const manifest = {
      type: 'test.my_type',
      currentVersion: 2,
      versions: {
        1: {},
        2: { addedSubFieldMappings: { note: { type: 'text' as const } } },
      },
    };
    passes({
      builderFieldsSchema:
        longStringSchema as unknown as RegisteredBuilderType['builderFieldsSchema'],
      manifest,
    });
  });
});

// ---------------------------------------------------------------------------
// Check 5: kind pin validity
// ---------------------------------------------------------------------------

describe('assertValidDefinition — check 5: kind pin validity', () => {
  it('accepts a definition with no kind (absent = any kind allowed)', () => {
    passes({});
  });

  it('accepts kind: "alert"', () => {
    passes({ kind: 'alert' });
  });

  it('accepts kind: "signal"', () => {
    passes({ kind: 'signal' });
  });

  it('rejects an unrecognised kind value', () => {
    rejects({ kind: 'unknown' as never }, /kind pin validity check/);
  });
});

// ---------------------------------------------------------------------------
// Check 6: manifest consistency
// ---------------------------------------------------------------------------

describe('assertValidDefinition — check 6: manifest consistency', () => {
  /** A FoldedVersionsSet with specific versions pre-recorded. */
  function makeFolded(...pairs: Array<[string, number]>): FoldedVersionsRecord {
    const set = new FoldedVersionsSet();
    for (const [type, version] of pairs) {
      set.record(type, version);
    }
    return set;
  }

  it('accepts a valid manifest with all versions folded', () => {
    const folded = makeFolded(['test.my_type', 1]);
    passes(
      {
        manifest: {
          type: 'test.my_type',
          currentVersion: 1,
          versions: { 1: {} },
        },
      },
      folded
    );
  });

  it('accepts a manifest with multiple versions when all are folded', () => {
    const folded = makeFolded(['test.my_type', 1], ['test.my_type', 2]);
    passes(
      {
        manifest: {
          type: 'test.my_type',
          currentVersion: 2,
          versions: { 1: {}, 2: {} },
        },
      },
      folded
    );
  });

  it('rejects when manifest.type does not match definition.type', () => {
    rejects(
      {
        manifest: {
          type: 'other.type',
          currentVersion: 1,
          versions: { 1: {} },
        },
      },
      /manifest consistency check/
    );
  });

  it('rejects when manifest versions are not dense from 1 (gap at version 2)', () => {
    const folded = makeFolded(['test.my_type', 1], ['test.my_type', 3]);
    rejects(
      {
        manifest: {
          type: 'test.my_type',
          currentVersion: 3,
          versions: { 1: {}, 3: {} },
        },
      },
      /manifest consistency check/,
      folded
    );
  });

  it('rejects when currentVersion does not equal the highest version key', () => {
    const folded = makeFolded(['test.my_type', 1], ['test.my_type', 2]);
    rejects(
      {
        manifest: {
          type: 'test.my_type',
          currentVersion: 1,
          versions: { 1: {}, 2: {} },
        },
      },
      /manifest consistency check/,
      folded
    );
  });

  it('rejects when a manifest version is not folded into model versions', () => {
    const folded = makeFolded(); // nothing folded
    rejects(
      {
        manifest: {
          type: 'test.my_type',
          currentVersion: 1,
          versions: { 1: {} },
        },
      },
      /manifest consistency check/,
      folded
    );
  });

  it('error message names the missing fromBuilderManifest call', () => {
    const folded = makeFolded(['test.my_type', 1]); // v1 folded but not v2
    expect(() =>
      assertValidDefinition(
        makeDefinition({
          manifest: {
            type: 'test.my_type',
            currentVersion: 2,
            versions: { 1: {}, 2: {} },
          },
        }),
        folded
      )
    ).toThrow(/fromBuilderManifest/);
  });

  it('accepts a definition with no manifest (manifest is optional)', () => {
    passes({ manifest: undefined });
  });
});

// ---------------------------------------------------------------------------
// Check 7: managed-type completeness
// ---------------------------------------------------------------------------

describe('assertValidDefinition — check 7: managed-type completeness', () => {
  const validManagedManifest = (type: string) => ({
    type,
    currentVersion: 1,
    versions: { 1: {} },
  });

  it('accepts a fully-declared managed type', () => {
    const folded = new FoldedVersionsSet();
    folded.record('security.detection.mytype', 1);

    passes(
      {
        type: 'security.detection.mytype',
        ownership: { solution: 'security', domain: 'detection' },
        compilation: 'execution_time',
        manifest: validManagedManifest('security.detection.mytype'),
      },
      folded
    );
  });

  it('rejects a managed type that does not declare compilation', () => {
    rejects(
      {
        type: 'security.detection.mytype',
        ownership: { solution: 'security', domain: 'detection' },
        compilation: undefined,
        manifest: validManagedManifest('security.detection.mytype'),
      },
      /managed-type completeness check/
    );
  });

  it('rejects a managed type that has no manifest', () => {
    rejects(
      {
        type: 'security.detection.mytype',
        ownership: { solution: 'security', domain: 'detection' },
        compilation: 'execution_time',
        manifest: undefined,
      },
      /managed-type completeness check/
    );
  });

  it('rejects when the id first two segments do not match ownership', () => {
    const folded = new FoldedVersionsSet();
    folded.record('other.thing.mytype', 1);

    rejects(
      {
        type: 'other.thing.mytype',
        ownership: { solution: 'security', domain: 'detection' },
        compilation: 'execution_time',
        manifest: validManagedManifest('other.thing.mytype'),
      },
      /managed-type completeness check/,
      folded
    );
  });

  it('rejects when the id has exactly two segments matching solution and domain (missing <name>)', () => {
    // 'security.detection' has the right solution and domain segments but no
    // <name> segment, so only the segments.length < 3 clause rejects it.
    // The first two segments match ownership, so neither the format check
    // (check 2) nor the solution/domain mismatch clause fires — this test
    // can only pass if the length clause is present.
    //
    // Ref: rule-ownership.md "Managed rule types"
    //      rule-type-registration.md "Registration-time checks" item 7
    const folded = new FoldedVersionsSet();
    folded.record('security.detection', 1);

    rejects(
      {
        type: 'security.detection',
        ownership: { solution: 'security', domain: 'detection' },
        compilation: 'execution_time',
        manifest: validManagedManifest('security.detection'),
      },
      /managed-type completeness check/,
      folded
    );
  });

  it('rejects when the id has fewer than three segments (single segment)', () => {
    rejects(
      {
        type: 'security',
        ownership: { solution: 'security', domain: 'detection' },
        compilation: 'execution_time',
        manifest: validManagedManifest('security'),
      },
      // 'security' has one segment: segments[1] is undefined, so both the
      // length clause and the domain-mismatch clause fire simultaneously.
      /check/
    );
  });

  it('accepts an unmanaged type with no ownership', () => {
    passes({ ownership: undefined });
  });
});

// ---------------------------------------------------------------------------
// Check 8: mode consistency
// ---------------------------------------------------------------------------

describe('assertValidDefinition — check 8: mode consistency', () => {
  it('accepts deriveRuleFields on an execution-time type', () => {
    passes({
      compilation: 'execution_time',
      deriveRuleFields: jest.fn(),
    });
  });

  it('rejects deriveRuleFields on a write-time type', () => {
    rejects(
      {
        compilation: 'write_time',
        deriveRuleFields: jest.fn(),
      },
      /mode consistency check/
    );
  });

  it('rejects deriveRuleFields when compilation is not set (defaults to write_time semantics)', () => {
    rejects(
      {
        compilation: undefined,
        deriveRuleFields: jest.fn(),
      },
      /mode consistency check/
    );
  });

  it('accepts a write-time type with no deriveRuleFields', () => {
    passes({ compilation: 'write_time', deriveRuleFields: undefined });
  });

  it('accepts an execution-time type with no deriveRuleFields', () => {
    passes({ compilation: 'execution_time', deriveRuleFields: undefined });
  });
});
