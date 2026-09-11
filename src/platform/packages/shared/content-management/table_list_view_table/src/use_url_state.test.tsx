/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { renderHook } from '@testing-library/react';
import { Router } from '@kbn/shared-ux-router';
import { createMemoryHistory } from 'history';
import { useUrlState } from './use_url_state';

describe('useUrlState', () => {
  const createWrapper = (initialSearch: string = '') => {
    const history = createMemoryHistory({ initialEntries: [{ search: initialSearch }] });
    const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <Router history={history}>{children}</Router>
    );
    return { Wrapper, history };
  };

  test('preserves "hello&world" string through page refresh', () => {
    const { Wrapper, history } = createWrapper(`?s=${encodeURIComponent('hello&world')}`);
    const { result } = renderHook(
      () =>
        useUrlState<{ s: string }, { s?: string }>({
          queryParamsDeserializer: (p) => ({ s: p.s || '' }),
          queryParamsSerializer: (p) => ({ s: p.s as string }),
        }),
      { wrapper: Wrapper }
    );

    expect(result.current[0].s).toBe('hello&world');

    // Simulate page refresh
    const { Wrapper: RefreshWrapper } = createWrapper(history.location.search);
    const { result: refreshResult } = renderHook(
      () =>
        useUrlState<{ s: string }, { s?: string }>({
          queryParamsDeserializer: (p) => ({ s: p.s || '' }),
          queryParamsSerializer: (p) => ({ s: p.s as string }),
        }),
      { wrapper: RefreshWrapper }
    );

    expect(refreshResult.current[0].s).toBe('hello&world');
  });

  test('distinguishes ampersand as separator vs part of value', () => {
    // Two separate parameters: tag="hello", info="world"
    const { result: r1 } = renderHook(
      () =>
        useUrlState<{ tag: string; info: string }, { tag?: string; info?: string }>({
          queryParamsDeserializer: (p) => ({ tag: p.tag || '', info: p.info || '' }),
          queryParamsSerializer: (p) => ({ tag: p.tag as string, info: p.info as string }),
        }),
      { wrapper: createWrapper(`?tag=hello&info=world`).Wrapper }
    );
    expect(r1.current[0]).toEqual({ tag: 'hello', info: 'world' });

    // Single value with ampersand: tag="hello&world", info="thanks"
    const { result: r2 } = renderHook(
      () =>
        useUrlState<{ tag: string; info: string }, { tag?: string; info?: string }>({
          queryParamsDeserializer: (p) => ({ tag: p.tag || '', info: p.info || '' }),
          queryParamsSerializer: (p) => ({ tag: p.tag as string, info: p.info as string }),
        }),
      {
        wrapper: createWrapper(
          `?tag=${encodeURIComponent('hello&world')}&info=${encodeURIComponent('thanks')}`
        ).Wrapper,
      }
    );
    expect(r2.current[0]).toEqual({ tag: 'hello&world', info: 'thanks' });
  });
});
