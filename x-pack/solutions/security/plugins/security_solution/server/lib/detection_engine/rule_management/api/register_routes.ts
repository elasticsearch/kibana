/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { ConfigType } from '../../../../config';
import type { SetupPlugins } from '../../../../plugin_contract';
import type { SecuritySolutionPluginRouter } from '../../../../types';

import { performBulkActionRoute } from './rules/bulk_actions/route';
import { createRuleRoute } from './rules/create_rule/route';
import { deleteRuleRoute } from './rules/delete_rule/route';
import { exportRulesRoute } from './rules/export_rules/route';
import { findRulesRoute } from './rules/find_rules/route';
import { searchRulesRoute } from './rules/search_rules/route';
import { importRulesRoute } from './rules/import_rules/route';
import { getRuleManagementFilters } from './rules/filters/route';
import { patchRuleRoute } from './rules/patch_rule/route';
import { readRuleRoute } from './rules/read_rule/route';
import { ruleHistoryRoute } from './rules/rule_history/route';
import { restoreRuleFromHistoryRoute } from './rules/restore_rule_from_history/route';
import { updateRuleRoute } from './rules/update_rule/route';
import { readTagsRoute } from './tags/read_tags/route';
import { getCoverageOverviewRoute } from './rules/coverage_overview/route';

export const registerRuleManagementRoutes = (
  router: SecuritySolutionPluginRouter,
  config: ConfigType,
  ml: SetupPlugins['ml'],
  logger: Logger
) => {
  // Rules CRUD
  createRuleRoute(router);
  readRuleRoute(router, logger);
  updateRuleRoute(router);
  patchRuleRoute(router);
  deleteRuleRoute(router);

  // Rules bulk actions
  performBulkActionRoute(router, ml);

  // Rules export/import
  exportRulesRoute(router, config, logger);
  importRulesRoute(router, config, logger);

  // Rules search
  findRulesRoute(router, logger);
  searchRulesRoute(router, logger);

  // Rule tags
  readTagsRoute(router);

  // Rules filters
  getRuleManagementFilters(router);

  // Rules coverage overview
  getCoverageOverviewRoute(router);

  // Rule changes history (gated by experimental flag; the feature also
  // requires `xpack.alerting.ruleChangeTracking.enabled` to be on for the
  // alerting framework to actually produce history records).
  if (config.experimentalFeatures.ruleChangesHistoryEnabled) {
    ruleHistoryRoute(router);
    restoreRuleFromHistoryRoute(router);
  }
};
