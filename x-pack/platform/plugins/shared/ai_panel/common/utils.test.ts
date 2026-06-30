/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { normalizeColumnName, columnNamesToKeys } from './utils';

describe('normalizeColumnName', () => {
  it('passes plain alphanumeric names through unchanged', () => {
    expect(normalizeColumnName('revenue')).toBe('revenue');
    expect(normalizeColumnName('totalRevenue')).toBe('totalRevenue');
  });

  it('replaces dots with underscores', () => {
    expect(normalizeColumnName('category.keyword')).toBe('category_keyword');
    expect(normalizeColumnName('event.action.type')).toBe('event_action_type');
  });

  it('converts leading @ to at_ so the name stays meaningful', () => {
    expect(normalizeColumnName('@timestamp')).toBe('at_timestamp');
  });

  it('replaces hyphens and spaces', () => {
    expect(normalizeColumnName('my-field')).toBe('my_field');
    expect(normalizeColumnName('my field')).toBe('my_field');
  });

  it('collapses consecutive special characters into a single underscore', () => {
    expect(normalizeColumnName('a..b')).toBe('a_b');
    expect(normalizeColumnName('a-.-b')).toBe('a_b');
  });

  it('preserves word boundary when @ appears mid-name', () => {
    expect(normalizeColumnName('field@suffix')).toBe('field_at_suffix');
  });

  it('preserves mixed alphanumeric with underscores', () => {
    expect(normalizeColumnName('order_date')).toBe('order_date');
    expect(normalizeColumnName('total_taxful_price')).toBe('total_taxful_price');
  });
});

describe('columnNamesToKeys', () => {
  it('normalizes each column name', () => {
    expect(columnNamesToKeys(['category.keyword', '@timestamp'])).toEqual([
      'category_keyword',
      'at_timestamp',
    ]);
  });

  it('produces distinct keys for @timestamp and timestamp — no collision', () => {
    expect(columnNamesToKeys(['@timestamp', 'timestamp'])).toEqual(['at_timestamp', 'timestamp']);
  });

  it('handles a plain list with no special characters', () => {
    expect(columnNamesToKeys(['revenue', 'category.keyword', 'count'])).toEqual([
      'revenue',
      'category_keyword',
      'count',
    ]);
  });
});
