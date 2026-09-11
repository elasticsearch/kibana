/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, renderHook } from '@testing-library/react';
import { getFlyoutManagerStore } from '@elastic/eui';
import { usePaginatedFlyout } from './use_paginated_flyout';
import {
  FLYOUT_ORIGIN,
  FLYOUT_SESSION_KIND,
  FLYOUT_SURFACE,
  FLYOUT_TYPE,
} from '../../../common/lib/telemetry';
import { useOpenFlyout } from '../../shared/hooks/use_open_flyout';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../shared/hooks/use_open_flyout');

jest.mock('../../shared/hooks/use_default_flyout_properties', () => ({
  useDefaultDocumentFlyoutProperties: jest.fn().mockReturnValue({}),
}));

// Only the flyout-manager store is faked; `useGeneratedHtmlId` must stay real so the hook
// still mints the id it registers the overlay under.
jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  getFlyoutManagerStore: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type HookOptions = Parameters<typeof usePaginatedFlyout>[0];

const TEST_HISTORY_KEY = Symbol('test-key');

const makeOptions = (overrides?: Partial<HookOptions>): HookOptions => ({
  resolveDocument: jest.fn().mockReturnValue(null),
  renderBody: jest.fn().mockReturnValue(null),
  historyKey: TEST_HISTORY_KEY,
  origin: FLYOUT_ORIGIN.ALERTS_TABLE,
  ...overrides,
});

interface FakeSession {
  mainFlyoutId: string;
  childFlyoutId: string | null;
  historyKey: symbol;
}

/** Fakes what the EUI flyout manager currently has open. */
const mockFlyoutManagerSessions = (sessions: FakeSession[]): void => {
  jest.mocked(getFlyoutManagerStore).mockReturnValue({
    getState: () => ({ sessions }),
  } as unknown as ReturnType<typeof getFlyoutManagerStore>);
};

