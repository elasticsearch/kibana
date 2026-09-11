/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject, combineLatest, firstValueFrom, map, Subject } from 'rxjs';
import { initializeHistoryManager } from './history_manager';
import { getSampleDashboardState } from '../mocks';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { waitFor } from '@testing-library/react';

const makeSetup = async () => {
  const initialState = getSampleDashboardState();
  // Mutable ref so getState's implementation is never replaced (mockReturnValue would drop the
  // getStateCalled$.next() side-effect; updating stateRef keeps the implementation intact).
  const stateRef = { current: { ...initialState } as DashboardState };

  const getState = jest.fn((): DashboardState => {
    return { ...stateRef.current };
  });

  const setState = jest.fn(async (state: DashboardState) => {
    stateRef.current = state;
  });

  const anyStateChange$ = new Subject<void>();
  const hasOverlays$ = new BehaviorSubject<boolean>(false);
  const dataLoading$ = new BehaviorSubject<boolean>(false);
  const initialState$ = new Subject<DashboardState>();

  const { internalApi, cleanup } = initializeHistoryManager({
    anyStateChange$,
    hasOverlays$,
    setState,
    getState,
    dataLoading$,
    initialState$,
  });

  const disabledActions$ = combineLatest([internalApi.canUndo$, internalApi.canRedo$]).pipe(
    map(([canUndo, canRedo]) => ({
      undo: !canUndo,
      redo: !canRedo,
    }))
  );

  const api = { ...internalApi, disabledActions$ };

  initialState$.next({ ...initialState }); // seed history with the initial state

  return {
    api,
    cleanup: () => {
      cleanup();
      getState.mockClear();
      setState.mockClear();
    },
    anyStateChange$,
    hasOverlays$,
    dataLoading$,
    getState,
    setState,
    initialState,
    stateRef,
  };
};

// trigger a state change and resolve once getState has been called (after the debounce).
const pushStateChange = async (
  setup: Awaited<ReturnType<typeof makeSetup>>,
  title = 'Updated Title'
) => {
  setup.stateRef.current = { ...setup.initialState, title };
  setup.anyStateChange$.next();
  await waitFor(() => expect(setup.getState).toBeCalled());
};

describe('initializeHistoryManager', () => {
  describe('state management', () => {
    it('calls getState when anyStateChange$ emits with no overlays or loading', async () => {
      const setup = await makeSetup();
      await pushStateChange(setup);
      expect(setup.getState).toHaveBeenCalled();
      setup.cleanup();
    });

    it('skips getState when hasOverlays$ is true', async () => {
      const setup = await makeSetup();
      setup.hasOverlays$.next(true);
      setup.anyStateChange$.next();
      // wait for debounceTime(0) to fire and be filtered
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(setup.getState).not.toHaveBeenCalled();
      setup.cleanup();
    });

    it('skips getState when dataLoading$ is true', async () => {
      const setup = await makeSetup();
      setup.dataLoading$.next(true);
      setup.anyStateChange$.next();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(setup.getState).not.toHaveBeenCalled();
      setup.cleanup();
    });

    it('resumes after overlays are dismissed', async () => {
      const setup = await makeSetup();
      setup.hasOverlays$.next(true);
      setup.anyStateChange$.next();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(setup.getState).not.toHaveBeenCalled();

      setup.hasOverlays$.next(false);
      await pushStateChange(setup, 'After Overlay');
      expect(setup.getState).toHaveBeenCalled();
      setup.cleanup();
    });
  });

  describe('disabledActions$', () => {
    it('disables undo and redo when hasOverlays$ becomes true', async () => {
      const setup = await makeSetup();
      await pushStateChange(setup, 'Change 1');
      await waitFor(async () =>
        expect(await firstValueFrom(setup.api.disabledActions$)).toEqual({
          undo: false,
          redo: true,
        })
      );

      setup.hasOverlays$.next(true);
      expect(await firstValueFrom(setup.api.disabledActions$)).toEqual({
        undo: true,
        redo: true,
      });
      setup.cleanup();
    });

    it('disables undo and redo when dataLoading$ becomes true', async () => {
      const setup = await makeSetup();
      await pushStateChange(setup, 'Change 1');
      expect(await firstValueFrom(setup.api.disabledActions$)).toEqual({
        undo: false,
        redo: true,
      });

      setup.dataLoading$.next(true);
      expect(await firstValueFrom(setup.api.disabledActions$)).toEqual({
        undo: true,
        redo: true,
      });
      setup.cleanup();
    });

    it('re-enables undo once overlays are dismissed', async () => {
      const setup = await makeSetup();
      await pushStateChange(setup, 'Change 1');
      expect((await firstValueFrom(setup.api.disabledActions$)).undo).toEqual(false);
      setup.hasOverlays$.next(true);
      expect((await firstValueFrom(setup.api.disabledActions$)).undo).toEqual(true);
      setup.hasOverlays$.next(false);
      expect((await firstValueFrom(setup.api.disabledActions$)).undo).toEqual(false);
      setup.cleanup();
    });
  });

  describe('undo', () => {
    it('calls setState with the previous state', async () => {
      const setup = await makeSetup();
      await pushStateChange(setup, 'Change 1');
      expect(await firstValueFrom(setup.api.disabledActions$)).toEqual({
        undo: false,
        redo: true,
      });
      await setup.api.undo();
      expect(setup.setState).toBeCalledWith(setup.initialState);
      setup.cleanup();
    });

    it('reflects that undo is disabled when overlays are open', async () => {
      const setup = await makeSetup();
      await pushStateChange(setup, 'Change 1');
      setup.hasOverlays$.next(true);
      expect((await firstValueFrom(setup.api.disabledActions$)).undo).toBe(true);
      setup.cleanup();
    });

    it('reflects that undo is disabled when there is no history', async () => {
      const setup = await makeSetup();
      expect((await firstValueFrom(setup.api.disabledActions$)).undo).toBe(true);
      setup.cleanup();
    });
  });

  describe('redo', () => {
    it('calls setState with the re-applied state after an undo', async () => {
      const setup = await makeSetup();
      await pushStateChange(setup, 'Change 1');
      await setup.api.undo();
      expect(setup.setState).toBeCalledWith(setup.initialState);
      await setup.api.redo();
      expect(setup.setState).toBeCalledWith({ ...setup.initialState, title: 'Change 1' });
      setup.cleanup();
    });
  });

  describe('cleanup', () => {
    it('stops pushing state to history after cleanup', async () => {
      const setup = await makeSetup();
      setup.cleanup();
      // Subscription gone — no debounce timer starts, getState is never called.
      setup.anyStateChange$.next();
      expect(setup.getState).not.toHaveBeenCalled();
    });
  });
});
