/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { HttpFetchOptionsWithPath, HttpSetup, IUiSettingsClient } from '@kbn/core/public';
import { useEffect } from 'react';
import { EntityStoreStatus } from '../../common';
import { ENTITY_STORE_ROUTES } from '../../common';
import type { StatusRequestQuery } from '../../server/routes/apis/status';

export interface Services {
  http: HttpSetup;
  uiSettings: IUiSettingsClient;
  logger: Logger;
  spaces: SpacesPluginStart;
}

const LEGACY_ENTITY_ENGINE_SO_TYPE = 'entity-engine-status';
const SAVED_OBJECTS_FIND_PATH = '/api/saved_objects/_find';

const statusRequestQuery = {
  include_components: false,
} as const satisfies StatusRequestQuery;

const getStatusRequest: HttpFetchOptionsWithPath = {
  path: ENTITY_STORE_ROUTES.public.STATUS,
  query: statusRequestQuery,
};

const installAllEntitiesRequest: HttpFetchOptionsWithPath = {
  path: ENTITY_STORE_ROUTES.public.INSTALL,
  body: JSON.stringify({}),
};

const initEntityMaintainersRequest: HttpFetchOptionsWithPath = {
  path: ENTITY_STORE_ROUTES.internal.ENTITY_MAINTAINERS_INIT,
  body: JSON.stringify({}),
  query: { apiVersion: '2' },
};

// Detects whether the legacy v1 Entity Store was installed in this space by
// looking up the legacy `entity-engine-status` saved object. Used to decide
// whether to auto-install v2 in non-default spaces (only for users who had v1).
export const isEntityStoreV1Installed = async (http: HttpSetup): Promise<boolean> => {
  const response = await http.fetch<{ total: number }>(SAVED_OBJECTS_FIND_PATH, {
    method: 'GET',
    query: { type: LEGACY_ENTITY_ENGINE_SO_TYPE, per_page: 0 },
  });
  return response.total > 0;
};

/**
 * Hook to install Entity Store V2. Should be called from the root Security Solution app component.
 * @param services - Kibana services required to install Entity Store V2
 */
export const useInstallEntityStoreV2 = (services: Services) => {
  useEffect(() => {
    async function install() {
      try {
        const space = await services.spaces.getActiveSpace();
        const statusResponse = await services.http.get<{ status: EntityStoreStatus }>(
          getStatusRequest
        );
        const isEntityStoreV2Installed = isEntityStoreInstalled(statusResponse.status);

        // Entity store already installed → init entity maintainers only.
        if (isEntityStoreV2Installed) {
          await services.http.post(initEntityMaintainersRequest);
          return;
        }

        // In non-default spaces auto-install only happens for users migrating
        // from v1; everyone else has to opt in manually.
        if (space.id !== 'default') {
          const hadV1 = await isEntityStoreV1Installed(services.http);
          if (!hadV1) return;
        }

        // Entity store not installed → install entity store (init entity maintainers is already done by the install API).
        await services.http.post(installAllEntitiesRequest);
      } catch (e) {
        services.logger.error('Failed to initialize Entity Store V2');
        services.logger.error(e);
      }
    }
    install();
  }, [services.http, services.uiSettings, services.logger, services.spaces]);
};

const isEntityStoreInstalled = (status: EntityStoreStatus): boolean =>
  status !== EntityStoreStatus.enum.not_installed;
