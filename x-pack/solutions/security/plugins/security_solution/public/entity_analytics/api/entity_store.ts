/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useMemo } from 'react';
import { ENTITY_STORE_ROUTES } from '@kbn/entity-store/public';
import type {
  GetEntityStoreStatusResponse,
  InitEntityStoreResponse,
} from '@kbn/entity-store/common';
import type {
  StartEntityEngineResponse,
  StopEntityEngineResponse,
} from '../../../common/api/entity_analytics';
import { API_VERSIONS } from '../../../common/entity_analytics/constants';
import { WATCHLISTS_PREBUILT_INSTALL_URL } from '../../../common/entity_analytics/watchlists/constants';
import { useKibana } from '../../common/lib/kibana/kibana_react';
import * as entityAnalyticsI18n from '../translations';

const WATCHLIST_TOAST_LIFETIME_MS = 8000;

export const useEntityStoreRoutes = () => {
  const { http, notifications } = useKibana().services;

  return useMemo(() => {
    const installPrebuiltWatchlists = async () =>
      http.fetch<{ acknowledged: boolean }>(WATCHLISTS_PREBUILT_INSTALL_URL, {
        method: 'POST',
        version: API_VERSIONS.public.v1,
      });

    // This is here while waiting for unified installs https://github.com/elastic/security-team/issues/16607
    const tryInstallPrebuiltWatchlistsWithToast = async () => {
      try {
        await installPrebuiltWatchlists();
      } catch {
        notifications?.toasts?.addWarning({
          title: entityAnalyticsI18n.ENTITY_STORE_PREBUILT_WATCHLISTS_WARNING_TITLE,
          text: entityAnalyticsI18n.ENTITY_STORE_PREBUILT_WATCHLISTS_WARNING_TEXT,
          toastLifeTimeMs: WATCHLIST_TOAST_LIFETIME_MS,
        });
      }
    };

    const getEntityStoreStatus = async (withComponents = false) =>
      http.fetch<GetEntityStoreStatusResponse>(ENTITY_STORE_ROUTES.public.STATUS, {
        method: 'GET',
        version: API_VERSIONS.public.v1,
        query: { include_components: withComponents },
      });

    const installEntityStore = async () => {
      await tryInstallPrebuiltWatchlistsWithToast();
      return http.fetch<InitEntityStoreResponse>(ENTITY_STORE_ROUTES.public.INSTALL, {
        method: 'POST',
        version: API_VERSIONS.public.v1,
        body: JSON.stringify({}),
      });
    };

    const startEntityStore = async () => {
      await tryInstallPrebuiltWatchlistsWithToast();
      return http.fetch<StartEntityEngineResponse>(ENTITY_STORE_ROUTES.public.START, {
        method: 'PUT',
        version: API_VERSIONS.public.v1,
        body: JSON.stringify({}),
      });
    };

    const stopEntityStore = async () =>
      http.fetch<StopEntityEngineResponse>(ENTITY_STORE_ROUTES.public.STOP, {
        method: 'PUT',
        version: API_VERSIONS.public.v1,
        body: JSON.stringify({}),
      });

    const deleteEntityStore = async () =>
      http.fetch(ENTITY_STORE_ROUTES.public.UNINSTALL, {
        method: 'POST',
        version: API_VERSIONS.public.v1,
        body: JSON.stringify({}),
      });

    return {
      getEntityStoreStatus,
      installEntityStore,
      startEntityStore,
      stopEntityStore,
      deleteEntityStore,
    };
  }, [http, notifications]);
};
