/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EngineDescriptorType } from './types';

interface TestSchema {
  validate(input: unknown): unknown;
}

interface TestModelVersion {
  changes: unknown[];
  schemas?: {
    create?: TestSchema;
    forwardCompatibility?: TestSchema;
  };
}

const modelVersions = EngineDescriptorType.modelVersions as Record<number, TestModelVersion>;

/** Minimal valid v8-era descriptor. nonPriorityLogExtractionState is absent; v9 defaults it to null. */
const BASE_DESCRIPTOR = {
  type: 'user',
  status: 'started',
  logExtractionState: {
    checkpointTimestamp: null,
    paginationId: null,
    lastExecutionTimestamp: null,
    sliceEndTimestamp: null,
  },
  error: null,
  versionState: { version: 2, state: 'running', isMigratedFromV1: false },
};

describe('EngineDescriptorType model version 9 (nonPriorityLogExtractionState)', () => {
  const v9 = modelVersions[9];
  const v8 = modelVersions[8];

  it('changes is empty — no backfill needed because the field is nullable with a null default', () => {
    expect(v9.changes).toEqual([]);
  });

  it('v8-era descriptor (no nonPriorityLogExtractionState) validates against the v9 create schema', () => {
    expect(() => v9.schemas?.create?.validate(BASE_DESCRIPTOR)).not.toThrow();
  });

  it('null validates (state while dual-process is off)', () => {
    expect(() =>
      v9.schemas?.create?.validate({ ...BASE_DESCRIPTOR, nonPriorityLogExtractionState: null })
    ).not.toThrow();
  });

  it('full four-field non-priority cursor validates', () => {
    expect(() =>
      v9.schemas?.create?.validate({
        ...BASE_DESCRIPTOR,
        nonPriorityLogExtractionState: {
          checkpointTimestamp: '2026-01-01T00:00:00.000Z',
          paginationId: 'some-entity-id',
          lastExecutionTimestamp: '2025-12-31T23:00:00.000Z',
          sliceEndTimestamp: '2026-01-01T00:30:00.000Z',
        },
      })
    ).not.toThrow();
  });

  it('mid-run cursor (non-null checkpoint, paginationId, sliceEndTimestamp) validates', () => {
    expect(() =>
      v9.schemas?.create?.validate({
        ...BASE_DESCRIPTOR,
        nonPriorityLogExtractionState: {
          checkpointTimestamp: '2026-01-01T00:00:00.000Z',
          paginationId: 'some-entity-id',
          lastExecutionTimestamp: null,
          sliceEndTimestamp: '2026-01-01T00:30:00.000Z',
        },
      })
    ).not.toThrow();
  });

  it('rejects a wrongly typed value', () => {
    expect(() =>
      v9.schemas?.create?.validate({
        ...BASE_DESCRIPTOR,
        nonPriorityLogExtractionState: { checkpointTimestamp: 12345 },
      })
    ).toThrow();
  });

  it('v8 create schema rejects nonPriorityLogExtractionState — the field is new in v9', () => {
    expect(() =>
      v8.schemas?.create?.validate({ ...BASE_DESCRIPTOR, nonPriorityLogExtractionState: null })
    ).toThrow();
  });

  it('v8 forwardCompatibility drops nonPriorityLogExtractionState written by a v9 node', () => {
    const result = v8.schemas?.forwardCompatibility?.validate({
      ...BASE_DESCRIPTOR,
      nonPriorityLogExtractionState: {
        checkpointTimestamp: '2026-01-01T00:00:00.000Z',
        paginationId: null,
        lastExecutionTimestamp: null,
        sliceEndTimestamp: null,
      },
    });
    expect(result).not.toHaveProperty('nonPriorityLogExtractionState');
  });
});
