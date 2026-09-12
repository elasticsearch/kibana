/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Capabilities } from '@kbn/core/public';
import type { Subscription } from 'rxjs';
import {
  ALERTS_FEATURE_ID,
  ALERTS_UI_READ,
  RULES_UI_READ,
} from '@kbn/security-solution-features/constants';
import {
  APP_PATH,
  CASES_FEATURE_ID,
  RULES_FEATURE_ID,
  SECURITY_FEATURE_ID,
} from '@kbn/security-solution-plugin/common';
import type { Services } from '../common/services';

const DASHBOARDS_APP_ID = 'dashboards';
const SECURITY_GET_STARTED_PATH = `${APP_PATH}/get_started`;

const landingPaths = new Set(['/', APP_PATH, SECURITY_GET_STARTED_PATH]);

const normalizePath = (pathname: string): string =>
  pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

/**
 * Same access signal Security uses to mark `securitySolutionUI` inaccessible.
 * `capabilities.navLinks.securitySolutionUI` is not reliable: Core defaults every
 * registered app to `true`, and the client updater never mounts Get started.
 */
export const canAccessSecurityLanding = (capabilities: Capabilities): boolean =>
  Boolean(
    capabilities[SECURITY_FEATURE_ID]?.show ||
      capabilities.securitySolutionAttackDiscovery?.['attack-discovery'] ||
      capabilities[RULES_FEATURE_ID]?.[RULES_UI_READ] ||
      capabilities[ALERTS_FEATURE_ID]?.[ALERTS_UI_READ] ||
      capabilities[CASES_FEATURE_ID]?.read_cases
  );

export const canAccessDashboardsApp = (capabilities: Capabilities): boolean =>
  Boolean(capabilities.dashboard_v2?.show);

export const shouldRedirectDashboardOnlyLanding = ({
  pathname,
  canAccessGetStarted,
  canAccessDashboards,
}: {
  pathname: string;
  canAccessGetStarted: boolean;
  canAccessDashboards: boolean;
}): boolean =>
  !canAccessGetStarted && canAccessDashboards && landingPaths.has(normalizePath(pathname));

export const redirectDashboardOnlyLanding = (services: Services): void => {
  const { application, http } = services;
  const { capabilities } = application;

  if (
    shouldRedirectDashboardOnlyLanding({
      pathname: http.basePath.remove(window.location.pathname),
      canAccessGetStarted: canAccessSecurityLanding(capabilities),
      canAccessDashboards: canAccessDashboardsApp(capabilities),
    })
  ) {
    application.navigateToApp(DASHBOARDS_APP_ID, { replace: true });
  }
};

export const subscribeDashboardOnlyLanding = (services: Services): Subscription => {
  const run = () => redirectDashboardOnlyLanding(services);
  // currentAppId$ never emits for an inaccessible Security app (App Not Found).
  // currentLocation$ emits the initial history entry and every later path change.
  return services.application.currentLocation$.subscribe(run);
};
