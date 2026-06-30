/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { text, line, softline, hardline, group, indent, join, fill, layout } from '..';

describe('layout scenarios', () => {
  it('formats a simple function call that fits on one line', () => {
    const doc = group([
      text('main('),
      indent([softline, text('"hello world"')]),
      softline,
      text(')'),
    ]);

    expect(layout(doc, { printWidth: 40 })).toBe(`main("hello world")`);

    const doc2 = group([
      text('main('),
      indent([softline, text('"hello world"')]),
      softline,
      text(')'),
    ]);

    expect(layout(doc2, { printWidth: 10 })).toBe(`main(\n  "hello world"\n)`);
  });

  it('breaks a function body across lines when it exceeds printWidth', () => {
    const body = [text('console.log("hello");'), hardline, text('return 0;')];
    const doc = group([
      text('function main() {'),
      indent([hardline, ...body]),
      hardline,
      text('}'),
    ]);

    expect('\n' + layout(doc, { printWidth: 80 })).toBe(`
function main() {
  console.log("hello");
  return 0;
}`);
  });

  it('wraps a long argument list with indent when it does not fit', () => {
    const args = [text('alpha'), text('beta'), text('gamma'), text('delta'), text('epsilon')];

    const doc = group([
      text('render('),
      indent([softline, join([text(','), line], args)]),
      softline,
      text(')'),
    ]);

    expect(layout(doc, { printWidth: 30 })).toBe(
      ['render(', '  alpha,', '  beta,', '  gamma,', '  delta,', '  epsilon', ')'].join('\n')
    );
  });

  it('fill wraps words to fill each line', () => {
    const words = ['The', 'quick', 'brown', 'fox', 'jumps', 'over', 'the', 'lazy', 'dog'];
    const parts = join(
      line,
      words.map((w) => text(w))
    );

    const doc = fill(parts);

    expect(layout(doc, { printWidth: 20 })).toBe(`The quick brown fox\njumps over the lazy\ndog`);
  });
});
