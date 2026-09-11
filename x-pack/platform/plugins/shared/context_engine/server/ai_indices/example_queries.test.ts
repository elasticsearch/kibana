/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Parser } from '@elastic/esql';
import { buildExampleQueries } from './example_queries';

describe('buildExampleQueries', () => {
  const queries = buildExampleQueries('ai-index-idx-support*');

  it('returns the three fixed shapes, targeting the given index', () => {
    expect(queries.map(({ title }) => title)).toEqual([
      'Full text search, lexical and semantic fused together (?query)',
      'Filter by knowledge item type and tag (?type, ?tag; tags is multi-valued, so MATCH)',
      'Count by type',
    ]);
    for (const { esql } of queries) {
      expect(esql.startsWith('FROM ai-index-idx-support*')).toBe(true);
    }
  });

  it('parses as valid ES|QL', () => {
    for (const { esql } of queries) {
      expect(Parser.parse(esql).errors).toEqual([]);
    }
  });

  it('uses named parameters instead of sample values', () => {
    const [hybrid, filter, count] = queries.map(({ esql }) => esql);
    expect(hybrid).toContain('?query');
    expect(hybrid).toMatch(/\| FORK\n[\s\S]*\| FUSE\n/);
    expect(filter).toContain('type == ?type AND MATCH(tags, ?tag)');
    expect(count).not.toContain('?');
    for (const esql of [hybrid, filter, count]) {
      expect(esql).not.toMatch(/"[^"]+"/);
    }
  });
});
