/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { classifyESQLSource, isSingleSource } from './classify_esql_source';

describe('classifyESQLSource', () => {
  describe('single', () => {
    it('classifies a plain index name', () => {
      expect(classifyESQLSource('my-index')).toBe('single');
    });

    it('classifies a single data stream name', () => {
      expect(classifyESQLSource('logs-nginx.access-default')).toBe('single');
    });

    it('classifies a single backing index (dot-prefixed)', () => {
      expect(classifyESQLSource('.ds-edge-case-gauge-to-counter-2026.04.29-000001')).toBe('single');
    });

    it('classifies a remote-cluster single index as single', () => {
      expect(classifyESQLSource('cluster:myindex')).toBe('single');
    });

    it('classifies a source with a ::selector suffix as single', () => {
      expect(classifyESQLSource('myindex::failures')).toBe('single');
    });

    it('classifies a remote-cluster source with a selector as single', () => {
      expect(classifyESQLSource('cluster:myindex::failures')).toBe('single');
    });
  });

  describe('pattern', () => {
    it('classifies a wildcard index pattern', () => {
      expect(classifyESQLSource('logs-*')).toBe('pattern');
    });

    it('classifies a wildcard at the start', () => {
      expect(classifyESQLSource('*-default')).toBe('pattern');
    });

    it('classifies a remote-cluster glob source', () => {
      expect(classifyESQLSource('cluster:logs-*')).toBe('pattern');
    });

    it('classifies a bare wildcard', () => {
      expect(classifyESQLSource('*')).toBe('pattern');
    });
  });

  describe('multi', () => {
    it('classifies a comma-separated two-source list', () => {
      expect(classifyESQLSource('index-a, index-b')).toBe('multi');
    });

    it('classifies a comma-separated list with a wildcard member', () => {
      expect(classifyESQLSource('logs-*, metrics-*')).toBe('multi');
    });

    it('classifies a comma-separated list with remote cluster sources', () => {
      expect(classifyESQLSource('cluster:index-a, cluster:index-b')).toBe('multi');
    });
  });
});

describe('isSingleSource', () => {
  it('returns true for a single index', () => {
    expect(isSingleSource('my-index')).toBe(true);
  });

  it('returns true for a backing index', () => {
    expect(isSingleSource('.ds-edge-case-gauge-to-counter-2026.04.29-000001')).toBe(true);
  });

  it('returns false for a wildcard pattern', () => {
    expect(isSingleSource('logs-*')).toBe(false);
  });

  it('returns false for a multi-source list', () => {
    expect(isSingleSource('index-a, index-b')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSingleSource(undefined)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isSingleSource('')).toBe(false);
  });
});
