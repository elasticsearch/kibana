/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createPlaylistPlaybackController } from './playlist_playback_controller';

describe('playlist playback controller', () => {
  jest.useFakeTimers();

  const create = (ids = ['a', 'b', 'c']) => {
    const navigated: string[] = [];
    const controller = createPlaylistPlaybackController({
      playlist: { id: 'playlist', name: 'Wall', dashboardIds: ids, duration: 1000 },
      onNavigate: async (id) => {
        navigated.push(id);
        return true;
      },
    });
    return { controller, navigated };
  };

  afterEach(() => jest.clearAllTimers());

  it('starts at the first dashboard and wraps on timer advancement', async () => {
    const { controller, navigated } = create();
    await controller.start();
    expect(navigated).toEqual(['a']);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(navigated).toEqual(['a', 'b']);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(navigated).toEqual(['a', 'b', 'c', 'a']);
  });

  it('pauses and resumes without duplicating timers', async () => {
    const { controller, navigated } = create();
    await controller.start();
    controller.pause();
    jest.advanceTimersByTime(2000);
    expect(navigated).toEqual(['a']);
    await controller.resume();
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(navigated).toEqual(['a', 'b']);
  });

  it('skips unavailable dashboards', async () => {
    const navigated: string[] = [];
    const controller = createPlaylistPlaybackController({
      playlist: { id: 'playlist', name: 'Wall', dashboardIds: ['a', 'b'], duration: 1000 },
      onNavigate: async (id) => {
        navigated.push(id);
        return id !== 'b';
      },
    });
    await controller.start();
    await controller.next();
    expect(navigated).toEqual(['a', 'b', 'a']);
    expect(controller.getState().isPlaying).toBe(true);
  });

  it('stops with an error when navigation fails for every dashboard', async () => {
    const controller = createPlaylistPlaybackController({
      playlist: { id: 'playlist', name: 'Wall', dashboardIds: ['a', 'b'], duration: 1000 },
      onNavigate: async () => {
        throw new Error('Dashboard failed to load');
      },
    });

    await controller.start();

    expect(controller.getState()).toEqual({
      index: 0,
      isPlaying: false,
      unavailable: ['a', 'b'],
      error: 'Dashboard failed to load',
    });
  });

  it('cleans up the timer when stopped', async () => {
    const { controller, navigated } = create();
    await controller.start();

    controller.stop();
    jest.advanceTimersByTime(2000);
    await Promise.resolve();

    expect(navigated).toEqual(['a']);
  });

  it('ignores a navigation that resolves after the controller stops', async () => {
    let resolveNavigation: ((value: boolean) => void) | undefined;
    const navigation = new Promise<boolean>((resolve) => {
      resolveNavigation = resolve;
    });
    const navigated: string[] = [];
    const controller = createPlaylistPlaybackController({
      playlist: { id: 'playlist', name: 'Wall', dashboardIds: ['a'], duration: 1000 },
      onNavigate: async (id) => {
        navigated.push(id);
        return navigation;
      },
    });

    const startPromise = controller.start();
    controller.stop();
    resolveNavigation?.(true);
    await startPromise;

    expect(controller.getState().isPlaying).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears a transient navigation error after recovery', async () => {
    let bAttempts = 0;
    const controller = createPlaylistPlaybackController({
      playlist: { id: 'playlist', name: 'Wall', dashboardIds: ['a', 'b'], duration: 1000 },
      onNavigate: async (id) => {
        if (id === 'b' && ++bAttempts === 1) throw new Error('Dashboard unavailable');
        return true;
      },
    });

    await controller.start();
    await controller.next();

    expect(controller.getState().error).toBeUndefined();
    expect(controller.getState().isPlaying).toBe(true);
  });
});
