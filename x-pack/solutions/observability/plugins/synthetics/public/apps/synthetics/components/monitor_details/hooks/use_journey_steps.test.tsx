/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useJourneySteps } from './use_journey_steps';
import { fetchJourneyAction } from '../../../state';

const mockDispatch = jest.fn();
jest.mock('react-redux', () => {
  const actual = jest.requireActual('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    useSelector: () => undefined,
  };
});

jest.mock('react-router-dom', () => ({
  useParams: () => ({ checkGroupId: 'cg-from-url', stepIndex: '1' }),
}));

const mockUrlParams = jest.fn();
jest.mock('../../../hooks', () => ({
  useGetUrlParams: () => mockUrlParams(),
}));

describe('useJourneySteps', () => {
  beforeEach(() => {
    mockUrlParams.mockReturnValue({});
  });

  afterEach(() => jest.clearAllMocks());

  // `fetchJourneyAction.get` stamps `meta.dispatchedAt` with `Date.now()` via
  // its `prepareForTimestamp` helper, so two invocations of `.get(payload)`
  // never deep-equal each other. We inspect the dispatched action's `type`
  // and `payload` directly instead.

  it('dispatches fetchJourneyAction with undefined remoteName for local monitors', () => {
    renderHook(() => useJourneySteps({ checkGroup: 'cg-explicit' }));

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const dispatched = mockDispatch.mock.calls[0][0];
    expect(dispatched.type).toBe(fetchJourneyAction.get.type);
    expect(dispatched.payload).toEqual({ checkGroup: 'cg-explicit', remoteName: undefined });
  });

  it('forwards the URL remoteName for remote monitors', () => {
    mockUrlParams.mockReturnValue({ remoteName: 'remote-a' });

    renderHook(() => useJourneySteps({ checkGroup: 'cg-explicit' }));

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const dispatched = mockDispatch.mock.calls[0][0];
    expect(dispatched.type).toBe(fetchJourneyAction.get.type);
    expect(dispatched.payload).toEqual({ checkGroup: 'cg-explicit', remoteName: 'remote-a' });
  });

  it('falls back to the URL checkGroupId when no explicit checkGroup is passed', () => {
    renderHook(() => useJourneySteps());

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const dispatched = mockDispatch.mock.calls[0][0];
    expect(dispatched.payload).toEqual({ checkGroup: 'cg-from-url', remoteName: undefined });
  });

  it('forwards stepsOnly so the server can skip the journey-details lookup', () => {
    renderHook(() => useJourneySteps({ checkGroup: 'cg-explicit', stepsOnly: true }));

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const dispatched = mockDispatch.mock.calls[0][0];
    expect(dispatched.type).toBe(fetchJourneyAction.get.type);
    expect(dispatched.payload).toEqual({
      checkGroup: 'cg-explicit',
      remoteName: undefined,
      stepsOnly: true,
    });
  });
});
