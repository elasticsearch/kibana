/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { mockContext } from '../../../__tests__/commands/context_fixtures';
import { autocomplete } from './autocomplete';
import {
  expectSuggestions,
  getFieldNamesByType,
  getPolicyFields,
} from '../../../__tests__/commands/autocomplete';
import type { ICommandCallbacks } from '../types';
import { ESQL_STRING_TYPES } from '../../definitions/types';
import { camelCase } from 'lodash';

// Helper function to check for special characters
function needsEscaping(name: string): boolean {
  const specialCharsRegex = /[^\w\s@]/; // Matches any non-word character (not a-z, A-Z, 0-9, _) and non-whitespace character and non-@ character
  return specialCharsRegex.test(name);
}

const enrichExpectSuggestions = (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  context = mockContext
) => {
  return expectSuggestions(
    query,
    expectedSuggestions,
    context,
    'enrich',
    mockCallbacks,
    autocomplete
  );
};

describe('ENRICH Autocomplete', () => {
  const modes = ['any', 'coordinator', 'remote'];

  let mockCallbacks: ICommandCallbacks;
  let expectedPolicyNameSuggestions: string[];
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mocks before each test to ensure isolation
    mockCallbacks = {
      getByType: jest.fn(),
    };

    const expectedFields = getFieldNamesByType(ESQL_STRING_TYPES);
    (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
      expectedFields.map((name) => ({ label: name, text: name }))
    );

    expectedPolicyNameSuggestions = Array.from((mockContext.policies ?? new Map()).values()).map(
      ({ name }) => {
        return needsEscaping(name) ? `\`${name.replace(/`/g, '\\`')}\` ` : `${name} `;
      }
    );
  });

  it('suggests policy names', async () => {
    await enrichExpectSuggestions(`from a | enrich /`, expectedPolicyNameSuggestions);
    await enrichExpectSuggestions(`from a | enrich po/`, expectedPolicyNameSuggestions);
  });

  test('modes', async () => {
    await enrichExpectSuggestions(
      `from a | enrich _/`,
      modes.map((mode) => `_${mode}:$0`)
    );
    await enrichExpectSuggestions('from a | enrich _any: ', []);
    for (const mode of modes) {
      await enrichExpectSuggestions(
        `from a | enrich _${mode}:/`,
        expectedPolicyNameSuggestions,
        {}
      );

      await enrichExpectSuggestions(
        `from a | enrich _${mode.toUpperCase()}:/`,
        expectedPolicyNameSuggestions
      );

      await enrichExpectSuggestions(
        `from a | enrich _${camelCase(mode)}:/`,
        expectedPolicyNameSuggestions
      );
    }
  });

  it('suggests ON and WITH after policy name', async () => {
    await enrichExpectSuggestions(`from a | enrich policy /`, ['\n', 'ON ', 'WITH ', '| ']);
    await enrichExpectSuggestions(`from a | enrich policy O/`, ['\n', 'ON ', 'WITH ', '| ']);
  });

  it('suggests fields after ON', async () => {
    await enrichExpectSuggestions(
      `from a | enrich policy on /`,
      getFieldNamesByType('any', true).map((v) => {
        return needsEscaping(v) ? `\`${v.replace(/`/g, '\\`')}\` ` : `${v} `;
      })
    );
    await enrichExpectSuggestions(
      `from a | enrich policy on fi/`,
      getFieldNamesByType('any', true).map((v) => {
        return needsEscaping(v) ? `\`${v.replace(/`/g, '\\`')}\` ` : `${v} `;
      })
    );
  });

  describe('WITH', () => {
    it('suggests WITH after ON <field>', async () => {
      await enrichExpectSuggestions(`from a | enrich policy on field `, ['\n', 'WITH ', '| ']);
    });

    it('suggests fields for new WITH clauses', async () => {
      await enrichExpectSuggestions(`from a | enrich policy on field with /`, [
        ' = ',
        ...getPolicyFields('policy'),
      ]);
      await enrichExpectSuggestions(`from a | enrich policy on field with fi/`, [
        ' = ',
        ...getPolicyFields('policy'),
      ]);
      await enrichExpectSuggestions(`from a | enrich policy on b with col0 = otherField, /`, [
        ' = ',
        ...getPolicyFields('policy'),
      ]);
      await enrichExpectSuggestions(`from a | enrich policy on b with col0 = otherField, fi/`, [
        ' = ',
        ...getPolicyFields('policy'),
      ]);
    });

    test('waits to suggest fields until space', async () => {
      await enrichExpectSuggestions(`from a | enrich policy on b with col0 = otherField,/`, []);
      await enrichExpectSuggestions(`from a | enrich policy on b with/`, []);
    });

    test('after first word', async () => {
      // not a recognized column name
      await enrichExpectSuggestions(`from a | enrich policy on b with col0 `, ['= $0']);
      // recognized column name
      await enrichExpectSuggestions(`from a | enrich policy on b with otherField `, [
        '\n',
        ',',
        '| ',
      ]);
    });

    test('suggests enrich fields after open assignment', async () => {
      await enrichExpectSuggestions(`from a | enrich policy on b with col0 = /`, [
        ...getPolicyFields('policy'),
      ]);
      await enrichExpectSuggestions(`from a | enrich policy with \`a|b\` = /`, [
        ...getPolicyFields('policy'),
      ]);
      await enrichExpectSuggestions(`from a | enrich policy on b with col0 = fi/`, [
        ...getPolicyFields('policy'),
      ]);
      await enrichExpectSuggestions(
        `from a | enrich policy on b with col0 = otherField, col1 =  /`,
        [...getPolicyFields('policy')]
      );
    });

    test('after complete clause', async () => {
      // works with escaped field names
      await enrichExpectSuggestions(`from a | enrich policy on b with col0 = \`otherField\` `, [
        '\n',
        ',',
        '| ',
      ]);
      await enrichExpectSuggestions(`from a | enrich policy on b with col0=otherField `, [
        '\n',
        ',',
        '| ',
      ]);
      await enrichExpectSuggestions(`from a | enrich policy on b with otherField `, [
        '\n',
        ',',
        '| ',
      ]);
    });

    test('after user-defined column name', async () => {
      await enrichExpectSuggestions(`from a | enrich policy on b with col0 = otherField, col1 `, [
        '= $0',
      ]);
    });
  });
});
