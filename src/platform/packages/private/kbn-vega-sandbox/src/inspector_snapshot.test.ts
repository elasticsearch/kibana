/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { serializeDataSetsFromView, serializeSignalsFromView } from './inspector_snapshot';
import type { VegaInspectorRuntimeView } from './inspector_snapshot';

const createView = (runtime: VegaInspectorRuntimeView['_runtime']): VegaInspectorRuntimeView => ({
  addSignalListener: jest.fn(),
  removeSignalListener: jest.fn(),
  _runtime: runtime,
});

describe('serializeDataSetsFromView', () => {
  it('stringifies object cells and skips empty data sets', () => {
    const view = createView({
      data: {
        empty: { values: { value: [] } },
        table: {
          values: {
            value: [
              { category: 'jpg', amount: 1, meta: { nested: true } },
              { category: 'png', amount: 2, meta: { nested: false } },
            ],
          },
        },
      },
    });

    expect(serializeDataSetsFromView(view)).toEqual([
      {
        id: 'table',
        columns: [
          { id: 'category', schema: 'json' },
          { id: 'amount', schema: 'json' },
          { id: 'meta', schema: 'json' },
        ],
        data: [
          { category: 'jpg', amount: '1', meta: '{"nested":true}' },
          { category: 'png', amount: '2', meta: '{"nested":false}' },
        ],
      },
    ]);
  });

  it('uses a placeholder when a cell cannot be serialized', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const view = createView({
      data: {
        table: {
          values: {
            value: [{ category: circular }],
          },
        },
      },
    });

    expect(serializeDataSetsFromView(view)[0].data[0].category).toBe('(..)');
  });
});

describe('serializeSignalsFromView', () => {
  it('emits name/value rows without UI column labels', () => {
    const view = createView({
      signals: {
        width: { value: 200 },
        click: { value: { match: 'jpg' } },
      },
    });

    expect(serializeSignalsFromView(view)).toEqual({
      data: [
        { name: 'width', value: '200' },
        { name: 'click', value: '{"match":"jpg"}' },
      ],
    });
  });
});
