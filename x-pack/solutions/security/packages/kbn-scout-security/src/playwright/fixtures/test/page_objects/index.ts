/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PageObjects, ScoutPage, ScoutTestConfig } from '@kbn/scout';
import { createLazyPageObject } from '@kbn/scout';
import { AddExceptionFlyoutPage } from './add_exception_flyout';
import { AIValueReportPage } from './ai_value_report';
import { AlertsTablePage } from './alerts_table';
import { AgentBuilderPage } from './agent_builder';
import { AlertDetailsRightPanelPage } from './alert_details_right_panel';
import { EntityAnalyticsDashboardsPage } from './entity_analytics_dashboards';
import { EntityAnalyticsManagementPage } from './entity_analytics_management';
import { CspmIntegrationPage } from './cspm_integration_page';
import { TimelinePage } from './timeline';
import { DetectionsAttackDiscoveryPage } from './detections_attack_discovery';
import { ThreatMatchRuleCreatePage } from './threat_match_rule_create_page';
import { AttackDetailsRightPanelPage } from './attack_details_right_panel';
import { ServerlessProjectChromePage } from './serverless_project_chrome_page';
import { GraphFlyoutPage } from './graph_flyout_page';

export type { ThreatMatchRuleCreatePage } from './threat_match_rule_create_page';
export { AddExceptionButtonType } from './add_exception_flyout';

export interface SecurityPageObjects extends PageObjects {
  addExceptionFlyoutPage: AddExceptionFlyoutPage;
  aiValueReportPage: AIValueReportPage;
  alertsTablePage: AlertsTablePage;
  agentBuilderPage: AgentBuilderPage;
  alertDetailsRightPanelPage: AlertDetailsRightPanelPage;
  entityAnalyticsDashboardsPage: EntityAnalyticsDashboardsPage;
  entityAnalyticsManagementPage: EntityAnalyticsManagementPage;
  cspmIntegrationPage: CspmIntegrationPage;
  timelinePage: TimelinePage;
  detectionsAttackDiscoveryPage: DetectionsAttackDiscoveryPage;
  /** Indicator match (threat match) rule creation page — threat index and field mapping controls. */
  threatMatchRuleCreatePage: ThreatMatchRuleCreatePage;
  attackDetailsRightPanelPage: AttackDetailsRightPanelPage;
  serverlessProjectChromePage: ServerlessProjectChromePage;
  /** Graph Visualization tab inside the alert/event details left panel. */
  graphFlyoutPage: GraphFlyoutPage;
}

export function extendPageObjects(
  pageObjects: PageObjects,
  page: ScoutPage,
  config: ScoutTestConfig
): SecurityPageObjects {
  return {
    ...pageObjects,
    addExceptionFlyoutPage: createLazyPageObject(AddExceptionFlyoutPage, page),
    aiValueReportPage: createLazyPageObject(AIValueReportPage, page),
    alertsTablePage: createLazyPageObject(AlertsTablePage, page),
    agentBuilderPage: createLazyPageObject(AgentBuilderPage, page),
    alertDetailsRightPanelPage: createLazyPageObject(AlertDetailsRightPanelPage, page),
    entityAnalyticsDashboardsPage: createLazyPageObject(EntityAnalyticsDashboardsPage, page),
    entityAnalyticsManagementPage: createLazyPageObject(EntityAnalyticsManagementPage, page),
    cspmIntegrationPage: createLazyPageObject(CspmIntegrationPage, page),
    timelinePage: createLazyPageObject(TimelinePage, page),
    detectionsAttackDiscoveryPage: createLazyPageObject(
      DetectionsAttackDiscoveryPage,
      page,
      config
    ),
    threatMatchRuleCreatePage: createLazyPageObject(ThreatMatchRuleCreatePage, page),
    attackDetailsRightPanelPage: createLazyPageObject(AttackDetailsRightPanelPage, page),
    serverlessProjectChromePage: createLazyPageObject(ServerlessProjectChromePage, page),
    graphFlyoutPage: createLazyPageObject(GraphFlyoutPage, page),
  };
}
