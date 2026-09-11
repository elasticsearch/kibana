/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { applyLimit } from './apply_limit';

describe('applyLimit', () => {
  it('appends LIMIT when the query has none', () => {
    expect(applyLimit('FROM ai-index-idx-a | WHERE x > 1', 10)).toBe(
      'FROM ai-index-idx-a | WHERE x > 1 | LIMIT 10'
    );
  });

  it('narrows a larger trailing LIMIT', () => {
    expect(applyLimit('FROM ai-index-idx-a | LIMIT 5000', 100)).toBe(
      'FROM ai-index-idx-a | LIMIT 100'
    );
  });

  it('keeps a smaller trailing LIMIT', () => {
    expect(applyLimit('FROM ai-index-idx-a | LIMIT 5', 100)).toBe('FROM ai-index-idx-a | LIMIT 5');
  });

  it('leaves a non-trailing LIMIT alone and appends', () => {
    expect(applyLimit('FROM ai-index-idx-a | LIMIT 5000 | SORT x', 100)).toBe(
      'FROM ai-index-idx-a | LIMIT 5000 | SORT x | LIMIT 100'
    );
  });

  it('appends after a parameterised trailing LIMIT', () => {
    expect(applyLimit('FROM ai-index-idx-a | LIMIT ?max', 100)).toBe(
      'FROM ai-index-idx-a | LIMIT ?max | LIMIT 100'
    );
  });

  it('appends a raw LIMIT to a query the parser rejects', () => {
    expect(applyLimit('FROM ai-index-idx-a | NOT_A_COMMAND foo  ', 100)).toBe(
      'FROM ai-index-idx-a | NOT_A_COMMAND foo\n| LIMIT 100'
    );
  });
});
