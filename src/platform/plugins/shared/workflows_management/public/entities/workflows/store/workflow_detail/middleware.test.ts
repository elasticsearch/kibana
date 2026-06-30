/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import YAML, { LineCounter } from 'yaml';
import { setYamlString } from './slice';
import type { ComputedData } from './types';
import { createMockStore } from '../__mocks__/store.mock';
import type { MockStore } from '../__mocks__/store.mock';

// Mock the computation utility
jest.mock('./utils/computation', () => ({
  performComputation: jest.fn(),
}));

const { performComputation } = jest.requireMock('./utils/computation');

describe('workflowComputationMiddleware', () => {
  let store: MockStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = createMockStore();
  });

  it('should clear computed data when yamlString is empty', () => {
    performComputation.mockReturnValue({
      yamlDocument: YAML.parseDocument('name: test'),
      yamlLineCounter: new LineCounter(),
      workflowLookup: { steps: {} },
    } satisfies ComputedData);

    // First, set some yaml to initialize computed data
    store.dispatch(setYamlString('name: test'));

    // Now clear
    store.dispatch(setYamlString(''));

    const state = store.getState();
    // computed should be cleared (set to empty object by _clearComputedData)
    expect(state.detail.computed).toEqual({});
    expect(state.detail.focusedStepId).toBeUndefined();
  });

  it('should perform immediate computation when computed is undefined', () => {
    const mockComputed: ComputedData = {
      yamlDocument: YAML.parseDocument('name: test'),
      yamlLineCounter: new LineCounter(),
      workflowLookup: { steps: {} },
    };

    performComputation.mockReturnValue(mockComputed);

    // Computed starts as undefined, so first dispatch triggers immediate computation
    store.dispatch(setYamlString('name: test'));

    expect(performComputation).toHaveBeenCalledWith('name: test', undefined);
    expect(store.getState().detail.computed).toEqual(mockComputed);
  });

  it('should debounce computation when computed already exists', () => {
    jest.useFakeTimers();

    const mockComputed: ComputedData = {
      yamlDocument: YAML.parseDocument('name: test'),
      yamlLineCounter: new LineCounter(),
      workflowLookup: { steps: {} },
    };

    performComputation.mockReturnValue(mockComputed);

    // First dispatch: immediate computation (computed is undefined)
    store.dispatch(setYamlString('name: test'));
    expect(performComputation).toHaveBeenCalledTimes(1);

    // Second dispatch: should be debounced (computed is now defined)
    performComputation.mockClear();
    store.dispatch(setYamlString('name: test2'));
    expect(performComputation).not.toHaveBeenCalled();

    // Advance timers past the debounce window (500ms)
    jest.advanceTimersByTime(500);

    expect(performComputation).toHaveBeenCalledWith('name: test2', undefined);

    jest.useRealTimers();
  });

  it('should clear computed data when performComputation throws', () => {
    const mockComputed: ComputedData = {
      yamlDocument: YAML.parseDocument('name: test'),
      yamlLineCounter: new LineCounter(),
      workflowLookup: { steps: {} },
    };

    // First call succeeds to initialize computed
    performComputation.mockReturnValueOnce(mockComputed);
    store.dispatch(setYamlString('name: test'));
    expect(store.getState().detail.computed).toEqual(mockComputed);

    // Second call throws - since computed is defined, it will be debounced
    jest.useFakeTimers();
    performComputation.mockImplementationOnce(() => {
      throw new Error('parse error');
    });

    store.dispatch(setYamlString('invalid: {{{'));

    // Advance past debounce
    jest.advanceTimersByTime(500);

    // computed should be cleared due to the error
    expect(store.getState().detail.computed).toEqual({});
    expect(store.getState().detail.focusedStepId).toBeUndefined();

    jest.useRealTimers();
  });

  it('should cancel pending debounced computation when a new yamlString is dispatched', () => {
    jest.useFakeTimers();

    const mockComputed: ComputedData = {
      yamlDocument: YAML.parseDocument('name: test'),
      yamlLineCounter: new LineCounter(),
      workflowLookup: { steps: {} },
    };

    performComputation.mockReturnValue(mockComputed);

    // Initialize computed
    store.dispatch(setYamlString('name: first'));
    expect(performComputation).toHaveBeenCalledTimes(1);
    performComputation.mockClear();

    // Dispatch two rapid changes
    store.dispatch(setYamlString('name: second'));
    jest.advanceTimersByTime(200);
    store.dispatch(setYamlString('name: third'));

    // Only the latest should be computed after the debounce
    jest.advanceTimersByTime(500);

    expect(performComputation).toHaveBeenCalledTimes(1);
    expect(performComputation).toHaveBeenCalledWith('name: third', undefined);

    jest.useRealTimers();
  });
});
