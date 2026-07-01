/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FieldDefinition, FlagDefinition } from './types';
import { EMPTY_MODEL } from './types';
import { buildSchema, parseQueryText } from './parse_query_text';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple identity field: display value === internal ID. */
const identityField = (fieldName: string): FieldDefinition => ({
  fieldName,
  resolveIdToDisplay: (id) => id,
  resolveDisplayToId: (display) => display,
});

/** Field that maps display names to IDs via a lookup table. */
const lookupField = (
  fieldName: string,
  entries: Array<{ id: string; display: string }>
): FieldDefinition => ({
  fieldName,
  resolveIdToDisplay: (id) => entries.find((e) => e.id === id)?.display ?? id,
  resolveDisplayToId: (display) => entries.find((e) => e.display === display)?.id,
  resolveFuzzyDisplayToIds: (partial) => {
    const lower = partial.toLowerCase();
    return entries.filter((e) => e.display.toLowerCase().includes(lower)).map((e) => e.id);
  },
});

const tagField = lookupField('tag', [
  { id: 'tag-1', display: 'Production' },
  { id: 'tag-2', display: 'Archived' },
  { id: 'tag-3', display: 'Beta' },
]);

const createdByField = lookupField('createdBy', [
  { id: 'u_jane', display: 'jane@example.com' },
  { id: 'u_john', display: 'john@example.com' },
]);

const starredFlag: FlagDefinition = { flagName: 'starred', modelKey: 'starred' };

// ---------------------------------------------------------------------------
// buildSchema
// ---------------------------------------------------------------------------

describe('buildSchema', () => {
  it('returns `undefined` for an empty field list.', () => {
    expect(buildSchema([])).toBeUndefined();
  });

  it('builds a non-strict schema with all field names typed as string.', () => {
    const schema = buildSchema([identityField('tag'), identityField('createdBy')]);
    expect(schema).toEqual({
      strict: false,
      fields: {
        tag: { type: 'string' },
        createdBy: { type: 'string' },
      },
    });
  });

  it('builds a schema for a single field.', () => {
    const schema = buildSchema([identityField('status')]);
    expect(schema).toEqual({
      strict: false,
      fields: { status: { type: 'string' } },
    });
  });
});

// ---------------------------------------------------------------------------
// parseQueryText
// ---------------------------------------------------------------------------

