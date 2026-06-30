/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { text, hardline, group, lineSuffix, lineSuffixBoundary, layout } from '..';

describe('lineSuffix', () => {
  it('places comment at end of line', () => {
    const doc = [text('x'), lineSuffix(text(' # comment')), text(';'), hardline, text('y')];

    expect(layout(doc, { printWidth: 80 })).toBe('x; # comment\ny');
  });

  it('buffers multiple suffixes', () => {
    const doc = [
      text('a'),
      lineSuffix(text(' // c1')),
      text('b'),
      lineSuffix(text(' // c2')),
      hardline,
      text('next'),
    ];

    expect(layout(doc, { printWidth: 80 })).toBe('ab // c1 // c2\nnext');
  });

  it('flushes suffix at end of document', () => {
    const doc = [text('code'), lineSuffix(text(' // trailing'))];

    expect(layout(doc, { printWidth: 80 })).toBe('code // trailing');
  });

  it('suffix ordering with trailing punctuation', () => {
    const doc = [text('field'), lineSuffix(text(' // comment')), text(','), hardline, text('next')];

    expect(layout(doc, { printWidth: 80 })).toBe('field, // comment\nnext');
  });
});

describe('lineSuffixBoundary', () => {
  it('flushes pending suffix before boundary', () => {
    const doc = group([text('{'), lineSuffix(text(' # c')), lineSuffixBoundary, text('}')]);

    expect(layout(doc, { printWidth: 80 })).toBe('{ # c\n}');
  });

  it('does nothing when no suffix is pending', () => {
    const doc = [text('a'), lineSuffixBoundary, text('b')];

    expect(layout(doc, { printWidth: 80 })).toBe('ab');
  });
});

describe('inline block comments (text-based)', () => {
  it('left and right inline comments are plain text', () => {
    const doc = [text('/* left */'), text(' '), text('node'), text(' '), text('/* right */')];

    expect(layout(doc, { printWidth: 80 })).toBe('/* left */ node /* right */');
  });
});

describe('own-line comments', () => {
  it('top comment above node', () => {
    const doc = [text('// top comment'), hardline, text('node')];

    expect(layout(doc, { printWidth: 80 })).toBe('// top comment\nnode');
  });

  it('bottom comment below node', () => {
    const doc = [text('node'), hardline, text('// bottom comment')];

    expect(layout(doc, { printWidth: 80 })).toBe('node\n// bottom comment');
  });

  it('full 5-slot comment model', () => {
    const nodeDoc = group([text('('), text('value'), text(')')]);

    const doc = [
      text('// top comment'),
      hardline,
      text('/* left */ '),
      nodeDoc,
      text(' /* right */'),
      lineSuffix(text(' // trailing')),
      hardline,
      text('// bottom comment'),
    ];

    expect(layout(doc, { printWidth: 80 })).toBe(
      '// top comment\n/* left */ (value) /* right */ // trailing\n// bottom comment'
    );
  });
});
