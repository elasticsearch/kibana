/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaUrl, PageObjects, ScoutPage } from '@kbn/scout';
import { createLazyPageObject } from '@kbn/scout';
import { AlertingNavigation } from './alerting_navigation';
import { ComposeDiscoverPage } from './compose_discover_page';
import { DiscoverAppMenu } from './discover_app_menu';
import { ExecutionHistoryPage } from './execution_history_page';
import { RuleBuilderPage } from './rule_builder_page';
import { RuleFormPage } from './rule_form_page';
import { RulesListPage } from './rules_list_page';
import { ThresholdBuilderPage } from './threshold_builder_page';

export { AlertingNavigation } from './alerting_navigation';
export { ComposeDiscoverPage } from './compose_discover_page';
export { DiscoverAppMenu } from './discover_app_menu';
export { ExecutionHistoryPage } from './execution_history_page';
export { RuleBuilderPage } from './rule_builder_page';
export { RuleFormPage } from './rule_form_page';
export { RulesListPage } from './rules_list_page';
export { ThresholdBuilderPage } from './threshold_builder_page';

export type AlertingPageObjects = PageObjects & {
  alertingNavigation: AlertingNavigation;
  composeDiscover: ComposeDiscoverPage;
  discoverAppMenu: DiscoverAppMenu;
  executionHistory: ExecutionHistoryPage;
  ruleBuilder: RuleBuilderPage;
  ruleForm: RuleFormPage;
  rulesList: RulesListPage;
  thresholdBuilder: ThresholdBuilderPage;
};

export const extendPageObjects = (
  pageObjects: PageObjects,
  page: ScoutPage,
  kbnUrl: KibanaUrl
): AlertingPageObjects => {
  const discoverAppMenu = createLazyPageObject(DiscoverAppMenu, page);

  return {
    ...pageObjects,
    alertingNavigation: createLazyPageObject(AlertingNavigation, page),
    composeDiscover: createLazyPageObject(ComposeDiscoverPage, page),
    discoverAppMenu,
    executionHistory: createLazyPageObject(ExecutionHistoryPage, page, kbnUrl),
    ruleBuilder: createLazyPageObject(RuleBuilderPage, page),
    ruleForm: createLazyPageObject(RuleFormPage, page, discoverAppMenu),
    rulesList: createLazyPageObject(RulesListPage, page),
    thresholdBuilder: createLazyPageObject(ThresholdBuilderPage, page),
  };
};
