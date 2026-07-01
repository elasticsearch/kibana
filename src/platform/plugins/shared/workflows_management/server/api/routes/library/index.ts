/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { registerGetTemplateRoute } from './get_template';
import { registerGetTemplatesRoute } from './get_templates';
import { registerLibraryHealthRoute } from './health';
import { LibraryService } from '../../../library';
import type { RouteDependencies } from '../types';

export function registerLibraryRoutes(deps: RouteDependencies) {
  const libraryService = new LibraryService({
    config: deps.config,
    logger: deps.logger,
    kibanaVersion: deps.workflowsService.kibanaVersion,
    isServerless: Boolean(deps.workflowsService.plugins.serverless),
  });

  registerGetTemplatesRoute(deps, libraryService);
  registerGetTemplateRoute(deps, libraryService);
  registerLibraryHealthRoute(deps, libraryService);
}
