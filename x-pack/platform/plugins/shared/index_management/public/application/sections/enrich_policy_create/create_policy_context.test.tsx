/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, renderHook } from '@testing-library/react';

import { CreatePolicyContextProvider, useCreatePolicyContext } from './create_policy_context';

describe('<CreatePolicyContextProvider />', () => {
  describe('WHEN successive steps update the draft', () => {
    it('SHOULD save each update and retain the earlier step values', () => {
      const { result } = renderHook(useCreatePolicyContext, {
        wrapper: CreatePolicyContextProvider,
      });

      expect(result.current.draft).toEqual({});

      act(() => {
        result.current.updateDraft((previous) => ({
          ...previous,
          name: 'test_policy',
          type: 'match',
          sourceIndices: ['test-1'],
        }));
      });

      expect(result.current.draft).toEqual({
        name: 'test_policy',
        type: 'match',
        sourceIndices: ['test-1'],
      });

      act(() => {
        result.current.updateDraft((previous) => ({
          ...previous,
          matchField: 'first_name',
          enrichFields: ['age'],
        }));
      });

      expect(result.current.draft).toEqual({
        name: 'test_policy',
        type: 'match',
        sourceIndices: ['test-1'],
        matchField: 'first_name',
        enrichFields: ['age'],
      });
    });
  });
});
