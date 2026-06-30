/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { SLORoutesDependencies } from '../../routes/utils/types';

interface Params {
  plugins: SLORoutesDependencies['plugins'];
  request: KibanaRequest;
  activeSpaceId: string;
}

export async function getAccessibleSpaceIds({
  plugins,
  request,
  activeSpaceId,
}: Params): Promise<string[]> {
  const spacesStart = await plugins.spaces?.start();
  if (!spacesStart) {
    return [activeSpaceId];
  }

  const spacesClient = spacesStart.spacesService.createSpacesClient(request);
  const allSpaces = await spacesClient.getAll();
  const spaceIds = allSpaces.map((space) => space.id);

  if (spaceIds.length === 0) {
    return [activeSpaceId];
  }

  const { authz } = plugins.security.setup;
  const { privileges } = await authz.checkPrivilegesWithRequest(request).atSpaces(spaceIds, {
    kibana: [authz.actions.api.get('slo_read')],
  });

  const authorizedSpaceIds = spaceIds.filter(
    (id) => privileges.kibana.find((p) => p.resource === id)?.authorized ?? false
  );

  return authorizedSpaceIds.length > 0 ? authorizedSpaceIds : [activeSpaceId];
}
