/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createCaseResponseFixture } from '../../../common/fixtures/create_case';
import type { CasesClient } from '../../client';
import { removeTagsStepDefinition } from './remove_tags';
import { createStepHandlerContext } from './test_utils';

const createContext = (input: unknown) =>
  createStepHandlerContext({ input, stepType: 'cases.removeTags' });

describe('removeTagsStepDefinition', () => {
  it('removes tags from a case', async () => {
    const inputTags = ['triage', 'coke'];
    const remainingTags = ['pepsi'];
    const currentCase = { ...createCaseResponseFixture, tags: ['coke', 'pepsi', 'triage'] };
    const get = jest.fn().mockResolvedValue(currentCase);
    const bulkUpdate = jest
      .fn()
      .mockResolvedValue([{ ...createCaseResponseFixture, tags: remainingTags }]);
    const getCasesClient = jest.fn().mockResolvedValue({
      cases: { get, bulkUpdate },
    } as unknown as CasesClient);
    const definition = removeTagsStepDefinition(getCasesClient);

    const result = await definition.handler(createContext({ case_id: 'case-1', tags: inputTags }));

    expect(definition.id).toBe('cases.removeTags');
    expect(get).toHaveBeenCalledWith({ id: 'case-1', includeComments: false });
    expect(bulkUpdate).toHaveBeenCalledWith({
      cases: [
        expect.objectContaining({
          id: 'case-1',
          version: currentCase.version,
          tags: remainingTags,
        }),
      ],
    });
    expect(result).toEqual({
      output: {
        case: { ...createCaseResponseFixture, tags: remainingTags },
      },
    });
  });

  it('leaves tags unchanged when none of the input tags are present', async () => {
    const currentCase = { ...createCaseResponseFixture, tags: ['coke', 'pepsi'] };
    const get = jest.fn().mockResolvedValue(currentCase);
    const bulkUpdate = jest.fn().mockResolvedValue([currentCase]);
    const getCasesClient = jest.fn().mockResolvedValue({
      cases: { get, bulkUpdate },
    } as unknown as CasesClient);
    const definition = removeTagsStepDefinition(getCasesClient);

    await definition.handler(createContext({ case_id: 'case-1', tags: ['triage'] }));

    expect(bulkUpdate).toHaveBeenCalledWith({
      cases: [
        expect.objectContaining({
          id: 'case-1',
          version: currentCase.version,
          tags: ['coke', 'pepsi'],
        }),
      ],
    });
  });
});
