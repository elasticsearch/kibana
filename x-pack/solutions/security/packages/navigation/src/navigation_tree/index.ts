/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createDashboardsNavigationTree } from './dashboards_navigation_tree';
export { RECENT_DASHBOARDS_SLOT_ID } from './dashboards_navigation_tree';
import { createRulesNavigationTree } from './rules_navigation_tree';
import { createCasesNavigationTree } from './cases_navigation_tree';
import { createInvestigationsNavigationTree } from './investigations_navigation_tree';
import { createExploreNavigationTree } from './explore_navigation_tree';
import { createAssetsNavigationTree } from './assets_navigation_tree';
import { createEntityAnalyticsNavigationTree } from './entity_analytics_navigation_tree';
import { createMachineLearningNavigationTree } from './ml_navigation_tree';
import { createAlertDetectionsNavigationTree } from './alert_detections_navigation_tree';

export const defaultNavigationTree = {
  alertDetections: createAlertDetectionsNavigationTree,
  dashboards: createDashboardsNavigationTree,
  rules: createRulesNavigationTree,
  cases: createCasesNavigationTree,
  investigations: createInvestigationsNavigationTree,
  explore: createExploreNavigationTree,
  assets: createAssetsNavigationTree,
  entityAnalytics: createEntityAnalyticsNavigationTree,
  ml: createMachineLearningNavigationTree,
};
export type DefaultNavigationTree = typeof defaultNavigationTree;
