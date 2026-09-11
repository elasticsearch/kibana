/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Redirect } from 'react-router-dom';
import {
  OVERVIEW_PATH,
  DATA_QUALITY_PATH,
  DETECTION_RESPONSE_PATH,
  SecurityPageName,
  ENTITY_ANALYTICS_PATH,
  ENTITY_ANALYTICS_HOME_PAGE_PATH,
} from '../../common/constants';
import type { SecuritySubPluginRoutes } from '../app/types';

import { StatefulOverview } from './pages/overview';
import { DataQuality } from './pages/data_quality';
import { DetectionResponse } from './pages/detection_response';
import { PluginTemplateWrapper } from '../common/components/plugin_template_wrapper';
import { withSecurityRoutePageWrapper } from '../common/components/security_route_page_wrapper';

const OverviewRoutes = () => (
  <PluginTemplateWrapper>
    <StatefulOverview />
  </PluginTemplateWrapper>
);

const DetectionResponseRoutes = () => (
  <PluginTemplateWrapper>
    <DetectionResponse />
  </PluginTemplateWrapper>
);

const EntityAnalyticsRoutes = () => <Redirect to={ENTITY_ANALYTICS_HOME_PAGE_PATH} />;

const DataQualityRoutes = () => (
  <PluginTemplateWrapper>
    <DataQuality />
  </PluginTemplateWrapper>
);

export const routes: SecuritySubPluginRoutes = [
  {
    path: OVERVIEW_PATH,
    component: withSecurityRoutePageWrapper(OverviewRoutes, SecurityPageName.overview),
  },
  {
    path: DETECTION_RESPONSE_PATH,
    component: withSecurityRoutePageWrapper(
      DetectionResponseRoutes,
      SecurityPageName.detectionAndResponse
    ),
  },
  {
    path: ENTITY_ANALYTICS_PATH,
    component: withSecurityRoutePageWrapper(
      EntityAnalyticsRoutes,
      SecurityPageName.entityAnalytics
    ),
  },
  {
    path: DATA_QUALITY_PATH,
    component: withSecurityRoutePageWrapper(DataQualityRoutes, SecurityPageName.dataQuality),
  },
];
