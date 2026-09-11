/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { Route, Routes } from '@kbn/shared-ux-router';
import { Redirect } from 'react-router-dom';
import { NotFoundPage } from '../app/404';
import { withSecurityRoutePageWrapper } from '../common/components/security_route_page_wrapper';
import {
  ENTITY_ANALYTICS_ASSET_CRITICALITY_PATH,
  ENTITY_ANALYTICS_ENTITY_STORE_MANAGEMENT_PATH,
  ENTITY_ANALYTICS_LANDING_PATH,
  ENTITY_ANALYTICS_MANAGEMENT_PATH,
  ENTITY_ANALYTICS_HOME_PATH,
  ENTITY_ANALYTICS_PRIVILEGED_USER_MONITORING_PATH,
  ENTITY_ANALYTICS_OVERVIEW_PATH,
  ENTITY_ANALYTICS_HOME_PAGE_PATH,
  SecurityPageName,
  USE_NEW_ENTITY_ANALYTICS_HOME_PAGE_FLAG,
} from '../../common/constants';
import { EntityAnalyticsManagementPage } from './pages/entity_analytics_management_page';
import { PluginTemplateWrapper } from '../common/components/plugin_template_wrapper';
import { EntityAnalyticsLandingPage } from './pages/entity_analytics_landing';
import { EntityAnalyticsPrivilegedUserMonitoringPage } from './pages/entity_analytics_privileged_user_monitoring_page';
import { OverviewDashboard } from './pages/entity_analytics_overview_page';
import { EntityAnalyticsHomePage } from './pages/entity_analytics_home_page';
import { EntityAnalyticsNewHomePage } from './pages/entity_analytics_new_home_page';
import { useIsExperimentalFeatureEnabled } from '../common/hooks/use_experimental_features';
import { useKibana } from '../common/lib/kibana';

// ---- Management routes ----
const EntityAnalyticsManagementWrapper = () => (
  <PluginTemplateWrapper>
    <EntityAnalyticsManagementPage />
  </PluginTemplateWrapper>
);

const EntityAnalyticsManagementContainer: React.FC = React.memo(() => {
  return (
    <Routes>
      <Route
        path={`${ENTITY_ANALYTICS_MANAGEMENT_PATH}/:tab?`}
        component={EntityAnalyticsManagementWrapper}
      />
      <Route component={NotFoundPage} />
    </Routes>
  );
});
EntityAnalyticsManagementContainer.displayName = 'EntityAnalyticsManagementContainer';

// ---- Asset criticality redirect route ----
const EntityAnalyticsAssetClassificationContainer: React.FC = React.memo(() => {
  return (
    <Routes>
      <Route
        path={ENTITY_ANALYTICS_ASSET_CRITICALITY_PATH}
        exact
        render={({ location }) => (
          <Redirect
            to={{
              ...location,
              pathname: `${ENTITY_ANALYTICS_MANAGEMENT_PATH}/asset_criticality`,
              search: location.search,
            }}
          />
        )}
      />
      <Route component={NotFoundPage} />
    </Routes>
  );
});

EntityAnalyticsAssetClassificationContainer.displayName =
  'EntityAnalyticsAssetClassificationContainer';

// ---- Entity store redirect route ----
const EntityAnalyticsEntityStoreRedirectContainer: React.FC = React.memo(() => {
  return (
    <Routes>
      <Route
        path={ENTITY_ANALYTICS_ENTITY_STORE_MANAGEMENT_PATH}
        exact
        render={({ location }) => (
          <Redirect
            to={{
              ...location,
              pathname: `${ENTITY_ANALYTICS_MANAGEMENT_PATH}/status`,
              search: location.search,
            }}
          />
        )}
      />
      <Route component={NotFoundPage} />
    </Routes>
  );
});

EntityAnalyticsEntityStoreRedirectContainer.displayName =
  'EntityAnalyticsEntityStoreRedirectContainer';

// ---- Landing routes ----
const EntityAnalyticsLandingWrapper = () => (
  <PluginTemplateWrapper>
    <EntityAnalyticsLandingPage />
  </PluginTemplateWrapper>
);

const EntityAnalyticsLandingContainer: React.FC = React.memo(() => {
  return (
    <Routes>
      <Route path={ENTITY_ANALYTICS_LANDING_PATH} exact component={EntityAnalyticsLandingWrapper} />
      <Route component={NotFoundPage} />
    </Routes>
  );
});

EntityAnalyticsLandingContainer.displayName = 'EntityAnalyticsLandingContainer';

// ---- Privileged user monitoring routes ----
const EntityAnalyticsPrivilegedUserMonitoringWrapper = () => (
  <PluginTemplateWrapper>
    <EntityAnalyticsPrivilegedUserMonitoringPage />
  </PluginTemplateWrapper>
);

