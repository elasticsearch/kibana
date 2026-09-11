/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parseLabels } from './parse_labels';

describe('parseLabels', () => {
  it('reads one label and score per line', () => {
    expect(parseLabels('pass=1\nfail=0')).toEqual([
      { value: 'pass', score: 1 },
      { value: 'fail', score: 0 },
    ]);
  });

  it('accepts fractional scores and surrounding whitespace', () => {
    expect(parseLabels('  polite = 0.5  \n\n  rude=0 ')).toEqual([
      { value: 'polite', score: 0.5 },
      { value: 'rude', score: 0 },
    ]);
  });

  it('reads the score after the last equals sign, so a label can contain one', () => {
    expect(parseLabels('a=b=0.5')).toEqual([{ value: 'a=b', score: 0.5 }]);
  });

  it.each([
    ['no lines at all', ''],
    ['only whitespace', '   \n  '],
    // `Number('')` is 0, so these would silently score 0 without an explicit guard.
    ['a label with no score', 'good='],
    ['a label whose score is only whitespace', 'good=   '],
    ['a score that is not a number', 'good=abc'],
    ['a score above one', 'good=2'],
    ['a negative score', 'good=-1'],
    ['no label before the separator', '=1'],
    ['no separator at all', 'good 1'],
  ])('rejects %s', (_label, value) => {
    expect(parseLabels(value)).toBeUndefined();
  });

  it('rejects the whole input when any single line is malformed', () => {
    expect(parseLabels('pass=1\nbroken\nfail=0')).toBeUndefined();
  });
});
