/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { escapeVegaFieldReferences } from './field_escaping';

describe('escapeVegaFieldReferences', () => {
  it('escapes dots in a field reference', () => {
    const spec = { encoding: { x: { field: 'host.name', type: 'nominal' } } };

    expect(escapeVegaFieldReferences(spec)).toEqual({
      encoding: { x: { field: 'host\\.name', type: 'nominal' } },
    });
  });

  it('leaves dot-free field references untouched', () => {
    const spec = { encoding: { y: { field: 'count', type: 'quantitative' } } };

    expect(escapeVegaFieldReferences(spec)).toEqual(spec);
  });

  it('does not double-escape an already escaped field', () => {
    const spec = { encoding: { x: { field: 'host\\.name' } } };

    expect(escapeVegaFieldReferences(spec)).toEqual(spec);
  });

  it('escapes fields nested inside arrays such as tooltip', () => {
    const spec = {
      encoding: {
        tooltip: [{ field: 'service.name' }, { field: 'duration' }],
      },
    };

    expect(escapeVegaFieldReferences(spec)).toEqual({
      encoding: {
        tooltip: [{ field: 'service\\.name' }, { field: 'duration' }],
      },
    });
  });

  it('only rewrites the "field" key, not other dotted string values', () => {
    const spec = { title: 'Requests by host.name', mark: 'bar' };

    expect(escapeVegaFieldReferences(spec)).toEqual(spec);
  });

  it('does not mutate the input spec', () => {
    const spec = { encoding: { x: { field: 'a.b' } } };
    const snapshot = JSON.parse(JSON.stringify(spec));

    escapeVegaFieldReferences(spec);

    expect(spec).toEqual(snapshot);
  });
});
