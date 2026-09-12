/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { hasControlCharacters, trimInputValues } from '.';

describe('hasControlCharacters', () => {
  it.each([
    ['tab', 'value\twith-tab'],
    ['line feed', 'value\nwith-line-feed'],
    ['carriage return', 'value\rwith-carriage-return'],
    ['NUL', 'value\u0000with-nul'],
    ['DEL', 'value\u007Fwith-del'],
    ['C1', 'value\u0085with-c1'],
  ])('detects an interior %s', (_, value) => {
    expect(hasControlCharacters(value)).toBe(true);
  });

  it('ignores edge whitespace but still detects a remaining control character', () => {
    expect(hasControlCharacters(' value\u0000 ')).toBe(true);
  });

  it('inspects every array member', () => {
    expect(hasControlCharacters([' whitespace ', 'ctl\u0000'])).toBe(true);
    expect(hasControlCharacters(['clean', 'also clean', 'bad\u007Fvalue'])).toBe(true);
  });

  it.each([
    ['empty value', ''],
    ['absent value', undefined],
    ['empty array', []],
    ['Windows path', 'C:\\Program Files\\Elastic\\endpoint.exe'],
    ['Unix path', '/opt/Elastic Endpoint/endpoint'],
    ['hash', 'a'.repeat(64)],
    ['ordinary interior spaces', 'Elastic Endpoint'],
    ['leading and trailing space', ' value '],
    ['edge tab', '\tvalue\t'],
    ['edge line feed', '\nvalue\n'],
    ['edge non-breaking space', '\u00A0value\u00A0'],
    ['edge byte order mark', '\uFEFFvalue\uFEFF'],
    ['array of edge-whitespace members', ['clean', ' trailing ']],
  ])('returns false for a clean %s', (_, value) => {
    expect(hasControlCharacters(value)).toBe(false);
  });
});

describe('trimInputValues', () => {
  it('trims a string', () => {
    expect(trimInputValues('  /opt/app  ')).toBe('/opt/app');
  });

  it('trims array members and drops empties', () => {
    expect(trimInputValues(['  one  ', '\ttwo', '   ', 'three'])).toEqual(['one', 'two', 'three']);
  });
});
