/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { extractEsqlFromSpec } from './recover_esql';

const ESQL = 'FROM logs-* | STATS count = COUNT(*) BY region';

describe('extractEsqlFromSpec', () => {
  it('recovers the ES|QL query from a serialized normalized spec', () => {
    const spec = JSON.stringify({
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      mark: 'bar',
      data: { url: { '%type%': 'esql', query: ESQL } },
    });

    expect(extractEsqlFromSpec(spec)).toBe(ESQL);
  });

  it('recovers the ES|QL query from an already-parsed spec object', () => {
    expect(extractEsqlFromSpec({ data: { url: { '%type%': 'esql', query: ESQL } } })).toBe(ESQL);
  });

  it('returns undefined when the data source is not an ES|QL binding', () => {
    expect(extractEsqlFromSpec({ mark: 'bar' })).toBeUndefined();
    expect(
      extractEsqlFromSpec({ data: { url: { '%type%': 'index', query: ESQL } } })
    ).toBeUndefined();
    expect(extractEsqlFromSpec({ data: { values: [{ a: 1 }] } })).toBeUndefined();
  });

  it('returns undefined for empty, malformed, or blank-query input', () => {
    expect(extractEsqlFromSpec(undefined)).toBeUndefined();
    expect(extractEsqlFromSpec(null)).toBeUndefined();
    expect(extractEsqlFromSpec('not json')).toBeUndefined();
    expect(
      extractEsqlFromSpec({ data: { url: { '%type%': 'esql', query: '   ' } } })
    ).toBeUndefined();
  });

  it('recovers the ES|QL query from a raw Vega spec (data array, bound on "source")', () => {
    const spec = {
      $schema: 'https://vega.github.io/schema/vega/v5.json',
      data: [
        { name: 'source', url: { '%type%': 'esql', query: ESQL } },
        { name: 'nodes', source: 'source' },
      ],
      marks: [{ type: 'rect' }],
    };

    expect(extractEsqlFromSpec(spec)).toBe(ESQL);
    expect(extractEsqlFromSpec(JSON.stringify(spec))).toBe(ESQL);
  });

  it('returns undefined for a raw Vega spec whose data sets have no ES|QL url', () => {
    expect(
      extractEsqlFromSpec({
        data: [
          { name: 'source', values: [] },
          { name: 'nodes', source: 'source' },
        ],
        marks: [{ type: 'rect' }],
      })
    ).toBeUndefined();
  });
});
