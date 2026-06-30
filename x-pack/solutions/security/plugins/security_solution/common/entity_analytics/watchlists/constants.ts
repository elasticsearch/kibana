/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const MAX_WATCHLIST_NAME_LENGTH = 256;
export const MAX_WATCHLIST_DESCRIPTION_LENGTH = 1000;

export const WATCHLISTS_URL = `/api/entity_analytics/watchlists` as const;

/**
 * POST: ensures prebuilt watchlists for the active space (idempotent).
 */
export const WATCHLISTS_PREBUILT_INSTALL_URL = `${WATCHLISTS_URL}/install` as const;
export const WATCHLISTS_MANAGEMENT_URL = `${WATCHLISTS_URL}/management` as const;
export const WATCHLISTS_DATA_SOURCE_URL = `${WATCHLISTS_URL}/{watchlist_id}/entity_source` as const;
export const WATCHLISTS_DATA_SOURCE_LIST_URL = `${WATCHLISTS_DATA_SOURCE_URL}/list` as const;
export const WATCHLISTS_SYNC_URL = `${WATCHLISTS_URL}/{watchlist_id}/sync` as const;
export const WATCHLISTS_INDICES_URL = `${WATCHLISTS_URL}/indices` as const;
export const WATCHLISTS_CSV_UPLOAD_URL = `${WATCHLISTS_URL}/{watchlist_id}/csv_upload` as const;
export const WATCHLISTS_PRIVILEGES_URL = `${WATCHLISTS_URL}/privileges` as const;
export const WATCHLISTS_ENTITIES_ASSIGN_URL =
  `${WATCHLISTS_URL}/{watchlist_id}/entities/assign` as const;
export const WATCHLISTS_ENTITIES_UNASSIGN_URL =
  `${WATCHLISTS_URL}/{watchlist_id}/entities/unassign` as const;

const PRIVILEGED_USER_WATCHLIST_ID = 'privileged-user-monitoring-watchlist-id';
export const PRIVILEGED_USER_WATCHLIST_NAME = 'Privileged Users';

/** Saved object id for the prebuilt privileged-users watchlist in a given Kibana space. */
export const getPrivilegedUserWatchlistSavedObjectId = (namespace: string): string =>
  `${PRIVILEGED_USER_WATCHLIST_ID}-${namespace}`;

export const PREBUILT_WATCHLIST_NAMES: Record<string, string> = {
  [PRIVILEGED_USER_WATCHLIST_ID]: i18n.translate(
    'xpack.securitySolution.entityAnalytics.watchlists.prebuiltPrivName',
    {
      defaultMessage: 'Privileged User',
    }
  ),
};

export const getWatchlistName = (watchlistId: string): string =>
  PREBUILT_WATCHLIST_NAMES[watchlistId] ?? watchlistId;
