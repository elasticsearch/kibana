/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { refreshWorkpad } from './workpad';

const mockGet = jest.fn();

jest.mock('../selectors/workpad', () => ({
  getWorkpad: (state: any) => state.persistent.workpad,
  getWorkpadColors: () => [],
}));

jest.mock('../../services/canvas_workpad_service', () => ({
  getCanvasWorkpadService: () => ({ get: mockGet }),
}));

jest.mock('./elements', () => ({
  fetchAllRenderables: jest.fn(() => ({ type: 'fetchAllRenderables' })),
}));

jest.mock('./assets', () => ({
  setAssets: jest.fn((payload) => ({ type: 'setAssets', payload })),
}));

// createThunk types its action creators as returning an Action (for redux-actions
// compatibility), but at runtime they return a redux-thunk (dispatch, getState) fn.
type ThunkFn = (dispatch: jest.Mock, getState: () => unknown) => Promise<void>;

describe('refreshWorkpad', () => {
  const currentTimestamp = '2021-01-01T00:00:00.000Z';
  const newTimestamp = '2021-01-01T00:05:00.000Z';
  const currentWorkpad = { id: 'workpad-1', '@timestamp': currentTimestamp, pages: [] };
  const getState = () => ({ persistent: { workpad: currentWorkpad } });

  // Plain (non-thunk) actions that reach dispatch. dispatch executes any thunk it
  // receives (e.g. setWorkpad) so we can assert on the concrete actions produced.
  let dispatched: Array<{ type: string; payload?: unknown }>;
  let dispatch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    dispatched = [];
    dispatch = jest.fn((action) =>
      typeof action === 'function' ? action(dispatch, getState) : dispatched.push(action)
    );
  });

  const run = () => (refreshWorkpad() as unknown as ThunkFn)(dispatch, getState);

  test('reloads the workpad with assets stripped when the server @timestamp changed', async () => {
    mockGet.mockResolvedValue({
      id: 'workpad-1',
      '@timestamp': newTimestamp,
      assets: { a1: 'asset' },
      pages: [{ id: 'page-1' }],
    });

    await run();

    // Assets are restored separately, and setWorkpad receives the workpad WITHOUT
    // assets and with the new timestamp (which also re-runs every renderable).
    expect(dispatched).toContainEqual({ type: 'setAssets', payload: { a1: 'asset' } });
    expect(dispatched).toContainEqual({
      type: 'setWorkpad',
      payload: { id: 'workpad-1', '@timestamp': newTimestamp, pages: [{ id: 'page-1' }] },
    });
    expect(dispatched).toContainEqual({ type: 'fetchAllRenderables' }); // via setWorkpad
  });

  test('reloads without touching assets when the workpad has none', async () => {
    mockGet.mockResolvedValue({
      id: 'workpad-1',
      '@timestamp': newTimestamp,
      pages: [{ id: 'page-1' }],
    });

    await run();

    expect(dispatched).toContainEqual(expect.objectContaining({ type: 'setWorkpad' }));
    // No assets in the response → must not wipe the existing ones.
    expect(dispatched).not.toContainEqual(expect.objectContaining({ type: 'setAssets' }));
  });

  test('only refreshes data when the workpad is unchanged', async () => {
    mockGet.mockResolvedValue({
      id: 'workpad-1',
      '@timestamp': currentTimestamp,
      pages: [],
    });

    await run();

    expect(dispatched).toContainEqual({ type: 'fetchAllRenderables' });
    expect(dispatched).not.toContainEqual(expect.objectContaining({ type: 'setWorkpad' }));
    expect(dispatched).not.toContainEqual(expect.objectContaining({ type: 'setAssets' }));
  });

  test('falls back to a data refresh when the workpad cannot be fetched', async () => {
    mockGet.mockRejectedValue(new Error('network'));

    await run();

    expect(dispatched).toContainEqual({ type: 'fetchAllRenderables' });
    expect(dispatched).not.toContainEqual(expect.objectContaining({ type: 'setWorkpad' }));
  });
});
