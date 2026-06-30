/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { appendLimitToQuery } from './append_limit';

describe('appendLimitToQuery', () => {
  it('should append the limit clause to the query', () => {
    const queryString = 'FROM my_index';
    const updatedQueryString = appendLimitToQuery(queryString, 10);
    expect(updatedQueryString).toBe('FROM my_index | LIMIT 10');
  });

  it('should append the limit clause to the query with comments', () => {
    const queryString = 'FROM my_index | LIMIT 50 | STATS BY meow // new comment';
    const updatedQueryString = appendLimitToQuery(queryString, 10);
    expect(updatedQueryString).toBe('FROM my_index | LIMIT 50 | STATS BY meow | LIMIT 10');
  });

  it('should append the limit clause to the query with no commands', () => {
    const queryString = '';
    const updatedQueryString = appendLimitToQuery(queryString, 10);
    expect(updatedQueryString).toBe(' | LIMIT 10');
  });

  it('preserves parentheses used for order of operations', () => {
    const queryString =
      'FROM metrics | EVAL disk_used_pct = ROUND(100 * (1 - (available_in_bytes / (total_in_bytes * 1.0))), 2) | WHERE disk_used_pct > 80';
    const updatedQueryString = appendLimitToQuery(queryString, 1000);
    expect(updatedQueryString).toBe(
      `FROM metrics | EVAL disk_used_pct = ROUND(100 * (1 - (available_in_bytes / (total_in_bytes * 1.0))), 2) | WHERE disk_used_pct > 80 | LIMIT 1000`
    );
  });

  it('does not treat // inside the query as a comment', () => {
    const queryString = 'FROM my_index | WHERE url == "http://example.com"';
    const updatedQueryString = appendLimitToQuery(queryString, 1000);
    expect(updatedQueryString).toBe(
      'FROM my_index | WHERE url == "http://example.com" | LIMIT 1000'
    );
  });

  it('removes trailing block comments before appending the limit', () => {
    const queryString = 'FROM my_index | KEEP a /* trailing note */';
    const updatedQueryString = appendLimitToQuery(queryString, 1000);
    expect(updatedQueryString).toBe('FROM my_index | KEEP a | LIMIT 1000');
  });
});
