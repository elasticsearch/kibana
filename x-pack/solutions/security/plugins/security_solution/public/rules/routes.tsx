/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useMemo } from 'react';
import { Redirect, useLocation, useParams } from 'react-router-dom';
import { Routes, Route } from '@kbn/shared-ux-router';

import type { Capabilities } from '@kbn/core-capabilities-common';
import {
  CUSTOM_HIGHLIGHTED_FIELDS_UI_EDIT_PRIVILEGES,
  INVESTIGATION_GUIDE_UI_EDIT_PRIVILEGES,
  RULES_UI_EDIT_PRIVILEGE,
  RULES_UI_READ_PRIVILEGE,
} from '@kbn/security-solution-features/constants';
import * as i18n from './translations';
import {
  ALERT_VALIDATION_WORKFLOW_PATH,
  COVERAGE_OVERVIEW_PATH,
  DE_RULE_HEALTH_PATH,
  DE_SPACE_RULES_HEALTH_PATH,
  ENABLE_DE_HEALTH_UI_SETTING,
  RULES_LANDING_PATH,
  RULES_PATH,
  SecurityPageName,
} from '../../common/constants';
import { useIsExperimentalFeatureEnabled } from '../common/hooks/use_experimental_features';
import { NotFoundPage } from '../app/404';
import { RulesPage } from '../detection_engine/rule_management_ui/pages/rule_management';
import { CreateRulePage } from '../detection_engine/rule_creation_ui/pages/rule_creation';
import { RuleDetailsPage } from '../detection_engine/rule_details_ui/pages/rule_details';
import { RuleChangesHistoryPage } from '../detection_engine/rule_details_ui/pages/rule_changes_history';
import { EditRulePage } from '../detection_engine/rule_creation_ui/pages/rule_editing';
import { useReadonlyHeader } from '../use_readonly_header';
import { PluginTemplateWrapper } from '../common/components/plugin_template_wrapper';
import { SpyRoute } from '../common/utils/route/spy_routes';
import { AllRulesTabs } from '../detection_engine/rule_management_ui/components/rules_table/rules_table_toolbar';
import { AddRulesPage } from '../detection_engine/rule_management_ui/pages/add_rules';
import {
  DetectionEngineRuleHealthPage,
  DetectionEngineSpaceRulesHealthPage,
} from '../detection_engine/rule_monitoring_ui/pages';
import type { SecuritySubPluginRoutes } from '../app/types';
import { RulesLandingPage } from './landing';
import { CoverageOverviewPage } from '../detection_engine/rule_management_ui/pages/coverage_overview';
import { AlertValidationWorkflowPage } from '../detection_engine/rule_management_ui/pages/alert_validation_workflow';
import { RuleDetailTabs } from '../detection_engine/rule_details_ui/pages/rule_details/use_rule_details_tabs';
import { withSecurityRoutePageWrapper } from '../common/components/security_route_page_wrapper';
import { hasCapabilities } from '../common/lib/capabilities';
import { useKibana, useUiSetting$ } from '../common/lib/kibana/kibana_react';
import { useUserPrivileges } from '../common/components/user_privileges';
import { useEndpointExceptionsCapability } from '../exceptions/hooks/use_endpoint_exceptions_capability';
import { getRuleDetailsTabUrl } from '../common/components/link_to/redirect_to_detection_engine';

/**
 * Component to redirect to rule details with the appropriate landing tab.
 * This is a separate component because hooks can only be called at the top level of a React component.
 */
export const RuleDetailsRedirect: React.FC = () => {
  const { detailName } = useParams<{ detailName: string }>();
  const location = useLocation();
  const defaultLandingPageWithTab = getRuleDetailsTabUrl(detailName, RuleDetailTabs.overview);

  return (
    <Redirect
      to={{
        ...location,
        pathname: `/rules${defaultLandingPageWithTab}`,
        search: location.search,
      }}
    />
  );
};

export const RuleDetailsTabGuard: React.FC = () => {
  const { tabName } = useParams<{ detailName: string; tabName: string }>();
  const { alertsPrivileges, rulesPrivileges } = useUserPrivileges();
  const canReadEndpointExceptions = useEndpointExceptionsCapability('showEndpointExceptions');

  const canReadAlerts = alertsPrivileges.alerts.read;
  const canReadExceptions = rulesPrivileges.exceptions.read;

  const canAccessTab = (() => {
    switch (tabName) {
      case RuleDetailTabs.alerts:
        return canReadAlerts;
      case RuleDetailTabs.exceptions:
        return canReadExceptions;
      case RuleDetailTabs.endpointExceptions:
        return canReadEndpointExceptions;
      default:
        return true;
    }
  })();

  // Redirect if no access to the requested tab
  if (!canAccessTab) {
    return <RuleDetailsRedirect />;
  }

  return <RuleDetailsPage />;
};

interface Features {
  deHealthUIEnabled: boolean;
  ruleHealthUIEnabled: boolean;
  endpointExceptionsTabEnabled: boolean;
}

