/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Subscription } from 'rxjs';
import type { SecurityProductTypes } from '../../common/config';
import type { Services } from '../common/services';
import { subscribeBreadcrumbs } from './breadcrumbs';
import { registerSolutionNavigation } from './navigation';
import { enableManagementCardsLanding } from './management_cards';
import { subscribeDashboardOnlyLanding } from './redirect_dashboard_only_landing';

export const startNavigation = (
  services: Services,
  productTypes: SecurityProductTypes
): Subscription => {
  const landingSubscription = subscribeDashboardOnlyLanding(services);
  registerSolutionNavigation(services, productTypes);
  subscribeBreadcrumbs(services);
  const managementSubscription = enableManagementCardsLanding(services);
  landingSubscription.add(managementSubscription);
  return landingSubscription;
};
