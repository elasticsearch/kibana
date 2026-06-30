/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { SecuritySubPluginRoutes } from '../app/types';
import { SecurityPageName } from '../app/types';
import { ALERTS_V2_PATH } from '../../common/constants';
import { PluginTemplateWrapper } from '../common/components/plugin_template_wrapper';
import { SecurityRoutePageWrapper } from '../common/components/security_route_page_wrapper';
import { AlertsV2Page } from './pages/alerts_v2_page';

const AlertsV2Routes = () => (
  <PluginTemplateWrapper>
    <SecurityRoutePageWrapper pageName={SecurityPageName.alertsV2}>
      <AlertsV2Page />
    </SecurityRoutePageWrapper>
  </PluginTemplateWrapper>
);

export const routes: SecuritySubPluginRoutes = [
  {
    path: ALERTS_V2_PATH,
    component: AlertsV2Routes,
  },
];
