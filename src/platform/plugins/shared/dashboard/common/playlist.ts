/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const DASHBOARD_PLAYLIST_SAVED_OBJECT_TYPE = 'dashboard_playlist';
export const DASHBOARD_PLAYLIST_API_PATH = '/internal/dashboards/playlists';
export const DASHBOARD_PLAYLIST_API_VERSION = '1';
export const DEFAULT_PLAYLIST_DURATION = 30_000;

export interface DashboardPlaylistAttributes {
  name: string;
  dashboardIds: string[];
  duration: number;
}

export interface DashboardPlaylist extends DashboardPlaylistAttributes {
  id: string;
}

export interface DashboardPlaylistRequest {
  name: string;
  dashboardIds: string[];
  duration: number;
}

export const isValidPlaylistDuration = (duration: number) =>
  Number.isFinite(duration) && duration > 0;
