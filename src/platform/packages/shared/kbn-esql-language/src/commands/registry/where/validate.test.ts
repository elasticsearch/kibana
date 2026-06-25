/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { mockContext } from '../../../__tests__/commands/context_fixtures';
import { validate } from './validate';
import { expectErrors } from '../../../__tests__/commands/validation';
import { getNoValidCallSignatureError } from '../../definitions/utils/validation/utils';

const NESTING_LEVELS = 4;
const NESTED_DEPTHS = Array(NESTING_LEVELS)
  .fill(0)
  .map((_, i) => i + 1);

const whereExpectErrors = (query: string, expectedErrors: string[], context = mockContext) => {
  return expectErrors(query, expectedErrors, context, 'where', validate);
};

describe('WHERE Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // @TODO - this test is largely about function/operator validation, which is not the focus of this file.
  // consider merging with the functions validation tests (src/platform/packages/shared/kbn-esql-language/src/validation/__tests__/functions.test.ts).
  test('validates the WHERE command', () => {
    whereExpectErrors('from a_index | where b', ['Unknown column "b"']);
    for (const cond of ['true', 'false']) {
      whereExpectErrors(`from a_index | where ${cond}`, []);
      whereExpectErrors(`from a_index | where NOT ${cond}`, []);
    }
    for (const nValue of ['1', '+1', '1 * 1', '-1', '1 / 1', '1.0', '1.5']) {
      whereExpectErrors(`from a_index | where ${nValue} > 0`, []);
      whereExpectErrors(`from a_index | where NOT ${nValue} > 0`, []);
    }
    for (const op of ['>', '>=', '<', '<=', '==', '!=']) {
      whereExpectErrors(`from a_index | where doubleField ${op} 0`, []);
      whereExpectErrors(`from a_index | where NOT doubleField ${op} 0`, []);
      whereExpectErrors(`from a_index | where (doubleField ${op} 0)`, []);
      whereExpectErrors(`from a_index | where (NOT (doubleField ${op} 0))`, []);
      whereExpectErrors(`from a_index | where 1 ${op} 0`, []);

      for (const type of ['text', 'double', 'date', 'boolean', 'ip']) {
        whereExpectErrors(
          `from a_index | where ${type}Field ${op} ${type}Field`,
          type !== 'boolean' || ['==', '!='].includes(op)
            ? []
            : [getNoValidCallSignatureError(op, [type, type])]
        );
      }
    }

    for (const type of ['date', 'dateNanos']) {
      whereExpectErrors(
        `from a_index | where ${type}Field > ?_tstart AND ${type}Field < ?_tend`,
        []
      );
    }

    for (const nesting of NESTED_DEPTHS) {
      for (const evenOp of ['-', '+']) {
        for (const oddOp of ['-', '+']) {
          // This builds a combination of +/- operators
          // i.e. ---- something, -+-+ something, +-+- something, etc...
          const unaryCombination = Array(nesting)
            .fill('- ')
            .map((_, i) => (i % 2 ? oddOp : evenOp))
            .join('');
          whereExpectErrors(`from a_index | where ${unaryCombination} doubleField > 0`, []);
          whereExpectErrors(`from a_index | where ${unaryCombination} round(doubleField) > 0`, []);
          whereExpectErrors(`from a_index | where 1 + ${unaryCombination} doubleField > 0`, []);
          // still valid
          whereExpectErrors(`from a_index | where 1 ${unaryCombination} doubleField > 0`, []);
        }
      }
      whereExpectErrors(
        `from a_index | where ${Array(nesting).fill('not ').join('')} booleanField`,
        []
      );
    }

    for (const op of ['like', 'rlike']) {
      whereExpectErrors(`from a_index | where textField ${op} "?a"`, []);
      whereExpectErrors(`from a_index | where textField NOT ${op} "?a"`, []);
      whereExpectErrors(`from a_index | where NOT textField ${op} "?a"`, []);
      whereExpectErrors(`from a_index | where NOT textField NOT ${op} "?a"`, []);
      whereExpectErrors(`from a_index | where doubleField ${op} "?a"`, [
        getNoValidCallSignatureError(op, ['double', 'keyword']),
      ]);
      whereExpectErrors(`from a_index | where doubleField NOT ${op} "?a"`, [
        getNoValidCallSignatureError(`not ${op}`, ['double', 'keyword']),
      ]);
      whereExpectErrors(`from a_index | where NOT doubleField ${op} "?a"`, [
        getNoValidCallSignatureError(op, ['double', 'keyword']),
      ]);
      whereExpectErrors(`from a_index | where NOT doubleField NOT ${op} "?a"`, [
        getNoValidCallSignatureError(`not ${op}`, ['double', 'keyword']),
      ]);
    }

    whereExpectErrors(`from a_index | where cidr_match(ipField)`, [
      `CIDR_MATCH expected at least 2 arguments, but got 1.`,
    ]);
    whereExpectErrors(
      `from a_index | eval keywordField = "172.0.0.1/30" | where cidr_match(ipField, "172.0.0.1/30", keywordField)`,
      []
    );

    whereExpectErrors(`from a_index | where doubleField IS NULL`, []);
    whereExpectErrors(`from a_index | where doubleField IS NOT NULL`, []);
    // this is a scenario that was failing because "or" didn't accept "null"
    whereExpectErrors('from a_index | where textField == "a" or null', []);
  });

  test('accepts string literals in IN operator for ip and version fields', () => {
    // ip fields accept string literals via implicit casting (same as == operator)
    whereExpectErrors(`from a_index | where ipField IN ("1.1.1.1")`, []);
    whereExpectErrors(`from a_index | where ipField IN ("1.1.1.1", "2.2.2.2", "3.3.3.3")`, []);
    whereExpectErrors(`from a_index | where ipField NOT IN ("1.1.1.1")`, []);
    // version fields accept string literals via implicit casting
    whereExpectErrors(`from a_index | where versionField IN ("1.0.0")`, []);
    whereExpectErrors(`from a_index | where versionField IN ("1.0.0", "2.0.0")`, []);
  });
});
