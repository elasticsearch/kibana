/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  filterDataErrors,
  filterOutWarningsOverlappingWithErrors,
  getToggleCommentLines,
  parseErrors,
  parseWarning,
  filterDuplicatedWarnings,
  shouldAutoTriggerSuggestions,
} from './helpers';
import type { MonacoMessage } from '@kbn/code-editor';

describe('helpers', function () {
  describe('parseErrors', function () {
    it('should return the correct error object from ESQL ES response for an one liner query', function () {
      const error = new Error(
        '[essql] > Unexpected error from Elasticsearch: verification_exception - Found 1 problem\nline 1:8: Unknown column [miaou]'
      );
      const errors = [error];
      expect(parseErrors(errors, 'SELECT miaou from test')).toEqual([
        {
          endColumn: 14,
          endLineNumber: 1,
          message: ' Unknown column [miaou]',
          severity: 8,
          startColumn: 8,
          startLineNumber: 1,
          code: 'errorFromES',
        },
      ]);
    });

    it('should return the correct error object from ESQL ES response for an multi liner query', function () {
      const error = new Error(
        '[essql] > Unexpected error from Elasticsearch: verification_exception - Found 1 problem line 3:7: Condition expression needs to be boolean, found [TEXT]'
      );
      const errors = [error];
      expect(
        parseErrors(
          errors,
          `SELECT * 
      FROM "kibana_sample_data_ecommerce" 
      WHERE category`
        )
      ).toEqual([
        {
          endColumn: 12,
          endLineNumber: 3,
          message: ' Condition expression needs to be boolean, found [TEXT]',
          severity: 8,
          startColumn: 7,
          startLineNumber: 3,
          code: 'errorFromES',
        },
      ]);
    });

    it('should return the generic error object for an error of unknown format', function () {
      const error = new Error('I am an unknown error');
      const errors = [error];
      expect(parseErrors(errors, `FROM "kibana_sample_data_ecommerce"`)).toEqual([
        {
          endColumn: 10,
          endLineNumber: 1,
          message: 'I am an unknown error',
          severity: 8,
          startColumn: 1,
          startLineNumber: 1,
          code: 'unknownError',
        },
      ]);
    });

    it('should return one marker per problem when ES reports multiple problems with colon-containing index names', function () {
      const error = new Error(
        '[esql] > Unexpected error from Elasticsearch: verification_exception - Found 2 problems\nline 3:19: Cannot use field [fields.varnish_cache_hit_rate] due to ambiguities being mapped as [2] incompatible types: [float] in [smops_tv_bmbg10:tv-poc_metrics_cdn-2026.04.03-000716] and [102] other indices, [long] in [smops_tv_bmbg10:tv-poc_metrics_cdn-2026.04.04-000720] and [25] other indices\nline 3:64: Cannot use field [fields.varnish_cache_miss_rate] due to ambiguities being mapped as [2] incompatible types: [float] in [smops_tv_bmbg10:tv-poc_metrics_cdn-2026.04.03-000716] and [106] other indices, [long] in [smops_tv_bmbg10:tv-poc_metrics_cdn-2026.04.06-000730] and [21] other indices'
      );
      expect(parseErrors([error], 'FROM smops_tv_bmbg10:tv-poc_metrics_cdn-*')).toEqual([
        {
          message:
            ' Cannot use field [fields.varnish_cache_hit_rate] due to ambiguities being mapped as [2] incompatible types: [float] in [smops_tv_bmbg10:tv-poc_metrics_cdn-2026.04.03-000716] and [102] other indices, [long] in [smops_tv_bmbg10:tv-poc_metrics_cdn-2026.04.04-000720] and [25] other indices',
          startColumn: 19,
          startLineNumber: 3,
          endColumn: 19 + 'fields.varnish_cache_hit_rate'.length + 1,
          endLineNumber: 3,
          severity: 8,
          code: 'errorFromES',
        },
        {
          message:
            ' Cannot use field [fields.varnish_cache_miss_rate] due to ambiguities being mapped as [2] incompatible types: [float] in [smops_tv_bmbg10:tv-poc_metrics_cdn-2026.04.03-000716] and [106] other indices, [long] in [smops_tv_bmbg10:tv-poc_metrics_cdn-2026.04.06-000730] and [21] other indices',
          startColumn: 64,
          startLineNumber: 3,
          endColumn: 64 + 'fields.varnish_cache_miss_rate'.length + 1,
          endLineNumber: 3,
          severity: 8,
          code: 'errorFromES',
        },
      ]);
    });

    it('should return the generic error object for an error with unexpected format', function () {
      const error = new Error(
        '[esql] > Unexpected error from Elasticsearch: verification_exception - Found ambiguous reference to [user_id]; matches any of [line 3:15 [user_id], line 4:15 [user_id]]'
      );
      const errors = [error];
      expect(parseErrors(errors, `FROM "kibana_sample_data_ecommerce"`)).toEqual([
        {
          endColumn: 10,
          endLineNumber: 1,
          message: error.message,
          severity: 8,
          startColumn: 1,
          startLineNumber: 1,
          code: 'unknownError',
        },
      ]);
    });

    it('should return a string message when error.message is a non-string (e.g. DOMException from aborted fetch)', function () {
      const domException = new DOMException('signal is aborted without reason', 'AbortError');
      const error = new Error('placeholder');
      (error as unknown as { message: unknown }).message = domException;

      const result = parseErrors([error], 'FROM logs-*');

      expect(result).toHaveLength(1);
      expect(typeof result[0].message).toBe('string');
      expect(result[0].code).toBe('unknownError');
    });
  });

  describe('parseWarning', function () {
    it('should return the correct warning object from ESQL ES response for an one liner query', function () {
      const warning =
        '299 Elasticsearch-8.10.0-SNAPSHOT-adb9fce96079b421c2575f0d2d445f492eb5f075 "Line 1:52: evaluation of [date_parse(geo.dest)] failed, treating result as null. Only first 20 failures recorded."';
      expect(parseWarning(warning)).toEqual([
        {
          endColumn: 71,
          endLineNumber: 1,
          message:
            'evaluation of [date_parse(geo.dest)] failed, treating result as null. Only first 20 failures recorded.',
          severity: 4,
          startColumn: 52,
          startLineNumber: 1,
          code: 'warningFromES',
        },
      ]);
    });

    it('should return the correct array of warnings if multiple warnings are detected', function () {
      const warning =
        '299 Elasticsearch-8.10.0-SNAPSHOT-adb9fce96079b421c2575f0d2d445f492eb5f075 "Line 1:52: evaluation of [date_parse(geo.dest)] failed, treating result as null. Only first 20 failures recorded.", 299 Elasticsearch-8.10.0-SNAPSHOT-adb9fce96079b421c2575f0d2d445f492eb5f075 "Line 1:84: evaluation of [date_parse(geo.src)] failed, treating result as null. Only first 20 failures recorded."';
      expect(parseWarning(warning)).toEqual([
        {
          endColumn: 71,
          endLineNumber: 1,
          message:
            'evaluation of [date_parse(geo.dest)] failed, treating result as null. Only first 20 failures recorded.',
          severity: 4,
          startColumn: 52,
          startLineNumber: 1,
          code: 'warningFromES',
        },
        {
          endColumn: 102,
          endLineNumber: 1,
          message:
            'evaluation of [date_parse(geo.src)] failed, treating result as null. Only first 20 failures recorded.',
          severity: 4,
          startColumn: 84,
          startLineNumber: 1,
          code: 'warningFromES',
        },
      ]);
    });

    it('should return the correct array of warnings if the message contains additional info', function () {
      const warning =
        '299 Elasticsearch-8.10.0-SNAPSHOT-adb9fce96079b421c2575f0d2d445f492eb5f075 "Line 1:52: evaluation of [date_parse(geo.dest)] failed, treating result as null. Only first 20 failures recorded.", 299 Elasticsearch-8.10.0-SNAPSHOT-adb9fce96079b421c2575f0d2d445f492eb5f075 "Line 1:84: java.lang.IllegalArgumentException: evaluation of [date_parse(geo.src)] failed, treating result as null. Only first 20 failures recorded."';
      expect(parseWarning(warning)).toEqual([
        {
          endColumn: 71,
          endLineNumber: 1,
          message:
            'evaluation of [date_parse(geo.dest)] failed, treating result as null. Only first 20 failures recorded.',
          severity: 4,
          startColumn: 52,
          startLineNumber: 1,
          code: 'warningFromES',
        },
        {
          endColumn: 102,
          endLineNumber: 1,
          message:
            'evaluation of [date_parse(geo.src)] failed, treating result as null. Only first 20 failures recorded.',
          severity: 4,
          startColumn: 84,
          startLineNumber: 1,
          code: 'warningFromES',
        },
      ]);
    });

    it('should return the correct array of warnings if multiple warnins are detected without line indicators', function () {
      const warning =
        '299 Elasticsearch-8.10.0-SNAPSHOT-adb9fce96079b421c2575f0d2d445f492eb5f075 "Field [geo.coordinates] cannot be retrieved, it is unsupported or not indexed; returning null.", 299 Elasticsearch-8.10.0-SNAPSHOT-adb9fce96079b421c2575f0d2d445f492eb5f075 "Field [ip_range] cannot be retrieved, it is unsupported or not indexed; returning null.", 299 Elasticsearch-8.10.0-SNAPSHOT-adb9fce96079b421c2575f0d2d445f492eb5f075 "Field [timestamp_range] cannot be retrieved, it is unsupported or not indexed; returning null."';
      expect(parseWarning(warning)).toEqual([
        {
          endColumn: 10,
          endLineNumber: 1,
          message:
            'Field [geo.coordinates] cannot be retrieved, it is unsupported or not indexed; returning null.',
          severity: 4,
          startColumn: 1,
          startLineNumber: 1,
          code: 'warningFromES',
        },
        {
          endColumn: 10,
          endLineNumber: 1,
          message:
            'Field [ip_range] cannot be retrieved, it is unsupported or not indexed; returning null.',
          severity: 4,
          startColumn: 1,
          startLineNumber: 1,
          code: 'warningFromES',
        },
        {
          endColumn: 10,
          endLineNumber: 1,
          message:
            'Field [timestamp_range] cannot be retrieved, it is unsupported or not indexed; returning null.',
          severity: 4,
          startColumn: 1,
          startLineNumber: 1,
          code: 'warningFromES',
        },
      ]);
    });
    it('should return the correct array of warnings if multiple warnins of different types', function () {
      const warning =
        '299 Elasticsearch-8.10.0-SNAPSHOT-adb9fce96079b421c2575f0d2d445f492eb5f075 "Field [geo.coordinates] cannot be retrieved, it is unsupported or not indexed; returning null.", 299 Elasticsearch-8.10.0-SNAPSHOT-adb9fce96079b421c2575f0d2d445f492eb5f075 "Field [ip_range] cannot be retrieved, it is unsupported or not indexed; returning null.", 299 Elasticsearch-8.10.0-SNAPSHOT-adb9fce96079b421c2575f0d2d445f492eb5f075 "Line 1:52: evaluation of [date_parse(geo.dest)] failed, treating result as null. Only first 20 failures recorded."';
      expect(parseWarning(warning)).toEqual([
        {
          endColumn: 10,
          endLineNumber: 1,
          message:
            'Field [geo.coordinates] cannot be retrieved, it is unsupported or not indexed; returning null.',
          severity: 4,
          startColumn: 1,
          startLineNumber: 1,
          code: 'warningFromES',
        },
        {
          endColumn: 10,
          endLineNumber: 1,
          message:
            'Field [ip_range] cannot be retrieved, it is unsupported or not indexed; returning null.',
          severity: 4,
          startColumn: 1,
          startLineNumber: 1,
          code: 'warningFromES',
        },
        {
          endColumn: 71,
          endLineNumber: 1,
          message:
            'evaluation of [date_parse(geo.dest)] failed, treating result as null. Only first 20 failures recorded.',
          severity: 4,
          startColumn: 52,
          startLineNumber: 1,
          code: 'warningFromES',
        },
      ]);
    });

    it('should preserve the full message when it contains extra colons after the exception class', function () {
      const warning =
        '299 Elasticsearch-9.1.0 "Line 1:10: java.lang.IllegalArgumentException: reason: detail with colon"';
      expect(parseWarning(warning)).toEqual([
        {
          endColumn: 19,
          endLineNumber: 1,
          message: 'reason: detail with colon',
          severity: 4,
          startColumn: 10,
          startLineNumber: 1,
          code: 'warningFromES',
        },
      ]);
    });

    it('should return the correct array of warningsif the quotes are escaped (at that case we dont have a new warning)', function () {
      const warning = `299 Elasticsearch-9.1.0 "No limit defined, adding default limit of [1000]", "Line 1:9: evaluation of [TO_LOWER([\\"FOO\\", \\"BAR\\"])] failed", "Line 1:9: java.lang.IllegalArgumentException: single-value function encountered multi-value"`;
      expect(parseWarning(warning)).toEqual([
        {
          endColumn: 10,
          endLineNumber: 1,
          message: 'No limit defined, adding default limit of [1000]',
          severity: 4,
          startColumn: 1,
          startLineNumber: 1,
          code: 'warningFromES',
        },
        {
          endColumn: 30,
          endLineNumber: 1,
          message: 'evaluation of [TO_LOWER(["FOO", "BAR"])] failed',
          severity: 4,
          startColumn: 9,
          startLineNumber: 1,
          code: 'warningFromES',
        },
        {
          endColumn: 18,
          endLineNumber: 1,
          message: 'single-value function encountered multi-value',
          severity: 4,
          startColumn: 9,
          startLineNumber: 1,
          code: 'warningFromES',
        },
      ]);
    });
  });

  describe('filterDataErrors', function () {
    it('should return an empty array if no errors are provided', function () {
      expect(filterDataErrors([])).toEqual([]);
    });

    it('should filter properly filter data errors', function () {
      const errors = [
        { code: 'unknownIndex' },
        { code: 'unknownColumn' },
        { code: 'other' },
      ] as MonacoMessage[];

      expect(filterDataErrors(errors)).toEqual([{ code: 'other' }]);
    });
  });

  describe('filterOutWarningsOverlappingWithErrors', function () {
    const createMessage = (
      type: 'error' | 'warning',
      [startLine, startCol, endLine, endCol]: readonly [number, number, number, number]
    ): MonacoMessage => ({
      message: type === 'error' ? 'Error' : 'Warning',
      severity: 1,
      code: type,
      startLineNumber: startLine,
      startColumn: startCol,
      endLineNumber: endLine,
      endColumn: endCol,
    });

    it.each([
      ['filter out warning with exactly matching ranges', [1, 5, 1, 10], [1, 5, 1, 10], true],
      ['filter out warning inside error', [1, 1, 1, 20], [1, 5, 1, 10], true],
      ['filter out warning ending inside error', [1, 5, 1, 15], [1, 1, 1, 6], true],
      ['filter out warning starting inside error', [1, 5, 1, 15], [1, 14, 1, 20], true],
      ['filter out warning containing error', [1, 5, 1, 10], [1, 1, 1, 15], true],
      ['NOT filter out warning with different lines', [1, 5, 1, 10], [2, 5, 2, 10], false],
      ['NOT filter out warning before error', [1, 10, 1, 20], [1, 1, 1, 5], false],
      ['NOT filter out warning after error', [1, 10, 1, 20], [1, 25, 1, 30], false],
    ] as const)(`should %s`, (description, errorRange, warningRange, shouldFilter) => {
      const errors = [createMessage('error', errorRange)];
      const warnings = [createMessage('warning', warningRange)];

      const result = filterOutWarningsOverlappingWithErrors(errors, warnings);
      expect(result).toHaveLength(shouldFilter ? 0 : 1);
    });
  });

  describe('filterDuplicatedUnmappedColumnWarnings', function () {
    const createMessage = (code: string, message: string): MonacoMessage & { code: string } => ({
      message,
      code,
      severity: 1,
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
    });

    it('should filter duplicated warning messages', function () {
      const warnings = [
        createMessage('unmappedColumnWarning', 'Field a is unmapped'),
        createMessage('unmappedColumnWarning', 'Field a is unmapped'),
        createMessage('unmappedColumnWarning', 'Field b is unmapped'),
      ];
      expect(filterDuplicatedWarnings(warnings)).toEqual([
        createMessage('unmappedColumnWarning', 'Field a is unmapped'),
        createMessage('unmappedColumnWarning', 'Field b is unmapped'),
      ]);
    });
  });

  describe('getToggleCommentLines', function () {
    it('should comment all lines when none are commented', function () {
      const lines = ['FROM logs-*', '| WHERE host.name == "server1"', '| LIMIT 10'];
      expect(getToggleCommentLines(lines)).toEqual([
        '//FROM logs-*',
        '//| WHERE host.name == "server1"',
        '//| LIMIT 10',
      ]);
    });

    it('should uncomment all lines when all are commented', function () {
      const lines = ['//FROM logs-*', '//| WHERE host.name == "server1"', '//| LIMIT 10'];
      expect(getToggleCommentLines(lines)).toEqual([
        'FROM logs-*',
        '| WHERE host.name == "server1"',
        '| LIMIT 10',
      ]);
    });

    it('should comment all lines when selection has a mix of commented and uncommented', function () {
      const lines = ['//| WHERE host.name == "server1"', '| LIMIT 10'];
      expect(getToggleCommentLines(lines)).toEqual([
        '//| WHERE host.name == "server1"',
        '//| LIMIT 10',
      ]);
    });

    it('should comment the single uncommented line', function () {
      expect(getToggleCommentLines(['| LIMIT 10'])).toEqual(['//| LIMIT 10']);
    });

    it('should uncomment the single commented line', function () {
      expect(getToggleCommentLines(['//| LIMIT 10'])).toEqual(['| LIMIT 10']);
    });
  });

  describe('shouldAutoTriggerSuggestions', function () {
    it.each([
      ['space', 'FROM ', true],
      ['inline cast ::', 'field::', true],
      ['dot', 'index.', true],
      ['word character', 'FRO', true],
      ['backtick', 'FROM `', true],
      ['empty string', '', false],
      ['comma', 'field1,', false],
    ])('should return %s for %s', (_label, input, expected) => {
      expect(shouldAutoTriggerSuggestions(input as string)).toBe(expected);
    });
  });
});