/** The EUI id the hook registered its overlay under, read back from the open call. */
const openedFlyoutId = (openFlyoutMock: jest.Mock): string =>
  openFlyoutMock.mock.calls[openFlyoutMock.mock.calls.length - 1][1].id;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePaginatedFlyout', () => {
  const close = jest.fn();
  const openFlyout = jest.fn().mockReturnValue({ close });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useOpenFlyout).mockReturnValue(openFlyout);
    mockFlyoutManagerSessions([]);
  });

  it('openDocumentFlyout is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => usePaginatedFlyout(makeOptions()));
    const first = result.current.openDocumentFlyout;
    rerender();
    expect(result.current.openDocumentFlyout).toBe(first);
  });

  it('setState writes to the store', () => {
    const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));

    act(() => {
      result.current.setState({ flyoutDocumentIndex: 5, totalDocumentCount: 50 });
    });

    expect(result.current.slice.flyoutDocumentIndex).toBe(5);
    expect(result.current.slice.totalDocumentCount).toBe(50);
  });

  it('closePaginatedFlyout soft-resets displayed-document fields and preserves openDocumentFlyoutImpl', () => {
    const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));

    act(() => {
      result.current.setState({
        flyoutDocumentIndex: 3,
        flyoutDocumentId: 'alert-1',
        flyoutDocumentIndexName: 'index-1',
        totalDocumentCount: 10,
      });
    });

    act(() => {
      result.current.closePaginatedFlyout();
    });

    // Document-state fields are cleared
    expect(result.current.slice.flyoutDocumentIndex).toBeNull();
    expect(result.current.slice.flyoutDocumentId).toBeNull();
    expect(result.current.slice.flyoutDocumentIndexName).toBeNull();
    expect(result.current.slice.isFlyoutDocumentLoading).toBe(false);
    // totalDocumentCount is source-level state and survives the soft-reset
    expect(result.current.slice.totalDocumentCount).toBe(10);
    // openDocumentFlyoutImpl is still registered (set by the useEffect)
    expect(result.current.slice.openDocumentFlyoutImpl).not.toBeNull();
  });

  it('openDocumentFlyoutImpl survives an open → close → open cycle (regression)', () => {
    const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));

    // First open
    act(() => {
      result.current.openPaginatedFlyout(0);
    });
    expect(openFlyout).toHaveBeenCalledTimes(1);

    // Close
    act(() => {
      result.current.closePaginatedFlyout();
    });

    // Second open — openDocumentFlyoutImpl must still be registered
    act(() => {
      result.current.openPaginatedFlyout(1);
    });
    expect(openFlyout).toHaveBeenCalledTimes(2);

    // Third cycle
    act(() => {
      result.current.closePaginatedFlyout();
    });
    act(() => {
      result.current.openPaginatedFlyout(2);
    });
    expect(openFlyout).toHaveBeenCalledTimes(3);
  });

  it('registers openDocumentFlyoutImpl after mount', () => {
    const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));
    expect(result.current.slice.openDocumentFlyoutImpl).not.toBeNull();
  });

  it('clears the overlay on unmount when one is open', () => {
    const { result, unmount } = renderHook(() => usePaginatedFlyout(makeOptions()));

    act(() => {
      result.current.openPaginatedFlyout(0);
    });

    unmount();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('two concurrent hook instances have isolated stores', () => {
    const { result: r1 } = renderHook(() => usePaginatedFlyout(makeOptions()));
    const { result: r2 } = renderHook(() => usePaginatedFlyout(makeOptions()));

    act(() => {
      r1.current.setState({ flyoutDocumentIndex: 5, totalDocumentCount: 50 });
    });

    expect(r1.current.slice.flyoutDocumentIndex).toBe(5);
    expect(r2.current.slice.flyoutDocumentIndex).toBeNull();
  });

  it('openPaginatedFlyout calls resolveDocument and sets flyoutDocumentIndex', () => {
    const resolveDocument = jest.fn().mockReturnValue(null);
    const { result } = renderHook(() => usePaginatedFlyout(makeOptions({ resolveDocument })));

    act(() => {
      result.current.openPaginatedFlyout(5);
    });

    expect(resolveDocument).toHaveBeenCalled();
    expect(result.current.slice.flyoutDocumentIndex).toBe(5);
  });

  describe('system flyout lifecycle', () => {
    it('opens one instrumented V2 flyout on repeated pagination requests', () => {
      const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));

      act(() => {
        result.current.openPaginatedFlyout(0);
        result.current.openPaginatedFlyout(1);
      });

      expect(openFlyout).toHaveBeenCalledTimes(1);
      const [element, options, meta] = openFlyout.mock.calls[0];
      // The first arg is a PaginationStoreProvider wrapping the body
      expect(element.props.value).toMatchObject({
        subscribe: expect.any(Function),
        getSnapshot: expect.any(Function),
        setState: expect.any(Function),
      });
      expect(options).toMatchObject({
        historyKey: TEST_HISTORY_KEY,
        session: FLYOUT_SESSION_KIND.START,
      });
      expect(meta).toEqual({
        surface: FLYOUT_SURFACE.FLYOUT,
        flyoutType: FLYOUT_TYPE.DOCUMENT,
        session: FLYOUT_SESSION_KIND.START,
        origin: FLYOUT_ORIGIN.ALERTS_TABLE,
      });
    });

    // The id is what lets the hook recognise its own flyout in the EUI flyout manager, so it
    // has to reach the overlay and stay put across opens. (Uniqueness between hook instances
    // comes from `useGeneratedHtmlId` and cannot be asserted here: Kibana's jest setup stubs
    // `htmlIdGenerator` with a deterministic value.)
    it('registers the overlay under an id that is stable across opens', () => {
      const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));

      act(() => {
        result.current.openDocumentFlyout(0);
      });
      const firstId = openedFlyoutId(openFlyout);

      act(() => {
        result.current.closePaginatedFlyout();
      });
      act(() => {
        result.current.openDocumentFlyout(1);
      });

      expect(firstId).toEqual(expect.any(String));
      expect(openedFlyoutId(openFlyout)).toBe(firstId);
    });

    it('closePaginatedFlyout closes the V2 overlay', () => {
      const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));

      act(() => {
        result.current.openPaginatedFlyout(0);
      });

      act(() => {
        result.current.closePaginatedFlyout();
      });

      expect(close).toHaveBeenCalled();
    });
  });

  describe('openDocumentFlyout (source-driven opens)', () => {
    // Opens the flyout and tells the fake flyout manager what is currently stacked over it.
    const openThenStack = (
      result: { current: ReturnType<typeof usePaginatedFlyout> },
      stack: (flyoutId: string) => FakeSession[]
    ) => {
      act(() => {
        result.current.openDocumentFlyout(0);
      });
      mockFlyoutManagerSessions(stack(openedFlyoutId(openFlyout)));
    };

    it('swaps the document in place while the flyout still owns the screen', () => {
      const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));

      openThenStack(result, (flyoutId) => [
        { mainFlyoutId: flyoutId, childFlyoutId: null, historyKey: TEST_HISTORY_KEY },
      ]);

      act(() => {
        result.current.openDocumentFlyout(1);
      });

      expect(openFlyout).toHaveBeenCalledTimes(1);
      expect(close).not.toHaveBeenCalled();
      expect(result.current.slice.flyoutDocumentIndex).toBe(1);
    });

    it('restarts the session when a document is open as a child of the flyout', () => {
      const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));

      openThenStack(result, (flyoutId) => [
        { mainFlyoutId: flyoutId, childFlyoutId: 'child-flyout', historyKey: TEST_HISTORY_KEY },
      ]);

      act(() => {
        result.current.openDocumentFlyout(1);
      });

      expect(close).toHaveBeenCalledTimes(1);
      expect(openFlyout).toHaveBeenCalledTimes(2);
      expect(result.current.slice.flyoutDocumentIndex).toBe(1);
    });

    it('restarts the session when a tool flyout stacked a new session on top', () => {
      const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));

      openThenStack(result, (flyoutId) => [
        { mainFlyoutId: flyoutId, childFlyoutId: null, historyKey: TEST_HISTORY_KEY },
        { mainFlyoutId: 'tool-flyout', childFlyoutId: null, historyKey: TEST_HISTORY_KEY },
      ]);

      act(() => {
        result.current.openDocumentFlyout(1);
      });

      expect(close).toHaveBeenCalledTimes(1);
      expect(openFlyout).toHaveBeenCalledTimes(2);
    });

    it('restarts the session when an earlier session shares the history group', () => {
      const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));

      openThenStack(result, (flyoutId) => [
        { mainFlyoutId: 'rule-flyout', childFlyoutId: null, historyKey: TEST_HISTORY_KEY },
        { mainFlyoutId: flyoutId, childFlyoutId: null, historyKey: TEST_HISTORY_KEY },
      ]);

      act(() => {
        result.current.openDocumentFlyout(1);
      });

      expect(close).toHaveBeenCalledTimes(1);
      expect(openFlyout).toHaveBeenCalledTimes(2);
    });

    it('ignores sessions belonging to another history group', () => {
      const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));

      openThenStack(result, (flyoutId) => [
        { mainFlyoutId: 'unrelated-flyout', childFlyoutId: null, historyKey: Symbol('other-key') },
        { mainFlyoutId: flyoutId, childFlyoutId: null, historyKey: TEST_HISTORY_KEY },
      ]);

      act(() => {
        result.current.openDocumentFlyout(1);
      });

      expect(close).not.toHaveBeenCalled();
      expect(openFlyout).toHaveBeenCalledTimes(1);
    });

    it('does not restart the session for in-flyout pagination', () => {
      const { result } = renderHook(() => usePaginatedFlyout(makeOptions()));

      openThenStack(result, (flyoutId) => [
        { mainFlyoutId: flyoutId, childFlyoutId: 'child-flyout', historyKey: TEST_HISTORY_KEY },
      ]);

      act(() => {
        result.current.openPaginatedFlyout(1);
      });

      expect(close).not.toHaveBeenCalled();
      expect(openFlyout).toHaveBeenCalledTimes(1);
    });
  });
});
