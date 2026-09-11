/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DashboardPlaylist } from '../../common/playlist';

export interface PlaylistPlaybackState {
  index: number;
  isPlaying: boolean;
  unavailable: string[];
  error?: string;
}

export interface PlaylistPlaybackController {
  getState: () => PlaylistPlaybackState;
  subscribe: (listener: (state: PlaylistPlaybackState) => void) => () => void;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  stop: () => void;
}

interface PlaylistPlaybackControllerOptions {
  playlist: DashboardPlaylist;
  onNavigate: (dashboardId: string) => Promise<boolean>;
}

export const createPlaylistPlaybackController = ({
  playlist,
  onNavigate,
}: PlaylistPlaybackControllerOptions): PlaylistPlaybackController => {
  const listeners = new Set<(state: PlaylistPlaybackState) => void>();
  const unavailable = new Set<string>();
  let index = 0;
  let isPlaying = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let transitionInProgress = false;
  let error: string | undefined;
  let generation = 0;

  const state = (): PlaylistPlaybackState => ({
    index,
    isPlaying,
    unavailable: [...unavailable],
    ...(error ? { error } : {}),
  });
  const notify = () => listeners.forEach((listener) => listener(state()));
  const clearTimer = () => {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
  };
  const schedule = () => {
    clearTimer();
    if (isPlaying) timeout = setTimeout(() => void move(1), playlist.duration);
  };
  const move = async (direction: 1 | -1) => {
    if (transitionInProgress || playlist.dashboardIds.length === 0) return;
    transitionInProgress = true;
    clearTimer();
    error = undefined;
    const transitionGeneration = generation;
    const count = playlist.dashboardIds.length;
    for (let offset = 0; offset < count; offset++) {
      const candidateIndex = (index + direction * (offset + 1) + count * 2) % count;
      const candidateId = playlist.dashboardIds[candidateIndex];
      if (unavailable.has(candidateId)) continue;
      let navigated = false;
      try {
        navigated = await onNavigate(candidateId);
      } catch (navigationError) {
        error =
          navigationError instanceof Error
            ? navigationError.message
            : 'Unable to navigate to the dashboard.';
      }
      if (transitionGeneration !== generation) {
        transitionInProgress = false;
        return;
      }
      if (navigated) {
        error = undefined;
        index = candidateIndex;
        transitionInProgress = false;
        notify();
        schedule();
        return;
      }
      unavailable.add(candidateId);
    }
    isPlaying = false;
    error ??= 'No dashboards in this playlist are available.';
    transitionInProgress = false;
    notify();
  };
  const start = async () => {
    if (playlist.dashboardIds.length === 0 || transitionInProgress) return;
    isPlaying = true;
    unavailable.clear();
    error = undefined;
    transitionInProgress = true;
    const startGeneration = generation;
    let navigated = false;
    try {
      navigated = await onNavigate(playlist.dashboardIds[index]);
    } catch (navigationError) {
      error =
        navigationError instanceof Error
          ? navigationError.message
          : 'Unable to navigate to the dashboard.';
    }
    if (startGeneration !== generation) {
      transitionInProgress = false;
      return;
    }
    if (!navigated) unavailable.add(playlist.dashboardIds[index]);
    transitionInProgress = false;
    if (navigated) schedule();
    else await move(1);
    notify();
  };

  return {
    getState: state,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state());
      return () => listeners.delete(listener);
    },
    start,
    pause: () => {
      isPlaying = false;
      clearTimer();
      notify();
    },
    resume: async () => {
      if (playlist.dashboardIds.length === unavailable.size) {
        unavailable.clear();
        error = undefined;
        await start();
        return;
      }
      if (!isPlaying) {
        isPlaying = true;
        schedule();
        notify();
      }
    },
    next: () => move(1),
    previous: () => move(-1),
    stop: () => {
      generation += 1;
      isPlaying = false;
      clearTimer();
      transitionInProgress = false;
      listeners.clear();
    },
  };
};
