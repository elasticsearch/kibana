/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Setup } from './helpers';

export const runCommandsValidationSuite = (setup: Setup) => {
  const testErrorsAndWarnings = (
    statement: string,
    expectedErrors: string[] = [],
    expectedWarnings: string[] = []
  ) => {
    it(`${statement} => ${expectedErrors.length} errors, ${expectedWarnings.length} warnings`, async () => {
      const { validate } = await setup();
      const { errors, warnings } = await validate(statement);
      expect(errors.map((error) => ('message' in error ? error.message : error.text))).toEqual(
        expectedErrors
      );
      expect(warnings.map((warning) => warning.text)).toEqual(expectedWarnings);
    });
  };

  describe('row', () => {
    testErrorsAndWarnings('row', [expect.stringContaining('SyntaxError:')]);

    test('syntax error', async () => {
      const { expectErrors } = await setup();

      await expectErrors('row var = 1 in ', [expect.stringContaining('SyntaxError:')]);
      await expectErrors('row var = 1 in (', [expect.stringContaining('SyntaxError:')]);
      await expectErrors('row var = 1 not in ', [expect.stringContaining('SyntaxError:')]);
    });
  });

  describe('limit', () => {
    testErrorsAndWarnings('from index | limit ', [
      `SyntaxError: mismatched input '<EOF>' expecting {QUOTED_STRING, INTEGER_LITERAL, DECIMAL_LITERAL, 'false', 'null', '?', 'true', '+', '-', NAMED_OR_POSITIONAL_PARAM, '['}`,
    ]);
    testErrorsAndWarnings('from index | limit 4 ', []);
    testErrorsAndWarnings('from index | limit a', [
      "SyntaxError: mismatched input 'a' expecting {QUOTED_STRING, INTEGER_LITERAL, DECIMAL_LITERAL, 'false', 'null', '?', 'true', '+', '-', NAMED_OR_POSITIONAL_PARAM, '['}",
    ]);
    testErrorsAndWarnings('from index | limit doubleField', [
      "SyntaxError: mismatched input 'doubleField' expecting {QUOTED_STRING, INTEGER_LITERAL, DECIMAL_LITERAL, 'false', 'null', '?', 'true', '+', '-', NAMED_OR_POSITIONAL_PARAM, '['}",
    ]);
    testErrorsAndWarnings('from index | limit textField', [
      "SyntaxError: mismatched input 'textField' expecting {QUOTED_STRING, INTEGER_LITERAL, DECIMAL_LITERAL, 'false', 'null', '?', 'true', '+', '-', NAMED_OR_POSITIONAL_PARAM, '['}",
    ]);
    testErrorsAndWarnings('from index | limit 4', []);
  });

  describe('join', () => {
    testErrorsAndWarnings('ROW a=1::LONG | LOOKUP JOIN t ON a', [
      '"t" is not a valid JOIN index. Please use a "lookup" mode index.',
    ]);

    testErrorsAndWarnings(
      'FROM a_index | LEFT JOIN lookup_index ON textField == keywordField, booleanField',
      ['JOIN ON clause must be a comma separated list of fields or a single expression']
    );
  });

  describe('drop', () => {
    testErrorsAndWarnings('from index | drop ', [
      expect.stringContaining('SyntaxError: mismatched input'),
    ]);
    testErrorsAndWarnings('from index | drop 4.5', [
      expect.stringContaining('SyntaxError:'),
      expect.stringContaining('SyntaxError:'),
      expect.stringContaining('SyntaxError:'),
      'Unknown column "."',
    ]);
    testErrorsAndWarnings('from index | drop missingField, doubleField, dateField', [
      'Unknown column "missingField"',
    ]);
  });

  describe('mv_expand', () => {
    testErrorsAndWarnings('from a_index | mv_expand ', [expect.stringContaining('SyntaxError:')]);

    testErrorsAndWarnings('from a_index | mv_expand doubleField, b', [
      expect.stringContaining('SyntaxError:'),
      expect.stringContaining('SyntaxError:'),
    ]);
  });

  describe('rename', () => {
    testErrorsAndWarnings('from a_index | rename', [expect.stringContaining('SyntaxError:')]);
    testErrorsAndWarnings('from a_index | rename textField', [
      "SyntaxError: no viable alternative at input 'textField'",
    ]);
    testErrorsAndWarnings('from a_index | rename a', [
      "SyntaxError: no viable alternative at input 'a'",
    ]);
    testErrorsAndWarnings('from a_index | rename textField as', [
      expect.stringContaining('SyntaxError:'),
      'AS expected 2 arguments, but got 1.',
    ]);
    testErrorsAndWarnings('row a = 10 | rename a as this is fine', [
      "SyntaxError: mismatched input 'is' expecting <EOF>",
    ]);
  });

  describe('dissect', () => {
    testErrorsAndWarnings('from a_index | dissect', [expect.stringContaining('SyntaxError:')]);
    testErrorsAndWarnings('from a_index | dissect textField', [
      "SyntaxError: missing QUOTED_STRING at '<EOF>'",
    ]);
    testErrorsAndWarnings('from a_index | dissect textField 2', [
      "SyntaxError: mismatched input '2' expecting QUOTED_STRING",
    ]);
    testErrorsAndWarnings('from a_index | dissect textField .', [
      "SyntaxError: mismatched input '<EOF>' expecting {'?', '??', NAMED_OR_POSITIONAL_PARAM, NAMED_OR_POSITIONAL_DOUBLE_PARAMS, UNQUOTED_IDENTIFIER, QUOTED_IDENTIFIER}",
    ]);
    testErrorsAndWarnings('from a_index | dissect textField %a', [
      "SyntaxError: mismatched input '%' expecting QUOTED_STRING",
      "SyntaxError: mismatched input '<EOF>' expecting '='",
    ]);
  });

  describe('grok', () => {
    testErrorsAndWarnings('from a_index | grok', [expect.stringContaining('SyntaxError:')]);
    testErrorsAndWarnings('from a_index | grok textField', [
      expect.stringContaining('SyntaxError:'),
    ]);
    testErrorsAndWarnings('from a_index | grok textField 2', [
      expect.stringContaining('SyntaxError:'),
    ]);
    testErrorsAndWarnings('from a_index | grok textField .', [
      expect.stringContaining('SyntaxError:'),
    ]);
    testErrorsAndWarnings('from a_index | grok textField %a', [
      expect.stringContaining('SyntaxError:'),
    ]);
  });

  describe('where', () => {
    for (const wrongOp of ['*', '/', '%']) {
      testErrorsAndWarnings(`from a_index | where ${wrongOp}+ doubleField`, [
        expect.stringContaining('SyntaxError:'),
      ]);
    }

    testErrorsAndWarnings('from a_index | where (unknownColumn > 0)', [
      'Unknown column "unknownColumn"',
    ]);
    testErrorsAndWarnings('from a_index | where ROUND((unknownColumn)) > 0', [
      'Unknown column "unknownColumn"',
    ]);
  });

  describe('eval', () => {
    testErrorsAndWarnings('from a_index | eval ', [expect.stringContaining('SyntaxError:')]);
    testErrorsAndWarnings('from a_index | eval doubleField + ', [
      expect.stringContaining('SyntaxError:'),
    ]);

    testErrorsAndWarnings('from a_index | eval a=round(', [
      expect.stringContaining('SyntaxError:'),
    ]);
    testErrorsAndWarnings('from a_index | eval a=round(doubleField) ', []);
    testErrorsAndWarnings('from a_index | eval a=round(doubleField), ', [
      expect.stringContaining('SyntaxError:'),
    ]);

    for (const wrongOp of ['*', '/', '%']) {
      testErrorsAndWarnings(`from a_index | eval ${wrongOp}+ doubleField`, [
        expect.stringContaining('SyntaxError:'),
      ]);
    }
  });

  describe('sort', () => {
    testErrorsAndWarnings('from a_index | sort ', [expect.stringContaining('SyntaxError:')]);
    testErrorsAndWarnings('from a_index | sort doubleField, ', [
      expect.stringContaining('SyntaxError:'),
    ]);

    for (const dir of ['desc', 'asc']) {
      testErrorsAndWarnings(`from a_index | sort doubleField ${dir} nulls `, [
        "SyntaxError: missing {'first', 'last'} at '<EOF>'",
      ]);
      for (const nullDir of ['first', 'last']) {
        testErrorsAndWarnings(`from a_index | sort doubleField ${dir} ${nullDir}`, [
          `SyntaxError: extraneous input '${nullDir}' expecting <EOF>`,
        ]);
      }
    }
    for (const nullDir of ['first', 'last']) {
      testErrorsAndWarnings(`from a_index | sort doubleField ${nullDir}`, [
        `SyntaxError: extraneous input '${nullDir}' expecting <EOF>`,
      ]);
    }
  });

  describe('enrich', () => {
    testErrorsAndWarnings(`from a_index | enrich`, [
      "SyntaxError: missing {ENRICH_POLICY_NAME, QUOTED_STRING} at '<EOF>'",
    ]);
    testErrorsAndWarnings(`from a_index | enrich _:`, [
      "SyntaxError: token recognition error at: ':'",
      'Unknown policy "_"',
    ]);
    testErrorsAndWarnings(`from a_index | enrich :policy`, [
      "SyntaxError: token recognition error at: ':'",
    ]);

    testErrorsAndWarnings(`from a_index | enrich policy on textField with `, [
      expect.stringContaining('SyntaxError:'),
    ]);
    testErrorsAndWarnings(`from a_index | enrich policy with `, [
      expect.stringContaining('SyntaxError:'),
    ]);
  });

  describe('settings', () => {
    // Should return error if there is no query following SET
    testErrorsAndWarnings(`SET time_zone = "CEST";`, [expect.stringContaining('SyntaxError:')]);
    testErrorsAndWarnings(`SET invalid_setting = "_alias:_origin"; FROM index`, [
      expect.stringContaining('Unknown setting invalid_setting'),
    ]);
  });

  describe('stats', () => {
    testErrorsAndWarnings('from a_index | stats avg(doubleField) by (wrongField)', [
      'Unknown column "wrongField"',
    ]);
  });
};
