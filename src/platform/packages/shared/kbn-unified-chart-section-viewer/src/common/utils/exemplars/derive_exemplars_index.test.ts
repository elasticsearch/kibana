/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { deriveExemplarsIndex } from './derive_exemplars_index';

describe('deriveExemplarsIndex', () => {
  it('swaps the metrics- prefix for exemplars- on an OTel data stream', () => {
    expect(deriveExemplarsIndex('metrics-generic.otel-default')).toBe(
      'exemplars-generic.otel-default'
    );
  });

  it('preserves a non-default namespace', () => {
    expect(deriveExemplarsIndex('metrics-generic.otel-production')).toBe(
      'exemplars-generic.otel-production'
    );
  });

  it('returns undefined for a non-OTel dataset', () => {
    // `exemplars-system.cpu-default` matches no template and does not exist,
    // so deriving it would produce a query that 400s.
    expect(deriveExemplarsIndex('metrics-system.cpu-default')).toBeUndefined();
  });

  it('returns undefined when the .otel marker is in the namespace rather than the dataset', () => {
    expect(deriveExemplarsIndex('metrics-generic-default.otel')).toBeUndefined();
  });

  it('returns undefined for a wildcard pattern', () => {
    expect(deriveExemplarsIndex('metrics-*')).toBeUndefined();
    expect(deriveExemplarsIndex('metrics-*.otel-*')).toBeUndefined();
  });

  it('returns undefined for a comma-separated multi-index source', () => {
    expect(
      deriveExemplarsIndex('metrics-generic.otel-default,metrics-other.otel-default')
    ).toBeUndefined();
  });

  it('returns undefined for a cross-cluster source', () => {
    expect(deriveExemplarsIndex('remote:metrics-generic.otel-default')).toBeUndefined();
  });

  it('returns undefined for a source selector suffix', () => {
    expect(deriveExemplarsIndex('metrics-generic.otel-default::failures')).toBeUndefined();
  });

  it('returns undefined when the input is already an exemplars index', () => {
    expect(deriveExemplarsIndex('exemplars-generic.otel-default')).toBeUndefined();
  });

  it('returns undefined for an index that does not use the metrics- prefix', () => {
    expect(deriveExemplarsIndex('logs-generic.otel-default')).toBeUndefined();
    expect(
      deriveExemplarsIndex('.ds-metrics-generic.otel-default-2026.09.09-000001')
    ).toBeUndefined();
  });

  it('returns undefined when there is no namespace segment', () => {
    expect(deriveExemplarsIndex('metrics-generic.otel')).toBeUndefined();
    expect(deriveExemplarsIndex('metrics-generic.otel-')).toBeUndefined();
  });

  it('returns undefined for the bare prefix', () => {
    expect(deriveExemplarsIndex('metrics-')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(deriveExemplarsIndex('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only input', () => {
    expect(deriveExemplarsIndex('   ')).toBeUndefined();
  });
});
