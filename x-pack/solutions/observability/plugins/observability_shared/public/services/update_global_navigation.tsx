/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Subject } from 'rxjs';
import type {
  AppUpdater,
  ApplicationStart,
  AppDeepLink,
  AppDeepLinkLocations,
} from '@kbn/core/public';
import { type PricingServiceStart } from '@kbn/core/public';
import { CasesDeepLinkId } from '@kbn/cases-plugin/public';
import { casesFeatureId } from '../../common';

export function updateGlobalNavigation({
  capabilities,
  deepLinks,
  updater$,
  pricing,
}: {
  capabilities: ApplicationStart['capabilities'];
  deepLinks: AppDeepLink[];
  updater$: Subject<AppUpdater>;
  pricing: PricingServiceStart;
}) {
  const isCompleteOverviewEnabled = pricing.isFeatureAvailable('observability:complete_overview');

  const { apm, metrics, uptime, synthetics, slo } = capabilities.navLinks;
  /* logs is a special case.
   * It is not a nav link but still exists as a
   * Kibana feature privilege with attached rule types */
  const logs = capabilities.logs?.show;
  const observabilityAlerts = capabilities.observabilityAlerts?.show;
  const someVisible =
    Object.values({
      apm,
      logs,
      metrics,
      uptime,
      synthetics,
      slo,
      observabilityAlerts,
    }).some((visible) => visible) || !isCompleteOverviewEnabled;

  const updatedDeepLinks = deepLinks
    .map((link) => {
      switch (link.id) {
        case CasesDeepLinkId.cases:
          if (capabilities[casesFeatureId].read_cases) {
            return {
              ...link,
              visibleIn: ['classicSideNav', 'projectSideNav', 'globalSearch'],
            };
          }
          return null;
        case 'alerts':
          if (someVisible) {
            return {
              ...link,
              visibleIn: ['classicSideNav', 'projectSideNav', 'globalSearch'],
            };
          }
          return null;
        case 'rules':
          if (someVisible) {
            return {
              ...link,
              visibleIn: ['classicSideNav', 'projectSideNav', 'globalSearch'],
            };
          }
          return null;
        default:
          return link;
      }
    })
    .filter((link): link is AppDeepLink => link !== null);

  updater$.next(() => {
    const visibleIn: AppDeepLinkLocations[] = someVisible
      ? ['classicSideNav', 'projectSideNav', 'home', 'kibanaOverview']
      : [];

    if (isCompleteOverviewEnabled && someVisible) {
      visibleIn.push('globalSearch');
    }

    return {
      deepLinks: updatedDeepLinks,
      visibleIn,
    };
  });
}
