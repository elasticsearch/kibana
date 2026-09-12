/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RouteDependencies } from '../types';
import { registerApproveProposalRoute } from './approve_proposal';
import { registerCreateProposalRoute } from './create_proposal';
import { registerDismissProposalRoute } from './dismiss_proposal';
import { registerGetProposalRoute } from './get_proposal';
import { registerListProposalsRoute } from './list_proposals';
import { registerProposalStatsRoute } from './proposal_charts_summary';

export const registerRoutes = (deps: RouteDependencies) => {
  registerCreateProposalRoute(deps);
  registerListProposalsRoute(deps);
  registerGetProposalRoute(deps);
  registerApproveProposalRoute(deps);
  registerDismissProposalRoute(deps);
  registerProposalStatsRoute(deps);
};
