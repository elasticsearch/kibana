/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const SHOW_LAST_RUN_STORAGE_KEY = 'SyntheticsOverviewShowLastRun';

/**
 * Read the per-space "show last run for stale monitors" preference from
 * `localStorage` synchronously so the Redux initial state already reflects the
 * user's last choice (the `<ShowLastRunToggle>` writes the same key on change).
 *
 * Space scoping mirrors {@link getInitialShowFromAllSpaces}: the space id is
 * derived from the URL path (`…/s/{spaceId}/app/synthetics/…`, or `default`).
 */
export function getInitialShowLastRun(): boolean {
  try {
    const match = window.location.pathname.match(/\/s\/([^/]+)\//);
    const spaceId = match ? match[1] : 'default';
    const raw = localStorage.getItem(SHOW_LAST_RUN_STORAGE_KEY + spaceId);
    return raw ? JSON.parse(raw) === true : false;
  } catch {
    return false;
  }
}

export function persistShowLastRun(value: boolean): void {
  try {
    const match = window.location.pathname.match(/\/s\/([^/]+)\//);
    const spaceId = match ? match[1] : 'default';
    localStorage.setItem(SHOW_LAST_RUN_STORAGE_KEY + spaceId, JSON.stringify(value));
  } catch {
    // Ignore quota/availability errors — the Redux value still updates so the
    // toggle works for this session.
  }
}
