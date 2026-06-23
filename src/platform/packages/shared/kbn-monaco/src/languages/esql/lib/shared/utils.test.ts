/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { offsetRangeToMonacoRange } from './utils';

describe('offsetRangeToMonacoRange', () => {
  test('single line', () => {
    const expression = 'FROM kibana_sample_data_logs';
    const range = offsetRangeToMonacoRange(expression, { start: 5, end: 28 });
    expect(range).toEqual({ startColumn: 6, endColumn: 29, startLineNumber: 1, endLineNumber: 1 });
  });

  test('next line', () => {
    const expression = `FROM kibana_sample_data_logs
| KEEP foo`;
    const range = offsetRangeToMonacoRange(expression, { start: 36, end: 39 });
    expect(range).toEqual({ startColumn: 8, endColumn: 11, startLineNumber: 2, endLineNumber: 2 });
  });

  test('should convert offset range to monaco range for multiple lines query when the cursor is not at the end', () => {
    const expression = 'FROM test \n| WHERE test == t\n| LIMIT 1';
    const range = { start: 27, end: 28 };
    const monacoRange = offsetRangeToMonacoRange(expression, range);

    expect(monacoRange).toEqual({
      startColumn: 17,
      endColumn: 18,
      startLineNumber: 2,
      endLineNumber: 2,
    });
  });

  test('returns undefined if the start is past the end of the expression', () => {
    const expression = 'FROM test | WHERE test == 1 | LIMIT 1';
    const range = { start: 38, end: 38 };
    const monacoRange = offsetRangeToMonacoRange(expression, range);

    expect(monacoRange).toEqual(undefined);
  });

  test('cursor at end of expression returns an empty insert-only range', () => {
    const expression = 'FROM test | WHERE test == 1 | LIMIT 1';
    const range = { start: 37, end: 37 };
    const monacoRange = offsetRangeToMonacoRange(expression, range);

    expect(monacoRange).toEqual({
      startColumn: 38,
      endColumn: 38,
      startLineNumber: 1,
      endLineNumber: 1,
    });
  });

  test('empty range in the middle of an expression returns an insert-only position', () => {
    const expression = 'FROM test | WHERE test == | LIMIT 1';
    const range = { start: 26, end: 26 };
    const monacoRange = offsetRangeToMonacoRange(expression, range);

    expect(monacoRange).toEqual({
      startColumn: 27,
      endColumn: 27,
      startLineNumber: 1,
      endLineNumber: 1,
    });
  });
});