const getRulesSubRoutes = (
  capabilities: Capabilities,
  { deHealthUIEnabled, ruleHealthUIEnabled, endpointExceptionsTabEnabled }: Features
) => [
  ...(hasCapabilities(capabilities, RULES_UI_READ_PRIVILEGE) // regular detection rules are enabled
    ? [
        {
          path: endpointExceptionsTabEnabled
            ? `/rules/id/:detailName/:tabName(${RuleDetailTabs.overview}|${RuleDetailTabs.alerts}|${RuleDetailTabs.exceptions}|${RuleDetailTabs.endpointExceptions}|${RuleDetailTabs.executionResults})`
            : `/rules/id/:detailName/:tabName(${RuleDetailTabs.overview}|${RuleDetailTabs.alerts}|${RuleDetailTabs.exceptions}|${RuleDetailTabs.executionResults})`,
          main: RuleDetailsTabGuard,
          exact: true,
        },
        {
          path: `/rules/:tabName(${AllRulesTabs.management}|${AllRulesTabs.monitoring}|${AllRulesTabs.updates})`,
          main: RulesPage,
          exact: true,
        },
        {
          path: '/rules/add_rules',
          main: withSecurityRoutePageWrapper(AddRulesPage, SecurityPageName.rulesAdd, {
            omitSpyRoute: true,
          }),
          exact: true,
        },
        {
          path: ALERT_VALIDATION_WORKFLOW_PATH,
          main: withSecurityRoutePageWrapper(
            AlertValidationWorkflowPage,
            SecurityPageName.alertValidationWorkflow,
            { omitSpyRoute: true }
          ),
          exact: true,
        },
        // Detection Engine Health UI Routes
        ...(deHealthUIEnabled
          ? [
              {
                path: DE_SPACE_RULES_HEALTH_PATH,
                main: DetectionEngineSpaceRulesHealthPage,
                exact: true,
              },
            ]
          : []),
        ...(ruleHealthUIEnabled
          ? [
              {
                path: DE_RULE_HEALTH_PATH,
                main: DetectionEngineRuleHealthPage,
                exact: true,
              },
            ]
          : []),
      ]
    : []),
  ...(hasCapabilities(capabilities, RULES_UI_EDIT_PRIVILEGE)
    ? [
        {
          path: '/rules/create',
          main: withSecurityRoutePageWrapper(CreateRulePage, SecurityPageName.rulesCreate, {
            omitSpyRoute: true,
          }),
          exact: true,
        },
      ]
    : []),
  ...(hasCapabilities(capabilities, [
    RULES_UI_EDIT_PRIVILEGE,
    [RULES_UI_READ_PRIVILEGE, INVESTIGATION_GUIDE_UI_EDIT_PRIVILEGES],
    [RULES_UI_READ_PRIVILEGE, CUSTOM_HIGHLIGHTED_FIELDS_UI_EDIT_PRIVILEGES],
  ])
    ? [
        {
          path: '/rules/id/:detailName/edit',
          main: EditRulePage,
          exact: true,
        },
      ]
    : []),
];

const RulesContainerComponent: React.FC = () => {
  useReadonlyHeader(i18n.READ_ONLY_BADGE_TOOLTIP);
  const { capabilities } = useKibana().services.application;
  const deHealthUiFFEnabled = useIsExperimentalFeatureEnabled('deHealthUIEnabled');
  const ruleHealthUiFFEnabled = useIsExperimentalFeatureEnabled('ruleHealthUIEnabled');
  const [deHealthUIAdvancedSetting] = useUiSetting$<boolean>(ENABLE_DE_HEALTH_UI_SETTING, false);
  const deHealthUIEnabled = deHealthUiFFEnabled && deHealthUIAdvancedSetting;
  const ruleHealthUIEnabled = ruleHealthUiFFEnabled && deHealthUIAdvancedSetting;
  const isEndpointExceptionsMovedFFEnabled = useIsExperimentalFeatureEnabled(
    'endpointExceptionsMovedUnderManagement'
  );
  const isRuleChangesHistoryEnabled = useIsExperimentalFeatureEnabled('ruleChangesHistoryEnabled');

  const subRoutes = useMemo(() => {
    return getRulesSubRoutes(capabilities, {
      deHealthUIEnabled,
      ruleHealthUIEnabled,
      endpointExceptionsTabEnabled: !isEndpointExceptionsMovedFFEnabled,
    }).map((route) => (
      <Route key={`rules-route-${route.path}`} path={route.path} exact={route?.exact ?? false}>
        <route.main />
      </Route>
    ));
  }, [capabilities, deHealthUIEnabled, ruleHealthUIEnabled, isEndpointExceptionsMovedFFEnabled]);

  return (
    <PluginTemplateWrapper>
      <Routes>
        <Route path="/rules/id/:detailName" exact>
          <RuleDetailsRedirect />
        </Route>
        <Route path="/rules" exact>
          <Redirect to={`/rules/${AllRulesTabs.management}`} />
        </Route>
        {isRuleChangesHistoryEnabled && hasCapabilities(capabilities, RULES_UI_READ_PRIVILEGE) && (
          <Route path="/rules/id/:ruleId/changes-history" exact>
            <RuleChangesHistoryPage />
          </Route>
        )}
        {subRoutes}
        <Route component={NotFoundPage} />
        <SpyRoute pageName={SecurityPageName.rules} />
      </Routes>
    </PluginTemplateWrapper>
  );
};

const Rules = React.memo(RulesContainerComponent);

const CoverageOverviewRoutes = () => (
  <PluginTemplateWrapper>
    <CoverageOverviewPage />
  </PluginTemplateWrapper>
);

export const routes: SecuritySubPluginRoutes = [
  {
    path: RULES_LANDING_PATH,
    component: withSecurityRoutePageWrapper(RulesLandingPage, SecurityPageName.rulesLanding, {
      omitSpyRoute: true,
    }),
  },
  {
    path: RULES_PATH,
    component: withSecurityRoutePageWrapper(Rules, SecurityPageName.rules, {
      omitSpyRoute: true,
    }),
  },
  {
    path: COVERAGE_OVERVIEW_PATH,
    component: withSecurityRoutePageWrapper(
      CoverageOverviewRoutes,
      SecurityPageName.coverageOverview
    ),
  },
];
