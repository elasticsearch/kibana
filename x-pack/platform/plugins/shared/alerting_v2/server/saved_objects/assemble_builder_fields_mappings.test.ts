/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BuilderTypeManifest } from '@kbn/alerting-v2-rule-builders';
import { assembleBuilderFieldsMappings } from './assemble_builder_fields_mappings';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A manifest that declares one typed sub-field in version 1. */
const manifestA: BuilderTypeManifest = {
  type: 'test.type.a',
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

/** A manifest that declares a different sub-field in version 1. */
const manifestB: BuilderTypeManifest = {
  type: 'test.type.b',
  currentVersion: 1,
  versions: {
    1: {
      addedSubFieldMappings: {
        max_signals: { type: 'integer' },
      },
    },
  },
};

/** A manifest that declares the SAME sub-fields as manifestA (shared fragment pattern). */
const manifestC: BuilderTypeManifest = {
  type: 'test.type.c',
  currentVersion: 1,
  versions: {
    1: {
      addedSubFieldMappings: {
        // Identical declarations to manifestA — must merge silently.
        risk_score: { type: 'integer' },
        note: { type: 'text' },
        // Plus an additional field unique to this type.
        severity_level: { type: 'keyword' },
      },
    },
  },
};

/** A manifest that declares the same path as manifestA but with a DIFFERENT type — conflict. */
const manifestConflict: BuilderTypeManifest = {
  type: 'test.type.conflict',
  currentVersion: 1,
  versions: {
    1: {
      addedSubFieldMappings: {
        // risk_score is 'integer' in manifestA but 'keyword' here — conflict.
        risk_score: { type: 'keyword' },
      },
    },
  },
};

/** A manifest with no sub-field mappings (only a backfill). */
const manifestNoMappings: BuilderTypeManifest = {
  type: 'test.type.nomap',
  currentVersion: 1,
  versions: {
    1: {
      backfillFn: (fields) => ({ ...fields, computed: true }),
    },
  },
};

/** A manifest with mappings spread across two versions. */
const manifestMultiVersion: BuilderTypeManifest = {
  type: 'test.type.multiversion',
  currentVersion: 2,
  versions: {
    1: {
      addedSubFieldMappings: {
        risk_score: { type: 'integer' },
      },
    },
    2: {
      addedSubFieldMappings: {
        max_signals: { type: 'integer' },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('assembleBuilderFieldsMappings', () => {
  it('returns an empty object when no manifests are provided', () => {
    const result = assembleBuilderFieldsMappings([]);
    expect(result).toEqual({});
  });

  it('returns an empty object when the only manifest has no addedSubFieldMappings', () => {
    const result = assembleBuilderFieldsMappings([manifestNoMappings]);
    expect(result).toEqual({});
  });

  it('returns the sub-field mappings from a single manifest', () => {
    const result = assembleBuilderFieldsMappings([manifestA]);
    expect(result).toEqual({
      risk_score: { type: 'integer' },
      note: { type: 'text' },
    });
  });

  it('merges sub-field mappings from two manifests with disjoint paths', () => {
    const result = assembleBuilderFieldsMappings([manifestA, manifestB]);
    expect(result).toEqual({
      risk_score: { type: 'integer' },
      note: { type: 'text' },
      max_signals: { type: 'integer' },
    });
  });

  it('merges identical sub-field declarations from different manifests silently', () => {
    // manifestA and manifestC both declare risk_score: integer and note: text.
    // Those must merge silently (shared fragment pattern).
    const result = assembleBuilderFieldsMappings([manifestA, manifestC]);
    expect(result).toEqual({
      risk_score: { type: 'integer' },
      note: { type: 'text' },
      severity_level: { type: 'keyword' },
    });
  });

  it('collects sub-field mappings from all versions of a multi-version manifest', () => {
    const result = assembleBuilderFieldsMappings([manifestMultiVersion]);
    expect(result).toEqual({
      risk_score: { type: 'integer' },
      max_signals: { type: 'integer' },
    });
  });

  it('throws when two manifests declare the same path with different field types', () => {
    // manifestA has risk_score: integer; manifestConflict has risk_score: keyword.
    expect(() => assembleBuilderFieldsMappings([manifestA, manifestConflict])).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('risk_score'),
      })
    );

    expect(() => assembleBuilderFieldsMappings([manifestA, manifestConflict])).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('test.type.a'),
      })
    );

    expect(() => assembleBuilderFieldsMappings([manifestA, manifestConflict])).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('test.type.conflict'),
      })
    );
  });

  it('the conflict error message names the conflicting types and the path', () => {
    let message = '';
    try {
      assembleBuilderFieldsMappings([manifestA, manifestConflict]);
    } catch (err) {
      message = err.message;
    }
    expect(message).toContain('"risk_score"');
    expect(message).toContain('"test.type.a"');
    expect(message).toContain('"test.type.conflict"');
  });

  it('assembles correctly with a mix of manifests, including one with no mappings', () => {
    const result = assembleBuilderFieldsMappings([manifestA, manifestNoMappings, manifestB]);
    expect(result).toEqual({
      risk_score: { type: 'integer' },
      note: { type: 'text' },
      max_signals: { type: 'integer' },
    });
  });
});
