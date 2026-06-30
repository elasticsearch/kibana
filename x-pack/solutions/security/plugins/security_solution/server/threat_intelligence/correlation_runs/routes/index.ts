/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { registerCreateCorrelationRunRoute } from './create_run';
import { registerGetCorrelationRunRoute } from './get_run';
import { registerListCorrelationRunsRoute } from './list_runs';
import { registerUpdateCorrelationRunRoute } from './update_run';
import type { RouteRegistrationDeps } from '../../routes';

export const registerCorrelationRunsRoutes = (deps: RouteRegistrationDeps): void => {
  registerCreateCorrelationRunRoute(deps);
  registerGetCorrelationRunRoute(deps);
  registerListCorrelationRunsRoute(deps);
  registerUpdateCorrelationRunRoute(deps);
};
