/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { vegaLibraryItemSavedObjectSchema } from './vega_saved_object';

describe('Vega library item saved object schema', () => {
  test.each([
    { title: 'HJSON Vega', spec: { format: 'hjson', value: '{ mark: point }' } },
    { title: 'JSON Vega', spec: { format: 'json', value: { mark: 'point' } } },
  ])('accepts API-compatible attributes', (attributes) => {
    expect(vegaLibraryItemSavedObjectSchema.validate(attributes)).toEqual(attributes);
  });

  test.each([
    ['empty title', { title: '', spec: { format: 'hjson', value: '{ mark: point }' } }],
    ['empty HJSON', { title: 'Empty HJSON', spec: { format: 'hjson', value: '' } }],
    ['unknown format', { title: 'Unknown format', spec: { format: 'yaml', value: 'mark: point' } }],
  ])('rejects %s', (_, attributes) => {
    expect(() => vegaLibraryItemSavedObjectSchema.validate(attributes)).toThrow();
  });

  test('normalizes a serialized JSON object before persistence', () => {
    expect(
      vegaLibraryItemSavedObjectSchema.validate({
        title: 'String JSON',
        spec: { format: 'json', value: '{ "mark": "point" }' },
      })
    ).toEqual({
      title: 'String JSON',
      spec: { format: 'json', value: { mark: 'point' } },
    });
  });
});
