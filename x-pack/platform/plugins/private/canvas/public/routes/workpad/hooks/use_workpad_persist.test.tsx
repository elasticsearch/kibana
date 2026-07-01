/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import crypto from 'crypto';
import { renderHook, waitFor } from '@testing-library/react';
import { useWorkpadPersist } from './use_workpad_persist';

const mockGetState = jest.fn();
const mockDispatch = jest.fn();
const mockUpdateWorkpad = jest.fn((): Promise<unknown> => Promise.resolve(null));
const mockUpdateAssets = jest.fn();
const mockUpdate = jest.fn();

const mockNotifyError = jest.fn();

// Mock the hooks and actions used by the UseWorkpad hook
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) => selector(mockGetState()),
}));

jest.mock('../../../state/actions/workpad', () => ({
  setWorkpadTimestamp: (timestamp: string) => ({ type: 'setWorkpadTimestamp', payload: timestamp }),
}));

jest.mock('../../../services/canvas_workpad_service', () => ({
  getCanvasWorkpadService: () => {
    return {
      updateWorkpad: mockUpdateWorkpad,
      updateAssets: mockUpdateAssets,
      update: mockUpdate,
    };
  },
}));

jest.mock('../../../services', () => ({
  useNotifyService: () => ({
    error: mockNotifyError,
  }),
}));

describe('useWorkpadPersist', () => {
  const initialState = {
    persistent: {
      workpad: { id: crypto.randomUUID(), some: 'workpad' },
    },
    assets: {
      asset1: 'some asset',
      asset2: 'other asset',
    },
  };

  beforeEach(() => {
    // create a default state for each test
    mockGetState.mockReturnValue(initialState);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initial render does not persist state', () => {
    renderHook(useWorkpadPersist);

    expect(mockUpdateWorkpad).not.toBeCalled();
  });

  test('changes to workpad cause a workpad update', () => {
    const { rerender } = renderHook(useWorkpadPersist);

    const newState = {
      ...initialState,
      persistent: {
        workpad: { id: crypto.randomUUID(), new: 'workpad' },
      },
    };

    mockGetState.mockReturnValue(newState);

    rerender();

    expect(mockUpdateWorkpad).toHaveBeenCalled();
  });

  test('non changes causes no updated', () => {
    const { rerender } = renderHook(useWorkpadPersist);

    rerender();

    expect(mockUpdateWorkpad).not.toHaveBeenCalled();
  });

  test('non write permissions causes no updates', () => {
    const { rerender } = renderHook(useWorkpadPersist);

    const newState = {
      persistent: {
        workpad: { id: crypto.randomUUID(), new: 'workpad value' },
      },
      transient: {
        canUserWrite: false,
      },
    };

    mockGetState.mockReturnValue(newState);

    rerender();

    expect(mockUpdateWorkpad).not.toHaveBeenCalled();
  });

  test('does not persist a workpad reloaded from the server', () => {
    const id = crypto.randomUUID();
    mockGetState.mockReturnValue({
      ...initialState,
      persistent: { workpad: { id, '@timestamp': '2021-01-01T00:00:00.000Z', pages: [] } },
    });

    const { rerender } = renderHook(useWorkpadPersist);

    // Auto-refresh reload: same workpad, but the server bumped @timestamp because
    // it was edited elsewhere. This must not be echoed back to the server.
    mockGetState.mockReturnValue({
      ...initialState,
      persistent: {
        workpad: { id, '@timestamp': '2021-01-01T00:05:00.000Z', pages: [{ id: 'page-1' }] },
      },
    });
    rerender();

    expect(mockUpdateWorkpad).not.toHaveBeenCalled();
  });

  test('persists a local edit, which leaves @timestamp untouched', () => {
    const id = crypto.randomUUID();
    mockGetState.mockReturnValue({
      ...initialState,
      persistent: { workpad: { id, '@timestamp': '2021-01-01T00:00:00.000Z', pages: [] } },
    });

    const { rerender } = renderHook(useWorkpadPersist);

    // Local edit: content changes but @timestamp is unchanged (only the server stamps it).
    mockGetState.mockReturnValue({
      ...initialState,
      persistent: {
        workpad: { id, '@timestamp': '2021-01-01T00:00:00.000Z', pages: [{ id: 'page-1' }] },
      },
    });
    rerender();

    expect(mockUpdateWorkpad).toHaveBeenCalled();
  });

  test('syncs the server @timestamp into state after a successful save', async () => {
    const id = crypto.randomUUID();
    const serverTimestamp = '2021-01-01T00:05:00.000Z';
    mockUpdateWorkpad.mockResolvedValueOnce({ ok: true, '@timestamp': serverTimestamp });

    mockGetState.mockReturnValue({
      ...initialState,
      persistent: { workpad: { id, '@timestamp': '2021-01-01T00:00:00.000Z', pages: [] } },
    });
    const { rerender } = renderHook(useWorkpadPersist);

    // Local edit triggers a save; the server responds with a freshly stamped @timestamp.
    mockGetState.mockReturnValue({
      ...initialState,
      persistent: {
        workpad: { id, '@timestamp': '2021-01-01T00:00:00.000Z', pages: [{ id: 'page-1' }] },
      },
    });
    rerender();

    expect(mockUpdateWorkpad).toHaveBeenCalled();
    await waitFor(() =>
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'setWorkpadTimestamp',
        payload: serverTimestamp,
      })
    );
  });

  test('does not sync a timestamp when the save response omits one', async () => {
    const id = crypto.randomUUID();
    // Legacy/rolling-upgrade server that still returns a bare ok response.
    mockUpdateWorkpad.mockResolvedValueOnce({ ok: true });

    mockGetState.mockReturnValue({
      ...initialState,
      persistent: { workpad: { id, '@timestamp': '2021-01-01T00:00:00.000Z', pages: [] } },
    });
    const { rerender } = renderHook(useWorkpadPersist);

    mockGetState.mockReturnValue({
      ...initialState,
      persistent: {
        workpad: { id, '@timestamp': '2021-01-01T00:00:00.000Z', pages: [{ id: 'page-1' }] },
      },
    });
    rerender();

    expect(mockUpdateWorkpad).toHaveBeenCalled();
    // Flush the resolved update promise, then assert no timestamp sync was dispatched.
    await waitFor(() => expect(mockUpdateWorkpad).toHaveBeenCalled());
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
