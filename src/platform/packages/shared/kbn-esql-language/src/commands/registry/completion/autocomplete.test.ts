/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { mockContext, getMockCallbacks } from '../../../__tests__/commands/context_fixtures';
import { autocomplete } from './autocomplete';
import {
  expectSuggestions,
  getFieldNamesByType,
  getFunctionSignaturesByReturnType,
  DATE_DIFF_TIME_UNITS,
  suggest as testSuggest,
  mockFieldsWithTypes,
} from '../../../__tests__/commands/autocomplete';
import type { ICommandCallbacks } from '../types';
import { Location } from '../types';
import { ESQL_STRING_TYPES } from '../../definitions/types';

interface SuggestionItem {
  text: string;
  [key: string]: unknown;
}

type ExpectedCompletion =
  | string[]
  | {
      contains?: string[];
      notContains?: string[];
      containsItems?: SuggestionItem[];
    };

const completionExpectSuggestions = async (
  query: string,
  expected: ExpectedCompletion,
  mockCallbacks?: ICommandCallbacks,
  context = mockContext
) => {
  if (Array.isArray(expected)) {
    return expectSuggestions(query, expected, context, 'completion', mockCallbacks, autocomplete);
  }

  const results = await testSuggest(query, context, 'completion', mockCallbacks, autocomplete);
  const texts = results.map(({ text }) => text);

  if (expected.contains?.length) {
    expect(texts).toEqual(expect.arrayContaining(expected.contains));
  }

  if (expected.notContains?.length) {
    expected.notContains.forEach((excludedText) => expect(texts).not.toContain(excludedText));
  }

  if (expected.containsItems?.length) {
    expect(results).toEqual(expect.arrayContaining(expected.containsItems));
  }
};

const PROMPT_SUGGESTIONS = [
  ' = ',
  ...getFieldNamesByType(ESQL_STRING_TYPES).map((fieldName) => `${fieldName} `),
  ...getFunctionSignaturesByReturnType(Location.COMPLETION, ['text', 'keyword', 'unknown'], {
    scalar: true,
  }).map((text) => `${text} `),
];

