/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { buildPath } from '@kbn/core-http-browser';
import {
  DASHBOARD_PLAYLIST_API_PATH,
  DASHBOARD_PLAYLIST_API_VERSION,
  type DashboardPlaylist,
  type DashboardPlaylistRequest,
} from '../../common/playlist';
import { coreServices } from '../services/kibana_services';

const playlistPath = (id?: string) =>
  id ? buildPath(`${DASHBOARD_PLAYLIST_API_PATH}/{id}`, { id }) : DASHBOARD_PLAYLIST_API_PATH;

export const playlistClient = {
  find: async () =>
    coreServices.http.get<DashboardPlaylist[]>(playlistPath(), {
      version: DASHBOARD_PLAYLIST_API_VERSION,
    }),
  get: async (id: string) =>
    coreServices.http.get<DashboardPlaylist>(playlistPath(id), {
      version: DASHBOARD_PLAYLIST_API_VERSION,
    }),
  create: async (playlist: DashboardPlaylistRequest) =>
    coreServices.http.post<DashboardPlaylist>(playlistPath(), {
      version: DASHBOARD_PLAYLIST_API_VERSION,
      body: JSON.stringify(playlist),
    }),
  update: async (id: string, playlist: DashboardPlaylistRequest) =>
    coreServices.http.put<DashboardPlaylist>(playlistPath(id), {
      version: DASHBOARD_PLAYLIST_API_VERSION,
      body: JSON.stringify(playlist),
    }),
  delete: async (id: string) =>
    coreServices.http.delete(playlistPath(id), {
      version: DASHBOARD_PLAYLIST_API_VERSION,
    }),
};
