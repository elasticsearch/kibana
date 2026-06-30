/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { detectVegaDialect } from './dialect';

describe('detectVegaDialect', () => {
  it('detects Vega-Lite from its $schema', () => {
    expect(
      detectVegaDialect({ $schema: 'https://vega.github.io/schema/vega-lite/v6.json', mark: 'bar' })
    ).toBe('vega-lite');
  });

  it('detects raw Vega from its $schema', () => {
    expect(
      detectVegaDialect({ $schema: 'https://vega.github.io/schema/vega/v5.json', marks: [] })
    ).toBe('vega');
  });

  it('falls back to structure when the $schema is missing: marks array means raw Vega', () => {
    expect(detectVegaDialect({ marks: [{ type: 'rect' }] })).toBe('vega');
  });

  it('falls back to Vega-Lite for a singular mark or composite view without a $schema', () => {
    expect(detectVegaDialect({ mark: 'bar' })).toBe('vega-lite');
    expect(detectVegaDialect({ facet: {}, spec: { mark: 'bar' } })).toBe('vega-lite');
    expect(detectVegaDialect({ layer: [{ mark: 'line' }] })).toBe('vega-lite');
  });

  it('prefers the $schema over structure when both are present', () => {
    expect(
      detectVegaDialect({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        marks: [{ type: 'rect' }],
      })
    ).toBe('vega-lite');
  });
});
