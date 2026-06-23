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
import { assignCompletionItem, pipeCompleteItem, withCompleteItem } from '../complete_items';
import type { ICommandCallbacks } from '../types';
import { Location } from '../types';
import { autocomplete } from './autocomplete';

const expectUserAgentSuggestions = (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  offset?: number
) =>
  expectSuggestions(
    query,
    expectedSuggestions,
    mockContext,
    'user_agent',
    mockCallbacks,
    autocomplete,
    offset
  );

const expectUserAgentSuggestionsContains = async (
  query: string,
  expectedSuggestions: string[],
  mockCallbacks?: ICommandCallbacks,
  offset?: number
) => {
  const results = await suggest(
    query,
    mockContext,
    'user_agent',
    mockCallbacks,
    autocomplete,
    offset
  );
  const texts = results.map((r) => r.text);
  expect(texts).toEqual(expect.arrayContaining(expectedSuggestions));
};

describe('USER_AGENT Autocomplete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('suggests a new user-defined column name after the USER_AGENT keyword', async () => {
    const mockCallbacks = getMockCallbacks();
    (mockCallbacks.getSuggestedUserDefinedColumnName as jest.Mock).mockReturnValue('ua');

    await expectUserAgentSuggestions('FROM a | USER_AGENT ', ['${1:user_agent} = '], mockCallbacks);
  });

  it('suggests = after the target field name', async () => {
    await expectUserAgentSuggestions('FROM a | USER_AGENT ua ', [assignCompletionItem.text]);
  });

  it('suggests string fields and string functions after the assignment operator', async () => {
    const mockCallbacks = getMockCallbacks();
    (mockCallbacks.getByType as jest.Mock).mockResolvedValue([
      { label: 'uaString', text: 'uaString ' },
    ]);

    await expectUserAgentSuggestionsContains(
      'FROM a | USER_AGENT ua = ',
      [
        'uaString ',
        ...getFunctionSignaturesByReturnType(Location.EVAL, ['keyword', 'text'], { scalar: true }),
      ],
      mockCallbacks
    );
  });

  it('suggests string fields and string functions when expression is an incomplete function call', async () => {
    const mockCallbacks = getMockCallbacks();
    (mockCallbacks.getByType as jest.Mock).mockResolvedValue([
      { label: 'uaString', text: 'uaString ' },
    ]);

    // e.g. CONCAT()
    // CONCAT( — cursor inside an incomplete call. Functions have trailing commas because
    // CONCAT requires more mandatory args (in_function position).
    await expectUserAgentSuggestionsContains(
      'FROM a | USER_AGENT ua = CONCAT(',
      [
        'uaString ',
        // CONCAT is excluded because it's the parent function we're inside
        ...getFunctionSignaturesByReturnType(Location.EVAL, ['keyword', 'text'], {
          scalar: true,
        })
          .filter((s) => !s.startsWith('CONCAT('))
          .map((s) => `${s},`),
      ],
      mockCallbacks
    );
    // WITH / pipe must NOT be offered here
    const results = await suggest(
      'FROM a | USER_AGENT ua = CONCAT(',
      mockContext,
      'user_agent',
      mockCallbacks,
      autocomplete
    );
    const texts = results.map((r) => r.text);
    expect(texts).not.toContain(withCompleteItem.text);
    expect(texts).not.toContain(pipeCompleteItem.text);
  });

  it('suggests WITH and pipe after a complete expression', async () => {
    await expectUserAgentSuggestions('FROM a | USER_AGENT ua = keywordField ', [
      '\n',
      withCompleteItem.text,
      pipeCompleteItem.text,
    ]);
  });

  it('suggests a map placeholder after the WITH keyword', async () => {
    await expectUserAgentSuggestions('FROM a | USER_AGENT ua = keywordField WITH ', ['{ $0 }']);
  });

  it('suggests map keys inside an empty options map', async () => {
    const results = await suggest(
      'FROM a | USER_AGENT ua = keywordField WITH { ',
      mockContext,
      'user_agent',
      getMockCallbacks(),
      autocomplete
    );
    const texts = results.map((r) => r.text);
    expect(texts).toEqual(
      expect.arrayContaining([
        '"regex_file": "$0"',
        '"extract_device_type": ',
        '"properties": [ $0 ]',
      ])
    );
  });

  it('suggests remaining map keys after one entry', async () => {
    const results = await suggest(
      'FROM a | USER_AGENT ua = keywordField WITH { "regex_file": "_default_", ',
      mockContext,
      'user_agent',
      getMockCallbacks(),
      autocomplete
    );
    const texts = results.map((r) => r.text);
    expect(texts).toEqual(
      expect.arrayContaining(['"extract_device_type": ', '"properties": [ $0 ]'])
    );
    expect(texts).not.toContain('"regex_file": "$0"');
  });

  it('suggests all property values inside an empty properties array', async () => {
    await expectUserAgentSuggestions(
      'FROM a | USER_AGENT ua = keywordField WITH { "properties": [ ',
      ['"name"', '"version"', '"os"', '"device"']
    );
  });

  it('suggests remaining property values after one is already selected', async () => {
    await expectUserAgentSuggestions(
      'FROM a | USER_AGENT ua = keywordField WITH { "properties": ["name", ',
      ['"version"', '"os"', '"device"']
    );
  });

  it('suggests no property values when all are already selected', async () => {
    await expectUserAgentSuggestions(
      'FROM a | USER_AGENT ua = keywordField WITH { "properties": ["name", "version", "os", "device", ',
      []
    );
  });

  it('suggests pipe after a complete options map', async () => {
    await expectUserAgentSuggestions(
      'FROM a | USER_AGENT ua = keywordField WITH { "extract_device_type": true } ',
      ['\n', pipeCompleteItem.text]
    );
  });
});