const EntityAnalyticsPrivilegedUserMonitoringContainer: React.FC = React.memo(() => {
  const isEntityStoreV2Enabled = useIsExperimentalFeatureEnabled('entityAnalyticsEntityStoreV2');

  return (
    <Routes>
      <Route
        path={ENTITY_ANALYTICS_PRIVILEGED_USER_MONITORING_PATH}
        exact
        render={({ location }) =>
          isEntityStoreV2Enabled ? (
            <Redirect
              to={{
                ...location,
                pathname: ENTITY_ANALYTICS_MANAGEMENT_PATH,
                search: location.search,
              }}
            />
          ) : (
            <EntityAnalyticsPrivilegedUserMonitoringWrapper />
          )
        }
      />
      <Route component={NotFoundPage} />
    </Routes>
  );
});

EntityAnalyticsPrivilegedUserMonitoringContainer.displayName =
  'EntityAnalyticsPrivilegedUserMonitoringContainer';

// ---- Overview routes ----
const EntityAnalyticsOverviewWrapper = () => (
  <PluginTemplateWrapper>
    <OverviewDashboard />
  </PluginTemplateWrapper>
);

const EntityAnalyticsOverviewContainer: React.FC = React.memo(() => {
  return (
    <Routes>
      <Route
        path={ENTITY_ANALYTICS_OVERVIEW_PATH}
        exact
        component={EntityAnalyticsOverviewWrapper}
      />
      <Route component={NotFoundPage} />
    </Routes>
  );
});

EntityAnalyticsOverviewContainer.displayName = 'EntityAnalyticsOverviewContainer';

// ---- Entity analytics home page routes ----
const EntityAnalyticsHomePageWrapper = () => (
  <PluginTemplateWrapper>
    <EntityAnalyticsHomePage />
  </PluginTemplateWrapper>
);

const EntityAnalyticsHomePageContainer: React.FC = React.memo(() => {
  return (
    <Routes>
      <Route
        path={ENTITY_ANALYTICS_HOME_PAGE_PATH}
        exact
        component={EntityAnalyticsHomePageWrapper}
      />
      <Route component={NotFoundPage} />
    </Routes>
  );
});

EntityAnalyticsHomePageContainer.displayName = 'EntityAnalyticsHomePageContainer';

// ---- New Entity Analytics home page (gated by securitySolution.useNewEntityAnalyticsPage) ----
const EntityAnalyticsNewHomePageContainer: React.FC = React.memo(() => {
  const {
    featureFlags: { getBooleanValue },
  } = useKibana().services;
  const isEnabled = getBooleanValue(USE_NEW_ENTITY_ANALYTICS_HOME_PAGE_FLAG, false);

  return (
    <Routes>
      <Route
        path={ENTITY_ANALYTICS_HOME_PATH}
        exact
        render={({ location }) =>
          isEnabled ? (
            <EntityAnalyticsNewHomePage />
          ) : (
            <Redirect
              to={{
                ...location,
                pathname: ENTITY_ANALYTICS_LANDING_PATH,
                search: location.search,
              }}
            />
          )
        }
      />
      <Route component={NotFoundPage} />
    </Routes>
  );
});

EntityAnalyticsNewHomePageContainer.displayName = 'EntityAnalyticsNewHomePageContainer';

// ---- Route definitions ----
export const routes = [
  {
    path: ENTITY_ANALYTICS_MANAGEMENT_PATH,
    component: withSecurityRoutePageWrapper(
      EntityAnalyticsManagementContainer,
      SecurityPageName.entityAnalyticsManagement
    ),
  },
  {
    path: ENTITY_ANALYTICS_ASSET_CRITICALITY_PATH,
    component: EntityAnalyticsAssetClassificationContainer,
  },
  {
    path: ENTITY_ANALYTICS_ENTITY_STORE_MANAGEMENT_PATH,
    component: EntityAnalyticsEntityStoreRedirectContainer,
  },
  {
    path: ENTITY_ANALYTICS_LANDING_PATH,
    component: withSecurityRoutePageWrapper(
      EntityAnalyticsLandingContainer,
      SecurityPageName.entityAnalyticsLanding
    ),
  },
  {
    path: ENTITY_ANALYTICS_PRIVILEGED_USER_MONITORING_PATH,
    component: withSecurityRoutePageWrapper(
      EntityAnalyticsPrivilegedUserMonitoringContainer,
      SecurityPageName.entityAnalyticsPrivilegedUserMonitoring
    ),
  },
  {
    path: ENTITY_ANALYTICS_OVERVIEW_PATH,
    component: withSecurityRoutePageWrapper(
      EntityAnalyticsOverviewContainer,
      SecurityPageName.entityAnalyticsOverview
    ),
  },
  {
    path: ENTITY_ANALYTICS_HOME_PAGE_PATH,
    component: withSecurityRoutePageWrapper(
      EntityAnalyticsHomePageContainer,
      SecurityPageName.entityAnalyticsHomePage
    ),
  },
  {
    path: ENTITY_ANALYTICS_HOME_PATH,
    component: withSecurityRoutePageWrapper(
      EntityAnalyticsNewHomePageContainer,
      SecurityPageName.entityAnalyticsHome
    ),
  },
];