describe('parseQueryText', () => {
  const fields = [tagField, createdByField];
  const flags = [starredFlag];
  const schema = buildSchema(fields);

  describe('empty and whitespace input', () => {
    it('returns `EMPTY_MODEL` for an empty string.', () => {
      expect(parseQueryText('', fields, flags, schema)).toEqual(EMPTY_MODEL);
    });

    it('returns `EMPTY_MODEL` for whitespace-only input.', () => {
      expect(parseQueryText('   \t  ', fields, flags, schema)).toEqual(EMPTY_MODEL);
    });
  });

  describe('free-text search', () => {
    it('extracts plain text as `search`.', () => {
      const result = parseQueryText('my dashboard', fields, flags, schema);
      expect(result.search).toBe('my dashboard');
      expect(result.filters).toEqual({});
      expect(result.flags).toEqual({});
    });

    it('preserves unrecognised field syntax in search text.', () => {
      const result = parseQueryText('status:open my query', fields, flags, schema);
      expect(result.search).toBe('status:open my query');
    });
  });

  describe('field filter extraction', () => {
    it('routes a bare scalar clause to `includeAll` (match-all term).', () => {
      const result = parseQueryText('tag:Production', fields, flags, schema);
      expect(result.filters.tag).toEqual({ include: [], includeAll: ['tag-1'], exclude: [] });
      expect(result.search).toBe('');
    });

    it('extracts a negated (exclude) field clause.', () => {
      const result = parseQueryText('-tag:Archived', fields, flags, schema);
      expect(result.filters.tag).toEqual({ include: [], exclude: ['tag-2'] });
    });

    it('combines a bare include scalar and an exclude for the same field.', () => {
      const result = parseQueryText('tag:Production -tag:Archived', fields, flags, schema);
      expect(result.filters.tag).toEqual({
        include: [],
        includeAll: ['tag-1'],
        exclude: ['tag-2'],
      });
    });

    it('extracts multiple fields simultaneously.', () => {
      const result = parseQueryText(
        'tag:Production createdBy:jane@example.com',
        fields,
        flags,
        schema
      );
      expect(result.filters.tag).toEqual({ include: [], includeAll: ['tag-1'], exclude: [] });
      expect(result.filters.createdBy).toEqual({
        include: [],
        includeAll: ['u_jane'],
        exclude: [],
      });
    });

    it('routes a single OR-group clause to `include` (match-any).', () => {
      const result = parseQueryText('tag:(Production or Archived)', fields, flags, schema);
      expect(result.filters.tag).toEqual({ include: ['tag-1', 'tag-2'], exclude: [] });
    });

    it('routes separate bare scalar clauses to `includeAll` (match-all/AND).', () => {
      const result = parseQueryText('tag:Production tag:Archived', fields, flags, schema);
      expect(result.filters.tag).toEqual({
        include: [],
        includeAll: ['tag-1', 'tag-2'],
        exclude: [],
      });
    });

    it('keeps separate single-value OR-groups as match-any (non-breaking).', () => {
      const result = parseQueryText('tag:(Production) tag:(Archived)', fields, flags, schema);
      expect(result.filters.tag).toEqual({ include: ['tag-1', 'tag-2'], exclude: [] });
    });

    it('mixes a match-any group with a match-all scalar.', () => {
      const result = parseQueryText('tag:(Production or Archived) tag:Beta', fields, flags, schema);
      expect(result.filters.tag).toEqual({
        include: ['tag-1', 'tag-2'],
        includeAll: ['tag-3'],
        exclude: [],
      });
    });

    it('combines match-all scalars with an exclude clause.', () => {
      const result = parseQueryText('tag:Production tag:Archived -tag:Beta', fields, flags, schema);
      expect(result.filters.tag).toEqual({
        include: [],
        includeAll: ['tag-1', 'tag-2'],
        exclude: ['tag-3'],
      });
    });

    it('deduplicates repeated bare scalars into a single match-all value.', () => {
      const result = parseQueryText('tag:Production tag:Production', fields, flags, schema);
      expect(result.filters.tag?.includeAll).toEqual(['tag-1']);
      expect(result.filters.tag?.include).toEqual([]);
    });

    it('keeps the raw display value when resolution fails so the filter still applies.', () => {
      const fieldWithNoFuzzy: FieldDefinition = {
        fieldName: 'tag',
        resolveIdToDisplay: (id) => id,
        resolveDisplayToId: () => undefined,
      };
      const result = parseQueryText(
        'tag:nonexistent',
        [fieldWithNoFuzzy],
        flags,
        buildSchema([fieldWithNoFuzzy])
      );
      expect(result.filters.tag).toEqual({ include: [], includeAll: ['nonexistent'], exclude: [] });
    });

    it('tracks referenced fields when the value cannot be resolved.', () => {
      const fieldWithNoFuzzy: FieldDefinition = {
        fieldName: 'createdBy',
        resolveIdToDisplay: (id) => id,
        resolveDisplayToId: () => undefined,
      };
      const result = parseQueryText(
        'createdBy:someone@example.com',
        [fieldWithNoFuzzy],
        flags,
        buildSchema([fieldWithNoFuzzy])
      );
      expect(result.filters.createdBy).toEqual({
        include: [],
        includeAll: ['someone@example.com'],
        exclude: [],
      });
      expect(result.referencedFields).toEqual(new Set(['createdBy']));
      expect(result.unresolvedFields).toEqual(new Set(['createdBy']));
    });

    it('sets unresolvedFields to empty when all values resolve.', () => {
      const result = parseQueryText('createdBy:jane@example.com', fields, flags, schema);
      expect(result.filters.createdBy).toEqual({
        include: [],
        includeAll: ['u_jane'],
        exclude: [],
      });
      expect(result.unresolvedFields.size).toBe(0);
    });
  });

  describe('fuzzy field resolution', () => {
    it('uses fuzzy matching when exact resolution fails (single match → match-all).', () => {
      const result = parseQueryText('tag:prod', fields, flags, schema);
      expect(result.filters.tag).toEqual({ include: [], includeAll: ['tag-1'], exclude: [] });
    });

    it('resolves multiple fuzzy matches into the include list.', () => {
      const result = parseQueryText('createdBy:example', fields, flags, schema);
      expect(result.filters.createdBy?.include).toEqual(
        expect.arrayContaining(['u_jane', 'u_john'])
      );
    });
  });

  describe('flag extraction', () => {
    it('extracts `is:starred` as a boolean flag.', () => {
      const result = parseQueryText('is:starred', fields, flags, schema);
      expect(result.flags).toEqual({ starred: true });
      expect(result.search).toBe('');
    });

    it('extracts flags alongside search text and field filters.', () => {
      const result = parseQueryText('dashboard tag:Production is:starred', fields, flags, schema);
      expect(result.flags).toEqual({ starred: true });
      expect(result.filters.tag).toEqual({ include: [], includeAll: ['tag-1'], exclude: [] });
      expect(result.search).toBe('dashboard');
    });

    it('handles multiple custom flags.', () => {
      const customFlags: FlagDefinition[] = [
        starredFlag,
        { flagName: 'managed', modelKey: 'managed' },
      ];
      const result = parseQueryText('is:starred is:managed', fields, customFlags, schema);
      expect(result.flags).toEqual({ starred: true, managed: true });
    });

    it('does not set the flag when it is absent from the query.', () => {
      const result = parseQueryText('dashboard', fields, flags, schema);
      expect(result.flags).toEqual({});
    });
  });

  describe('search text extraction', () => {
    it('strips known fields and flags, preserving only free text.', () => {
      const result = parseQueryText(
        'dashboard tag:Production is:starred report',
        fields,
        flags,
        schema
      );
      expect(result.search).toBe('dashboard report');
    });

    it('preserves unrecognised `is:` flags as search text.', () => {
      const result = parseQueryText('is:custom dashboard', fields, flags, schema);
      expect(result.search).toBe('is:custom dashboard');
    });
  });

  describe('malformed input', () => {
    it('falls back to trimmed text when EUI query parsing fails.', () => {
      const result = parseQueryText('  status:open (unclosed  ', fields, flags, schema);
      expect(result).toEqual({
        ...EMPTY_MODEL,
        search: 'status:open (unclosed',
      });
    });
  });

  describe('no fields or flags configured', () => {
    it('treats everything as search text when no fields or flags are defined.', () => {
      const result = parseQueryText('tag:Production is:starred hello', [], [], undefined);
      expect(result.search).toContain('hello');
      expect(result.filters).toEqual({});
      expect(result.flags).toEqual({});
    });
  });
});
