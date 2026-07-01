/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAction } from 'redux-actions';
import { without, includes } from 'lodash';
import { createThunk } from '../../lib/create_thunk';
import { getWorkpad, getWorkpadColors } from '../selectors/workpad';
// @ts-expect-error
import { fetchAllRenderables } from './elements';
// @ts-expect-error untyped local
import { setAssets } from './assets';
import { getCanvasWorkpadService } from '../../services/canvas_workpad_service';
import type { CanvasWorkpad, CanvasVariable } from '../../../types';

export const sizeWorkpad = createAction<{ height: number; width: number }>('sizeWorkpad');
export const setName = createAction<string>('setName');
export const setWriteable = createAction<boolean>('setWriteable');
export const setColors = createAction<string[]>('setColors');
export const setRefreshInterval = createAction<number>('setRefreshInterval');
export const setWorkpadCSS = createAction<string>('setWorkpadCSS');
export const setWorkpadVariables = createAction<CanvasVariable[]>('setWorkpadVariables');
export const enableAutoplay = createAction<boolean>('enableAutoplay');
export const setAutoplayInterval = createAction<number>('setAutoplayInterval');
// The server re-stamps `@timestamp` on every save. This lets the client sync that
// new value back into state after a successful persist, so the auto-refresh reload
// doesn't mistake the client's own save for an external change (see refreshWorkpad
// and useWorkpadPersist).
export const setWorkpadTimestamp = createAction<string>('setWorkpadTimestamp');
export const resetWorkpad = createAction<void>('resetWorkpad');

export const initializeWorkpad = createThunk('initializeWorkpad', ({ dispatch }) => {
  dispatch(fetchAllRenderables());
});

export const addColor = createThunk('addColor', ({ dispatch, getState }, color: string) => {
  const colors = getWorkpadColors(getState()).slice(0);
  if (!includes(colors, color)) {
    colors.push(color);
  }
  dispatch(setColors(colors));
});

export const removeColor = createThunk('removeColor', ({ dispatch, getState }, color: string) => {
  dispatch(setColors(without(getWorkpadColors(getState()), color)));
});

export const updateWorkpadVariables = createThunk(
  'updateWorkpadVariables',
  ({ dispatch }, vars) => {
    dispatch(setWorkpadVariables(vars));
    dispatch(fetchAllRenderables());
  }
);

export const setWorkpad = createThunk(
  'setWorkpad',
  (
    { dispatch, type },
    workpad: Omit<CanvasWorkpad, 'assets'>,
    { loadPages = true }: { loadPages?: boolean } = {}
  ) => {
    dispatch(createAction(type)(workpad)); // set the workpad object in state
    if (loadPages) {
      dispatch(initializeWorkpad());
    }
  }
);

// Re-fetches the workpad from the server so a running session (e.g. an
// auto-refreshing fullscreen presentation) picks up structural changes — pages
// added/removed, elements edited — made to the source workpad elsewhere.
//
// The server stamps `@timestamp` on every save, and local edits never touch it,
// so a differing `@timestamp` reliably means the source changed. Only then do we
// replace the workpad (which also re-runs every renderable); otherwise we fall
// back to the cheaper data-only refresh. useWorkpadPersist keys off the same
// `@timestamp` change to avoid echoing a server reload straight back.
export const refreshWorkpad = createThunk('refreshWorkpad', async ({ dispatch, getState }) => {
  const currentWorkpad = getWorkpad(getState());

  let latestWorkpad: CanvasWorkpad;
  try {
    latestWorkpad = await getCanvasWorkpadService().get(currentWorkpad.id);
  } catch (e) {
    // If the workpad can't be re-fetched, still refresh the data we already
    // have so the auto-refresh cycle keeps running.
    dispatch(fetchAllRenderables());
    return;
  }

  if (latestWorkpad['@timestamp'] !== currentWorkpad['@timestamp']) {
    const { assets, ...workpad } = latestWorkpad;
    if (assets) {
      dispatch(setAssets(assets));
    }
    dispatch(setWorkpad(workpad));
  } else {
    dispatch(fetchAllRenderables());
  }
});
