/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRuleDataClient } from '@kbn/rule-registry-plugin/server';

import type { SecuritySolutionPluginRouter } from '../../../../types';
import { searchAttacksRoute } from './search_attacks_route';
import { setAttacksAssigneesRoute } from './set_attacks_assignees_route';
import { setAttacksStatusRoute } from './set_attacks_status_route';
import { setAttacksTagsRoute } from './set_attacks_tags_route';

export const registerAttacksRoutes = (
  router: SecuritySolutionPluginRouter,
  ruleDataClient: IRuleDataClient | null
) => {
  searchAttacksRoute(router);
  setAttacksStatusRoute(router, ruleDataClient);
  setAttacksTagsRoute(router, ruleDataClient);
  setAttacksAssigneesRoute(router, ruleDataClient);
};
