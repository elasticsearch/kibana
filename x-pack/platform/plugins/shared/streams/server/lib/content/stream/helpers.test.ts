/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { scopeIncludedObjects, withoutInheritedFieldMetadata } from './helpers';

describe('content pack stream helpers', () => {
  describe('withoutInheritedFieldMetadata', () => {
    it('strips from and alias_for properties from field definitions', () => {
      const fieldsWithMetadata = {
        'resource.attributes.foo.bar': {
          type: 'keyword' as const,
          from: 'logs.parent',
        },
        'resource.attributes.baz': {
          type: 'long' as const,
          from: 'logs.ancestor',
          alias_for: 'original.field',
        },
        'regular.field': {
          type: 'boolean' as const,
        },
      };

      const result = withoutInheritedFieldMetadata(fieldsWithMetadata);

      expect(result).toEqual({
        'resource.attributes.foo.bar': { type: 'keyword' },
        'resource.attributes.baz': { type: 'long' },
        'regular.field': { type: 'boolean' },
      });
    });

    it('preserves other field properties', () => {
      const fields = {
        'date.field': {
          type: 'date' as const,
          format: 'yyyy-MM-dd',
          from: 'logs.parent',
        },
      };

      const result = withoutInheritedFieldMetadata(fields);

      expect(result).toEqual({
        'date.field': {
          type: 'date',
          format: 'yyyy-MM-dd',
        },
      });
    });

    it('handles empty fields', () => {
      const result = withoutInheritedFieldMetadata({});
      expect(result).toEqual({});
    });
  });

  it('scopes included objects to a parent', () => {
    const scoped = scopeIncludedObjects({
      root: 'logs.foo',
      include: {
        objects: {
          mappings: true,
          routing: [
            {
              destination: 'bar',
              objects: { all: {} },
            },
            {
              destination: 'baz',
              objects: {
                mappings: true,
                routing: [
                  {
                    destination: 'baz.foo',
                    objects: { all: {} },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(scoped).toEqual({
      objects: {
        mappings: true,
        routing: [
          {
            destination: 'logs.foo.bar',
            objects: { all: {} },
          },
          {
            destination: 'logs.foo.baz',
            objects: {
              mappings: true,
              routing: [
                {
                  destination: 'logs.foo.baz.foo',
                  objects: { all: {} },
                },
              ],
            },
          },
        ],
      },
    });
  });
});