describe('COMPLETION Autocomplete', () => {
  let mockCallbacks: ICommandCallbacks;
  beforeEach(() => {
    jest.clearAllMocks();

    mockCallbacks = getMockCallbacks();

    const expectedFields = getFieldNamesByType(ESQL_STRING_TYPES);
    mockFieldsWithTypes(mockCallbacks, expectedFields);
  });

  it('suggests PROMPT_SUGGESTIONS + default prompt after COMPLETION keyword', async () => {
    await completionExpectSuggestions(
      `FROM a | COMPLETION `,
      ['"${0:Your prompt to the LLM.}"', ...PROMPT_SUGGESTIONS],
      mockCallbacks
    );
  });

  it('suggests PROMPT_SUGGESTIONS when typing a column', async () => {
    await completionExpectSuggestions(
      `FROM a | COMPLETION kubernetes.some/`,
      PROMPT_SUGGESTIONS,
      mockCallbacks
    );
  });

  it('suggests ASSIGN after the user writes a new custom colum name', async () => {
    await completionExpectSuggestions(`FROM a | COMPLETION newColumn `, ['= ']);
  });

  it('suggests WITH after the user writes a colum name that already exists', async () => {
    await completionExpectSuggestions(`FROM a | COMPLETION textField `, ['WITH { $0 }']);
  });

  it('suggests WITH after the user writes a param as prompt', async () => {
    await completionExpectSuggestions(`FROM a | COMPLETION ? `, ['WITH { $0 }']);
  });

  it('suggests WITH after the prompt', async () => {
    await completionExpectSuggestions(`FROM a | COMPLETION "prompt" /`, ['WITH { $0 }']);
    await completionExpectSuggestions(`FROM a | COMPLETION "prompt" WIT/`, ['WITH { $0 }']);
  });

  it('suggests opening braces when WITH is already typed', async () => {
    await completionExpectSuggestions(`FROM a | COMPLETION "prompt" WITH `, [
      '{ "inference_id": "$0" }',
    ]);
  });

  it('suggests inference_id parameter within the named parameters map', async () => {
    await completionExpectSuggestions(`FROM a | COMPLETION "prompt" WITH {`, [
      '"inference_id": "$0"',
    ]);
    await completionExpectSuggestions(`FROM a | COMPLETION "prompt" WITH { `, [
      '"inference_id": "$0"',
    ]);
    await completionExpectSuggestions(
      `FROM a | COMPLETION "prompt" WITH {
      `,
      ['"inference_id": "$0"']
    );
  });

  it('suggests inference endpoints as the values for inference_id', async () => {
    await completionExpectSuggestions(`FROM a | COMPLETION "prompt" WITH { "inference_id": "`, [
      '"inference_1"',
    ]);
    await completionExpectSuggestions(`FROM a | COMPLETION "prompt" WITH { "inference_id": "i/`, [
      '"inference_1"',
    ]);
    await completionExpectSuggestions(`FROM a | COMPLETION "prompt" WITH { "inference_id": "inf/`, [
      '"inference_1"',
    ]);
  });

  it('does not suggest anything if all the parameters are already provided', async () => {
    await completionExpectSuggestions(
      `FROM a | COMPLETION "prompt" WITH { "inference_id": "inference_1", `,
      []
    );
  });

  it('does not suggest anything if the parameter name is unsupported', async () => {
    await completionExpectSuggestions(
      `FROM a | COMPLETION "prompt" WITH { "unsupported_param": "`,
      []
    );
  });

  it('suggests pipe after complete command', async () => {
    await completionExpectSuggestions(
      `FROM a | COMPLETION "prompt" WITH { "inference_id": "inference_1" }`,
      ['\n', '| ']
    );
  });

  it('suggests pipe after incomplete but enclosed map expression', async () => {
    await completionExpectSuggestions(`FROM a | COMPLETION "prompt" WITH { "inference_id": "" }`, [
      '\n',
      '| ',
    ]);
    await completionExpectSuggestions(`FROM a | COMPLETION "prompt" WITH { "inference_id": "" } `, [
      '\n',
      '| ',
    ]);
  });

  describe('expressions in prompt', () => {
    it('supports string functions and enforces type compatibility', async () => {
      await completionExpectSuggestions(
        'FROM a | COMPLETION ',
        {
          contains: ['CONCAT($0) ', 'textField ', 'keywordField '],
          notContains: ['doubleField '],
        },
        mockCallbacks
      );
    });

    it('suggests creating a value control for the prompt expression', async () => {
      const results = await testSuggest(
        'FROM a | COMPLETION ',
        { ...mockContext, supportsControls: true },
        'completion',
        mockCallbacks,
        autocomplete
      );

      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Create control',
            command: expect.objectContaining({
              id: 'esql.control.values.create',
            }),
          }),
        ])
      );
    });
  });

  describe('function parameter constraints', () => {
    it('constantOnly constraint - DATE_DIFF should suggest only constants', async () => {
      await completionExpectSuggestions(
        'from a | completion CONCAT(field, DATE_DIFF(',
        DATE_DIFF_TIME_UNITS,
        mockCallbacks
      );
    });

    it('function parameter type filtering - ABS should include numeric fields', async () => {
      const expectedNumericFields = getFieldNamesByType([
        'double',
        'integer',
        'long',
        'unsigned_long',
      ]);
      mockFieldsWithTypes(mockCallbacks, expectedNumericFields);

      const results = await testSuggest(
        'from a | completion CONCAT("Number: ", ABS(',
        mockContext,
        'completion',
        mockCallbacks,
        autocomplete
      );
      const texts = results.map(({ text }) => text);
      expectedNumericFields.forEach((fieldName) =>
        expect(texts).toEqual(expect.arrayContaining([fieldName]))
      );
    });
  });
});
