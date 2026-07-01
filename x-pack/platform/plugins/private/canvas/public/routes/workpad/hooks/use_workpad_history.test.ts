/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useWorkpadHistory } from './use_workpad_history';
import { encode } from '../route_state';

const mockGetState = jest.fn();
const mockGetHistory = jest.fn();

// Mock the hooks and actions used by the UseWorkpad hook
jest.mock('react-router-dom', () => ({
  useHistory: () => mockGetHistory(),
}));

jest.mock('react-redux', () => ({
  useSelector: (selector: any) => selector(mockGetState()),
}));

describe('useRestoreHistory', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('initial run', () => {
    test('with undefined location state ', () => {
      const history = {
        location: {
          state: undefined,
          pathname: 'somepath',
        },
        push: jest.fn(),
        replace: jest.fn(),
      };

      const state = {
        persistent: { some: 'state' },
      };

      mockGetState.mockReturnValue(state);
      mockGetHistory.mockReturnValue(history);

      renderHook(() => useWorkpadHistory());

      expect(history.replace).toBeCalledWith(history.location.pathname, encode(state.persistent));
      expect(history.push).not.toBeCalled();
    });

    test('with location state not matching store state', () => {
      const history = {
        location: {
          state: encode({ prior: 'state' }) as string | undefined,
          pathname: 'somepath',
        },
        push: jest.fn(),
        replace: jest.fn(),
      };

      const state = {
        persistent: { some: 'state' },
      };

      mockGetState.mockReturnValue(state);
      mockGetHistory.mockReturnValue(history);

      renderHook(() => useWorkpadHistory());

      expect(history.push).not.toBeCalled();
      expect(history.replace).not.toBeCalled();
    });

    test('with location state matching store state', () => {
      const state = { some: 'state' };
      const history = {
        location: {
          state: encode(state),
          pathname: 'somepath',
        },
        push: jest.fn(),
        replace: jest.fn(),
      };
      mockGetState.mockReturnValue(state);
      mockGetHistory.mockReturnValue(history);

      renderHook(() => useWorkpadHistory());

      expect(history.push).not.toBeCalled();
      expect(history.replace).not.toBeCalled();
    });
  });

  describe('state changes', () => {
    it('does a replace if location state is undefined', () => {
      const push = jest.fn();
      const replace = jest.fn();

      const history = {
        location: {
          state: encode({ old: 'state' }) as string | undefined,
          pathname: 'somepath',
          search: '',
        },
        push,
        replace,
      };

      const state = {
        persistent: { some: 'state' },
      };

      const newState = {
        persistent: { new: 'state' },
      };

      mockGetState.mockReturnValue(state);
      mockGetHistory.mockReturnValue(history);

      const { rerender } = renderHook(() => useWorkpadHistory());

      mockGetState.mockReturnValue(newState);
      // History object from react router will not change, so just modifying here
      history.location.state = undefined;
      history.location.pathname = 'newpath';
      rerender();

      expect(history.replace).toBeCalledWith('newpath', encode(newState.persistent));
    });

    test('does a push if location state does not match store state', () => {
      const history = {
        location: {
          state: encode({ old: 'state' }),
          pathname: 'somepath',
        },
        push: jest.fn(),
        replace: jest.fn(),
      };

      const oldState = {
        persistent: { some: 'state' },
      };

      const newState = {
        persistent: { new: 'state' },
      };

      mockGetState.mockReturnValue(oldState);
      mockGetHistory.mockReturnValue(history);

      const { rerender } = renderHook(() => useWorkpadHistory());

      mockGetState.mockReturnValue(newState);
      rerender();

      expect(history.push).toBeCalledWith(history.location.pathname, encode(newState.persistent));
    });

    test('does not push a history entry when only @timestamp changes', () => {
      const baseWorkpad = {
        id: 'workpad-1',
        name: 'A',
        page: 0,
        pages: [],
        '@timestamp': '2021-01-01T00:00:00.000Z',
      };

      const state = {
        persistent: { schemaVersion: 1, workpad: { ...baseWorkpad } },
      };

      const history = {
        location: {
          state: encode(state.persistent),
          pathname: 'somepath',
        },
        push: jest.fn(),
        replace: jest.fn(),
      };

      mockGetState.mockReturnValue(state);
      mockGetHistory.mockReturnValue(history);

      const { rerender } = renderHook(() => useWorkpadHistory());

      const newState = {
        persistent: {
          schemaVersion: 1,
          workpad: { ...baseWorkpad, '@timestamp': '2021-01-01T00:05:00.000Z' },
        },
      };
      mockGetState.mockReturnValue(newState);
      rerender();

      expect(history.push).not.toBeCalled();
    });

    test('does nothing if new state matches location state', () => {
      const state = {
        persistent: { some: 'state' },
      };

      const newState = { ...state };

      const history = {
        location: {
          state: encode(state.persistent),
          pathname: 'somepath',
        },
        push: jest.fn(),
        replace: jest.fn(),
      };

      mockGetState.mockReturnValue(state);
      mockGetHistory.mockReturnValue(history);

      const { rerender } = renderHook(() => useWorkpadHistory());

      mockGetState.mockReturnValue(newState);
      rerender();

      expect(history.push).not.toBeCalled();
      expect(history.replace).not.toBeCalled();
    });
  });

  describe('changes to location', () => {
    test('changes to pathname have no effect', () => {
      // This is equivalent of navigating to a new page.
      // The location state will initially be undefined, but
      // we don't want to take any action because it will cause a state change
      // and that will be picked up and do the replace
      const state = {
        persistent: { some: 'state' },
      };

      const history = {
        location: {
          state: encode(state.persistent) as string | undefined,
          pathname: 'somepath',
        },
        push: jest.fn(),
        replace: jest.fn(),
      };

      mockGetState.mockReturnValue(state);
      mockGetHistory.mockReturnValue(history);

      const { rerender } = renderHook(() => useWorkpadHistory());

      history.location.state = undefined;
      history.location.pathname = 'newpath';

      rerender();

      expect(history.push).not.toBeCalled();
      expect(history.replace).not.toBeCalled();
    });

    test('changes to search does a replace', () => {
      // This is equivalent of going from full screen to not full screen
      // There is no state change that will occur, but we still need to update
      // the location state
      const state = {
        persistent: { some: 'state' },
      };

      const history = {
        location: {
          state: encode(state.persistent) as string | undefined,
          pathname: 'somepath',
          search: '',
        },
        push: jest.fn(),
        replace: jest.fn(),
      };

      mockGetState.mockReturnValue(state);
      mockGetHistory.mockReturnValue(history);

      const { rerender } = renderHook(() => useWorkpadHistory());
      history.location.pathname = 'somepath';
      history.location.search = 'newsearch';
      history.location.state = undefined;

      rerender();

      expect(history.push).not.toBeCalled();
      expect(history.replace).toBeCalledWith(
        `somepath?${history.location.search}`,
        encode(state.persistent)
      );
    });
  });
});
