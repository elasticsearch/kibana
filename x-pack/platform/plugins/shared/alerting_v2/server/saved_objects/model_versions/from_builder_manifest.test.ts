/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { merge } from 'lodash';
import type { BuilderTypeManifest, OpaqueBuilderFields } from '@kbn/alerting-v2-rule-builders';
import { globalFoldedVersions } from '../../lib/builder_types/folded_versions';
import {
  ruleSavedObjectAttributesSchema as ruleSavedObjectAttributesSchemaV4,
  ruleMetadataSchema as ruleMetadataSchemaV4,
} from '../schemas/rule_saved_object_attributes/v4';
import { fromBuilderManifest } from './from_builder_manifest';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A synthetic builder type id used across all tests. Using a unique test
 * prefix avoids polluting globalFoldedVersions with production type names.
 */
const TEST_TYPE = 'test.mock.type';

/**
 * Minimal rule document shape understood by the backfill functions.
 * Only the attributes needed by fromBuilderManifest's scoped backfill are set.
 */
function makeDoc(overrides: {
  builderType?: string;
  builderFields?: OpaqueBuilderFields;
}): { attributes: Record<string, unknown> } {
  return {
    attributes: {
      metadata: {
        name: 'test rule',
        builder_type: overrides.builderType,
        builder_fields: overrides.builderFields,
      },
    },
  };
}

/**
 * Mirrors how core applies a data_backfill: the result is deep-merged into the
 * document's attributes.
 */
function applyBackfill(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  backfillFn: (doc: any, ctx: any) => { attributes: Record<string, unknown> },
  doc: ReturnType<typeof makeDoc>
): Record<string, unknown> {
  const result = backfillFn(doc, {});
  return merge({}, doc.attributes, result.attributes);
}

/**
 * A minimal v1 manifest: introduces two sub-field mappings, no backfill.
 */
const manifestV1Only: BuilderTypeManifest = {
  type: TEST_TYPE,
  currentVersion: 1,
  versions: {
    1: {
      addedSubFieldMappings: {
        risk_score: { type: 'integer' },
        note: { type: 'text' },
      },
    },
  },
};

/**
 * A v1 manifest with both mappings and an explicit backfill.
 */
const INITIAL_SCORE = 50;
const manifestV1WithBackfill: BuilderTypeManifest = {
  type: TEST_TYPE,
  currentVersion: 1,
  versions: {
    1: {
      addedSubFieldMappings: {
        risk_score: { type: 'integer' },
      },
      backfillFn: (fields: OpaqueBuilderFields) => ({
        ...fields,
        risk_score: INITIAL_SCORE,
      }),
    },
  },
};

/**
 * A two-version manifest. Version 1 introduces the field; version 2 adds a
 * new sub-field mapping without an explicit backfillFn (triggering the
 * automatic identity backfill).
 */
const manifestV2MappingOnly: BuilderTypeManifest = {
  type: `${TEST_TYPE}.v2map`,
  currentVersion: 2,
  versions: {
    1: {
      addedSubFieldMappings: { risk_score: { type: 'integer' } },
    },
    2: {
      // A new sub-field mapping added over existing data: requires an identity
      // backfill to re-index the now-mapped values on existing documents.
      addedSubFieldMappings: { max_signals: { type: 'integer' } },
    },
  },
};

/**
 * A two-version manifest where version 2 has an explicit backfill (no need
 * for the injected identity backfill since the explicit one already rewrites).
 */
