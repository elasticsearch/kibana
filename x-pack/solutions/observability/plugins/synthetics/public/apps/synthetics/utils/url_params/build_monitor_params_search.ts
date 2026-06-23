/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Builds the URL search string used by monitor-scoped links and breadcrumbs.
 *
 * `remoteName` must be preserved on remote (CCS) clusters so links don't drop
 * into the local saved-object 404 page; `locationId` and `spaceId` keep the
 * destination scoped to the user's current context.
 *
 * Returns a string with a leading `?` when any param is set, or an empty
 * string otherwise (safe to interpolate directly into an href template).
 */
export const buildMonitorParamsSearch = ({
  locationId,
  spaceId,
  remoteName,
}: {
  locationId?: string;
  spaceId?: string;
  remoteName?: string;
}): string => {
  const params = new URLSearchParams();
  if (locationId) params.set('locationId', locationId);
  if (spaceId) params.set('spaceId', spaceId);
  if (remoteName) params.set('remoteName', remoteName);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};
