/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseCommaSeparatedList } from './comma_separated_list';

describe('utils parseCommaSeparatedList()', () => {
  test('supports non-string values', () => {
    expect(parseCommaSeparatedList(0)).toEqual([]);
    expect(parseCommaSeparatedList(1)).toEqual(['1']);
    expect(parseCommaSeparatedList({})).toEqual(['[object Object]']);
    expect(parseCommaSeparatedList(() => {})).toEqual(['()=>{}']);
    expect(parseCommaSeparatedList((a: any, b: any) => b)).toEqual(['(a', 'b)=>b']);
    expect(parseCommaSeparatedList(/foo/)).toEqual(['/foo/']);
    expect(parseCommaSeparatedList(null)).toEqual([]);
    expect(parseCommaSeparatedList(undefined)).toEqual([]);
    expect(parseCommaSeparatedList(false)).toEqual([]);
    expect(parseCommaSeparatedList(true)).toEqual(['true']);
  });

  test('returns argument untouched if it is an array', () => {
    const inputs = [[], [1], ['foo,bar']];
    for (const input of inputs) {
      const json = JSON.stringify(input);
      expect(parseCommaSeparatedList(input)).toBe(input);
      expect(json).toBe(JSON.stringify(input));
    }
  });

  test('trims whitespace around elements', () => {
    expect(parseCommaSeparatedList('1 ,    2,    3     ,    4')).toEqual(['1', '2', '3', '4']);
  });

  test('ignored empty elements between multiple commas', () => {
    expect(parseCommaSeparatedList('foo , , ,,,,, ,      ,bar')).toEqual(['foo', 'bar']);
  });
});