const manifestV2WithBackfill: BuilderTypeManifest = {
  type: `${TEST_TYPE}.v2bf`,
  currentVersion: 2,
  versions: {
    1: {
      addedSubFieldMappings: { risk_score: { type: 'integer' } },
    },
    2: {
      backfillFn: (fields: OpaqueBuilderFields) => ({
        ...fields,
        computed_field: String(fields.risk_score ?? 0),
      }),
    },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fromBuilderManifest', () => {
  describe('version 1 with mappings only (no backfillFn)', () => {
    it('produces a mappings_addition change', () => {
      const mv = fromBuilderManifest(manifestV1Only, 1);

      const mappingsChange = mv.changes.find((c) => c.type === 'mappings_addition');
      expect(mappingsChange).toBeDefined();
      expect(mappingsChange).toEqual(
        expect.objectContaining({
          type: 'mappings_addition',
          addedMappings: {
            metadata: {
              properties: {
                builder_fields: {
                  type: 'flattened',
                  ignore_above: 4096,
                  properties: {
                    risk_score: { type: 'integer' },
                    note: { type: 'text' },
                  },
                },
              },
            },
          },
        })
      );
    });

    it('does NOT produce a data_backfill at version 1 (no re-indexing needed for new fields)', () => {
      const mv = fromBuilderManifest(manifestV1Only, 1);

      const backfillChanges = mv.changes.filter((c) => c.type === 'data_backfill');
      expect(backfillChanges).toHaveLength(0);
    });

    it('records the fold in globalFoldedVersions', () => {
      // fromBuilderManifest is called above; the global set accumulates.
      expect(globalFoldedVersions.has(TEST_TYPE, 1)).toBe(true);
    });

    it('includes a forwardCompatibility schema', () => {
      const mv = fromBuilderManifest(manifestV1Only, 1);
      expect(mv.schemas?.forwardCompatibility).toBeDefined();
    });
  });

  describe('version 1 with mappings and an explicit backfillFn', () => {
    it('produces mappings_addition and data_backfill changes', () => {
      const mv = fromBuilderManifest(manifestV1WithBackfill, 1);

      expect(mv.changes).toHaveLength(2);
      expect(mv.changes[0].type).toBe('mappings_addition');
      expect(mv.changes[1].type).toBe('data_backfill');
    });

    it('the data_backfill applies the manifest backfillFn to matching documents', () => {
      const mv = fromBuilderManifest(manifestV1WithBackfill, 1);
      const change = mv.changes.find((c) => c.type === 'data_backfill') as {
        type: 'data_backfill';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        backfillFn: (doc: any, ctx: any) => { attributes: Record<string, unknown> };
      };

      const doc = makeDoc({ builderType: TEST_TYPE, builderFields: { risk_score: 10 } });
      const result = applyBackfill(change.backfillFn, doc);

      expect((result as any).metadata.builder_fields.risk_score).toBe(INITIAL_SCORE);
    });

    it('the data_backfill skips documents with a different builder_type', () => {
      const mv = fromBuilderManifest(manifestV1WithBackfill, 1);
      const change = mv.changes.find((c) => c.type === 'data_backfill') as {
        type: 'data_backfill';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        backfillFn: (doc: any, ctx: any) => { attributes: Record<string, unknown> };
      };

      const doc = makeDoc({ builderType: 'other.type', builderFields: { risk_score: 10 } });
      const result = applyBackfill(change.backfillFn, doc);

      // risk_score must be unchanged (the doc's original value, not the backfill default)
      expect((result as any).metadata.builder_fields.risk_score).toBe(10);
    });

    it('the data_backfill skips documents with no builder_type', () => {
      const mv = fromBuilderManifest(manifestV1WithBackfill, 1);
      const change = mv.changes.find((c) => c.type === 'data_backfill') as {
        type: 'data_backfill';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        backfillFn: (doc: any, ctx: any) => { attributes: Record<string, unknown> };
      };

      const doc = makeDoc({ builderType: undefined, builderFields: { risk_score: 99 } });
      const result = applyBackfill(change.backfillFn, doc);

      // risk_score must be unchanged
      expect((result as any).metadata.builder_fields.risk_score).toBe(99);
    });
  });

  describe('version 2 with only addedSubFieldMappings (no explicit backfillFn)', () => {
    it('injects an identity data_backfill to re-index existing documents', () => {
      const mv = fromBuilderManifest(manifestV2MappingOnly, 2);

      const backfillChanges = mv.changes.filter((c) => c.type === 'data_backfill');
      expect(backfillChanges).toHaveLength(1);
      expect(backfillChanges[0].type).toBe('data_backfill');
    });

    it('the injected identity backfill returns builder_fields unchanged for matching documents', () => {
      const mv = fromBuilderManifest(manifestV2MappingOnly, 2);
      const change = mv.changes.find((c) => c.type === 'data_backfill') as {
        type: 'data_backfill';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        backfillFn: (doc: any, ctx: any) => { attributes: Record<string, unknown> };
      };

      const originalFields = { risk_score: 42, tags: ['critical'] };
      const doc = makeDoc({
        builderType: manifestV2MappingOnly.type,
        builderFields: originalFields,
      });

      const result = applyBackfill(change.backfillFn, doc);

      // The identity backfill rewrites the document (triggering re-indexing)
      // but leaves the field values unchanged.
      expect((result as any).metadata.builder_fields).toEqual(originalFields);
    });

    it('the injected identity backfill leaves non-matching documents untouched', () => {
      const mv = fromBuilderManifest(manifestV2MappingOnly, 2);
      const change = mv.changes.find((c) => c.type === 'data_backfill') as {
        type: 'data_backfill';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        backfillFn: (doc: any, ctx: any) => { attributes: Record<string, unknown> };
      };

      const doc = makeDoc({
        builderType: 'different.type',
        builderFields: { risk_score: 77 },
      });

      const { attributes: returned } = change.backfillFn(doc, {});

      // Non-matching documents: the returned attributes object is empty (no-op).
      // Core will deep-merge {} into the document, leaving it untouched.
      expect(returned).toEqual({});
    });

    it('records the v2 fold in globalFoldedVersions', () => {
      expect(globalFoldedVersions.has(manifestV2MappingOnly.type, 2)).toBe(true);
    });
  });

  describe('version 2 with an explicit backfillFn (no addedSubFieldMappings)', () => {
    it('does NOT inject an extra identity backfill (the explicit backfill covers the rewrite)', () => {
      const mv = fromBuilderManifest(manifestV2WithBackfill, 2);

      const backfillChanges = mv.changes.filter((c) => c.type === 'data_backfill');
      // Only the explicit backfill — no injected identity backfill.
      expect(backfillChanges).toHaveLength(1);
    });

    it('the explicit backfill transforms matching documents', () => {
      const mv = fromBuilderManifest(manifestV2WithBackfill, 2);
      const change = mv.changes.find((c) => c.type === 'data_backfill') as {
        type: 'data_backfill';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        backfillFn: (doc: any, ctx: any) => { attributes: Record<string, unknown> };
      };

      const doc = makeDoc({
        builderType: manifestV2WithBackfill.type,
        builderFields: { risk_score: 25 },
      });
      const result = applyBackfill(change.backfillFn, doc);

      expect((result as any).metadata.builder_fields.computed_field).toBe('25');
    });

    it('the explicit backfill leaves non-matching documents untouched', () => {
      const mv = fromBuilderManifest(manifestV2WithBackfill, 2);
      const change = mv.changes.find((c) => c.type === 'data_backfill') as {
        type: 'data_backfill';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        backfillFn: (doc: any, ctx: any) => { attributes: Record<string, unknown> };
      };

      const doc = makeDoc({
        builderType: 'unrelated.type',
        builderFields: { risk_score: 25 },
      });
      const { attributes: returned } = change.backfillFn(doc, {});

      expect(returned).toEqual({});
    });
  });

  describe('missing version guard', () => {
    it('throws if the manifest has no entry for the requested version', () => {
      expect(() =>
        fromBuilderManifest(manifestV1Only, 99)
      ).toThrow(`Builder type "${TEST_TYPE}" has no version 99 in its manifest`);
    });
  });

  // ---------------------------------------------------------------------------
  // Open-record assertion (test-enforced invariant)
  //
  // The persisted attributes schema must keep `metadata.builder_fields` as an
  // open record so that new builder fields never fail against older code during
  // rollback. This test pins that property: if a future change accidentally
  // tightens the schema (e.g. adds .strict() or removes schema.any()), this
  // test catches it.
  //
  // Ref: rule-data-migration.md "Rollback behavior"
  //      rule-type-registration.md "The fold into the saved-object registration"
  // ---------------------------------------------------------------------------

  describe('open-record assertion: metadata.builder_fields stays an open record', () => {
    it('the v4 ruleMetadataSchema accepts an object with arbitrary unknown keys in builder_fields', () => {
      // schema.recordOf(schema.string(), schema.any()) is the expected shape.
      // If builder_fields were tightened to a fixed set of keys, this would throw.
      expect(() =>
        ruleMetadataSchemaV4.validate({
          name: 'test rule',
          builder_fields: {
            unknown_key_1: 'some string',
            unknown_key_2: 42,
            deeply_nested: { a: { b: true } },
          },
        })
      ).not.toThrow();
    });

    it('the validated builder_fields value preserves all arbitrary keys', () => {
      const fields = {
        future_field: 'added in manifest v3',
        numeric: 123,
        nested: { x: 1 },
      };

      const result = ruleMetadataSchemaV4.validate({
        name: 'test rule',
        builder_fields: fields,
      });

      expect(result.builder_fields).toEqual(fields);
    });

    it('the full v4 attributes schema also keeps builder_fields open', () => {
      // Validate using the composite schema (not just the metadata sub-schema).
      const fullFields = { arbitrary_key: 'value', num: 99 };

      expect(() =>
        ruleSavedObjectAttributesSchemaV4.validate({
          kind: 'alert',
          metadata: { name: 'test rule', builder_fields: fullFields },
          time_field: '@timestamp',
          schedule: { every: '5m' },
          query: {
            format: 'standalone',
            breach: { query: 'FROM logs-* | LIMIT 1' },
          },
          enabled: true,
          createdBy: 'elastic',
          updatedBy: 'elastic',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        })
      ).not.toThrow();
    });
  });
});
