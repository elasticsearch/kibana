/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ListsPluginRouter } from '../types';
import type { ConfigType } from '../config';

import {
  createEndpointListItemRoute,
  createEndpointListRoute,
  createExceptionListItemRoute,
  createExceptionListRoute,
  createListIndexRoute,
  createListItemRoute,
  createListRoute,
  deleteEndpointListItemRoute,
  deleteExceptionListItemRoute,
  deleteExceptionListRoute,
  deleteListIndexRoute,
  deleteListItemRoute,
  deleteListRoute,
  duplicateExceptionsRoute,
  exportExceptionListRoute,
  exportExceptionListsRoute,
  exportListItemRoute,
  findEndpointListItemRoute,
  findExceptionListItemRoute,
  findExceptionListRoute,
  findListItemRoute,
  findListRoute,
  findListsBySizeRoute,
  getExceptionFilterRoute,
  importExceptionsRoute,
  importListItemRoute,
  internalCreateExceptionListRoute,
  patchListItemRoute,
  patchListRoute,
  readEndpointListItemRoute,
  readExceptionListItemRoute,
  readExceptionListRoute,
  readListIndexRoute,
  readListItemRoute,
  readListRoute,
  readPrivilegesRoute,
  summaryExceptionListRoute,
  updateEndpointListItemRoute,
  updateExceptionListItemRoute,
  updateExceptionListRoute,
  updateListItemRoute,
  updateListRoute,
} from '.';

export const initRoutes = (
  router: ListsPluginRouter,
  config: ConfigType,
  kibanaVersion: string
): void => {
  // lists
  createListRoute(router, kibanaVersion);
  readListRoute(router);
  updateListRoute(router);
  deleteListRoute(router);
  patchListRoute(router);
  findListRoute(router);
  readPrivilegesRoute(router);
  findListsBySizeRoute(router);

  // list items
  createListItemRoute(router);
  readListItemRoute(router);
  updateListItemRoute(router);
  deleteListItemRoute(router);
  patchListItemRoute(router);
  exportListItemRoute(router);
  importListItemRoute(router, config, kibanaVersion);
  findListItemRoute(router);

  // indexes of lists
  createListIndexRoute(router);
  readListIndexRoute(router);
  deleteListIndexRoute(router);

  // exceptions import/export
  exportExceptionListRoute(router);
  exportExceptionListsRoute(router);
  importExceptionsRoute(router, config);

  // exception lists
  createExceptionListRoute(router);
  readExceptionListRoute(router);
  updateExceptionListRoute(router);
  deleteExceptionListRoute(router);
  findExceptionListRoute(router);
  duplicateExceptionsRoute(router);

  // exception list items
  createExceptionListItemRoute(router);
  readExceptionListItemRoute(router);
  updateExceptionListItemRoute(router);
  deleteExceptionListItemRoute(router);
  findExceptionListItemRoute(router);

  // exception filter
  getExceptionFilterRoute(router);

  // endpoint list
  createEndpointListRoute(router);

  // endpoint list items
  createEndpointListItemRoute(router);
  readEndpointListItemRoute(router);
  updateEndpointListItemRoute(router);
  deleteEndpointListItemRoute(router);
  findEndpointListItemRoute(router);

  // exception list items summary
  summaryExceptionListRoute(router);

  // internal routes
  internalCreateExceptionListRoute(router);
};
