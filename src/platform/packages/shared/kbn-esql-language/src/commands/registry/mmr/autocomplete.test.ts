/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { mockContext, getMockCallbacks } from '../../../__tests__/commands/context_fixtures';
import {
  expectSuggestions,
  getFunctionSignaturesByReturnType,
  suggest,
} from '../../../__tests__/commands/autocomplete';
import { onCompleteItem, pipeCompleteItem, withCompleteItem } from '../complete_items';
import type { ESQLColumnData, ICommandCallbacks } from '../types';
import { Location } from '../types';
import { autocomplete } from './autocomplete';

const buildContextWithDenseVector = () => {
  const columns = new Map<string, ESQLColumnData>(mockContext.columns);
  columns.set('denseField', { name: 'denseField', type: 'dense_vector', userDefined: false });

  return {
    ...mockContext,
    columns,
  };
};

const expectMmrSuggestions = (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  context = mockContext,
  offset?: number
) => {
  return expectSuggestions(
    query,
    expectedSuggestions,
    context,
    'mmr',
    mockCallbacks,
    autocomplete,
    offset
  );
};

const expectMmrSuggestionsContains = async (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  context = mockContext,
  offset?: number
) => {
  const results = await suggest(query, context, 'mmr', mockCallbacks, autocomplete, offset);
  const texts = results.map((result) => result.text);

  expect(texts).toEqual(expect.arrayContaining(expectedSuggestions));
};

describe('MMR Autocomplete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('suggests query vector, dense-vector functions and ON after MMR keyword', async () => {
    await expectMmrSuggestionsContains('FROM a | MMR ', [
      '[${0:0.1}, ${1:0.2}]::dense_vector ',
      onCompleteItem.text,
      ...getFunctionSignaturesByReturnType(Location.MMR, 'dense_vector', { scalar: true }),
    ]);
  });

  it('suggests ON after query vector', async () => {
    await expectMmrSuggestions('FROM a | MMR [0.1, 0.2]::dense_vector ', [onCompleteItem.text]);
  });

  it('suggests only dense vector fields after ON', async () => {
    const context = buildContextWithDenseVector();
    const mockCallbacks = getMockCallbacks();
    (mockCallbacks.getByType as jest.Mock).mockResolvedValue([
      { label: 'denseField', text: 'denseField ' },
      { label: 'missingDense', text: 'missingDense ' },
    ]);

    await expectMmrSuggestions('FROM a | MMR ON ', ['denseField '], mockCallbacks, context);
  });

  it('does not suggest ON while cursor is inside query vector function arguments', async () => {
    const context = buildContextWithDenseVector();
    const mockCallbacks = getMockCallbacks();
    (mockCallbacks.getByType as jest.Mock).mockResolvedValue([
      { label: 'denseField', text: 'denseField ' },
    ]);

    const results = await suggest(
      'FROM a | MMR TO_DENSE_VECTOR(',
      context,
      'mmr',
      mockCallbacks,
      autocomplete
    );

    const texts = results.map((result) => result.text);
    expect(texts).not.toContain('ON ');
  });

  it('suggests LIMIT after field', async () => {
    const context = buildContextWithDenseVector();
    await expectMmrSuggestions('FROM a | MMR ON denseField ', ['LIMIT '], undefined, context);
  });

  it('suggests limit value after LIMIT keyword', async () => {
    const context = buildContextWithDenseVector();
    await expectMmrSuggestions(
      'FROM a | MMR ON denseField LIMIT ',
      ['10 ', '100 ', '1000 '],
      undefined,
      context
    );
  });

  it('suggests WITH and pipe after limit value', async () => {
    const context = buildContextWithDenseVector();
    await expectMmrSuggestions(
      'FROM a | MMR ON denseField LIMIT 10 ',
      ['\n', withCompleteItem.text, pipeCompleteItem.text],
      undefined,
      context
    );
  });

  it('suggests lambda map after WITH keyword', async () => {
    const context = buildContextWithDenseVector();
    await expectMmrSuggestions(
      'FROM a | MMR ON denseField LIMIT 10 WITH ',
      ['{ "lambda": ${0:0.5} }'],
      undefined,
      context
    );
  });

  it('suggests lambda key inside options map', async () => {
    const context = buildContextWithDenseVector();
    const mockCallbacks = getMockCallbacks();

    const results = await suggest(
      'FROM a | MMR ON denseField LIMIT 10 WITH { ',
      context,
      'mmr',
      mockCallbacks,
      autocomplete
    );

    const texts = results.map((result) => result.text);
    expect(texts).toEqual(expect.arrayContaining(['"lambda": ']));
  });
});
