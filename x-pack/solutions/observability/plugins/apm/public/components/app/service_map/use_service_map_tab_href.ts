/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Generic service-detail tab navigation helper for the Service Map.
 *
 * Resolves the service-scoped destination for a given tab from the current map
 * route (`/service-map`, `/services/{serviceName}/service-map`, or
 * `/mobile-services/{serviceName}/service-map`), picking the `services` vs
 * `mobile-services` variant based on the map context. It preserves the shared
 * time range / environment params and **strips `kuery`** so a node-scoped click
 * doesn't carry the map's service-name filter into a destination where it would
 * yield undesired side effects.
 *
 * Both hooks rely on `useAnyOfApmParams` and will throw if called outside a
 * matching APM map route — callers must mount inside `ServiceMapGraph`, which
 * is wrapped by `ApmEmbeddableContext` on dashboard embeds.
 *
 * Tab-specific entry points (e.g. alerts, overview) build on top of this
 * module so the map-context resolution and kuery-stripping live in one place.
 */

import type { KeyboardEvent, MouseEvent } from 'react';
import { useCallback } from 'react';
import { useApmPluginContext } from '../../../context/apm_plugin/use_apm_plugin_context';
import { useAnyOfApmParams } from '../../../hooks/use_apm_params';
import { useApmRoutePath } from '../../../hooks/use_apm_route_path';
import { useApmRouter } from '../../../hooks/use_apm_router';

export type ServiceMapTab = 'alerts' | 'overview';

/**
 * Returns a stable `(serviceName) => href` builder for a given service-detail
 * tab from the current map route. `kuery` is stripped — see module header.
 */
export function useServiceMapTabHrefBuilder(tab: ServiceMapTab): (serviceName: string) => string {
  const apmRouter = useApmRouter();
  const routePath = useApmRoutePath();
  const { query } = useAnyOfApmParams(
    '/service-map',
    '/services/{serviceName}/service-map',
    '/mobile-services/{serviceName}/service-map'
  );

  return useCallback(
    (serviceName: string) => {
      const queryWithoutKuery = { ...query, kuery: '' };
      const isMobileContext = String(routePath).includes('mobile-services');
      if (isMobileContext) {
        return apmRouter.link(`/mobile-services/{serviceName}/${tab}` as const, {
          path: { serviceName },
          query: queryWithoutKuery,
        });
      }
      return apmRouter.link(`/services/{serviceName}/${tab}` as const, {
        path: { serviceName },
        query: queryWithoutKuery,
      });
    },
    [apmRouter, routePath, query, tab]
  );
}

/**
 * Service-detail tab URL for a service on the service map, matching the service
 * header badge destination for the current map context (global, service detail,
 * mobile).
 */
export function useServiceMapTabHref(tab: ServiceMapTab, serviceName: string) {
  const buildHref = useServiceMapTabHrefBuilder(tab);
  return buildHref(serviceName);
}

/**
 * SPA navigation to a service-detail tab (avoids full page reload from a plain
 * anchor href).
 */
export function useServiceMapTabNavigate(tab: ServiceMapTab, serviceName: string) {
  const tabHref = useServiceMapTabHref(tab, serviceName);
  const apmPluginContext = useApmPluginContext();
  const navigateToUrl = apmPluginContext?.core?.application?.navigateToUrl;

  return useCallback(
    (e: MouseEvent | KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      navigateToUrl?.(tabHref);
    },
    [tabHref, navigateToUrl]
  );
}
