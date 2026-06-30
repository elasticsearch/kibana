/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { text, line, softline, fill, join, layout } from '..';

describe('fill (wrapping layout)', () => {
  it('renders all items on one line when they fit', () => {
    const items = ['one', 'two', 'three'].map(text);
    const doc = fill(join(line, items));

    expect(layout(doc, { printWidth: 80 })).toBe('one two three');
  });

  it('wraps items across lines', () => {
    const items = ['aaa', 'bbb', 'ccc', 'ddd', 'eee'].map(text);
    const doc = fill(join(line, items));

    expect(layout(doc, { printWidth: 12 })).toBe('aaa bbb ccc\nddd eee');
  });

  it('wraps with softline (no spaces)', () => {
    const items = ['aaa', 'bbb', 'ccc', 'ddd'].map(text);
    const doc = fill(join(softline, items));

    expect(layout(doc, { printWidth: 10 })).toBe('aaabbbccc\nddd');
  });

  it('handles single item', () => {
    const doc = fill([text('hello')]);

    expect(layout(doc, { printWidth: 80 })).toBe('hello');
  });

  it('handles two items', () => {
    const doc = fill([text('hello'), line, text('world')]);

    expect(layout(doc, { printWidth: 80 })).toBe('hello world');
    expect(layout(doc, { printWidth: 5 })).toBe('hello\nworld');
  });

  it('handles empty parts', () => {
    const doc = fill([]);

    expect(layout(doc, { printWidth: 80 })).toBe('');
  });

  it('wraps words example', () => {
    const words = 'the quick brown fox jumps over the lazy dog'.split(' ').map(text);
    const doc = fill(join(line, words));

    expect(layout(doc, { printWidth: 20 })).toBe('the quick brown fox\njumps over the lazy\ndog');
  });

  it('fill with width 15', () => {
    const items = ['one', 'two', 'three', 'four', 'five'].map(text);
    const doc = fill(join(line, items));

    expect(layout(doc, { printWidth: 15 })).toBe('one two three\nfour five');
  });

  it('fill with width 10', () => {
    const items = ['one', 'two', 'three', 'four', 'five'].map(text);
    const doc = fill(join(line, items));

    expect(layout(doc, { printWidth: 10 })).toBe('one two\nthree four\nfive');
  });
});
