/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { pipe } from 'fp-ts/pipeable';
import { left } from 'fp-ts/Either';
import type { Type } from '.';
import {
  isValueListItemValueSortable,
  type,
  VALUE_LIST_ELASTICSEARCH_TYPES_ALPHABETICAL,
  VALUE_LIST_ELASTICSEARCH_TYPES_ORDERED,
} from '.';
import { exactCheck, foldLeftRight, getPaths } from '@kbn/securitysolution-io-ts-utils';

describe('type', () => {
  test('it will work with a given expected type', () => {
    const payload: Type = 'keyword';
    const decoded = type.decode(payload);
    const checked = exactCheck(payload, decoded);
    const message = pipe(checked, foldLeftRight);
    expect(getPaths(left(message.errors))).toEqual([]);
    expect(message.schema).toEqual(payload);
  });

  test('it will give an error if given a type that does not exist', () => {
    const payload: Type | 'madeup' = 'madeup';
    const decoded = type.decode(payload);
    const checked = exactCheck(payload, decoded);
    const message = pipe(checked, foldLeftRight);
    const [errorPath] = getPaths(left(message.errors));
    expect(errorPath).toMatch(/^Invalid value "madeup" supplied to "/);
    expect(errorPath).toContain('"binary"');
    expect(errorPath).toContain('"text"');
    expect(message.schema).toEqual({});
  });
});

describe('isValueListItemValueSortable', () => {
  const unsortableTypes: Type[] = [
    'text',
    'binary',
    'ip_range',
    'integer_range',
    'float_range',
    'long_range',
    'double_range',
    'date_range',
  ];

  test.each(unsortableTypes)('returns false for %s', (listType) => {
    expect(isValueListItemValueSortable(listType)).toBe(false);
  });

  test.each(['keyword', 'ip', 'long', 'boolean'] as const)(
    'returns true for scalar type %s',
    (listType) => {
      expect(isValueListItemValueSortable(listType)).toBe(true);
    }
  );
});

describe('VALUE_LIST_ELASTICSEARCH_TYPES_ALPHABETICAL', () => {
  test('includes every type exactly once, sorted lexically with numeric segments', () => {
    expect(VALUE_LIST_ELASTICSEARCH_TYPES_ALPHABETICAL).toHaveLength(
      VALUE_LIST_ELASTICSEARCH_TYPES_ORDERED.length
    );
    const sorted = [...VALUE_LIST_ELASTICSEARCH_TYPES_ORDERED].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
    expect(VALUE_LIST_ELASTICSEARCH_TYPES_ALPHABETICAL).toEqual(sorted);
  });

  test('binary precedes boolean and date_nanos precedes date_range', () => {
    expect(VALUE_LIST_ELASTICSEARCH_TYPES_ALPHABETICAL.indexOf('binary')).toBeLessThan(
      VALUE_LIST_ELASTICSEARCH_TYPES_ALPHABETICAL.indexOf('boolean')
    );
    expect(VALUE_LIST_ELASTICSEARCH_TYPES_ALPHABETICAL.indexOf('date_nanos')).toBeLessThan(
      VALUE_LIST_ELASTICSEARCH_TYPES_ALPHABETICAL.indexOf('date_range')
    );
  });
});
