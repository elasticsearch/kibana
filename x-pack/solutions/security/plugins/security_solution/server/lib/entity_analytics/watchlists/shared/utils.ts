/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreRequestHandlerContext } from '@kbn/core/server';
import { watchlistEntitySourceTypeName } from '../entity_sources/infra';

export const getWatchlistSavedObjectClient = (core: CoreRequestHandlerContext) =>
  core.savedObjects.getClient({
    includedHiddenTypes: [watchlistEntitySourceTypeName],
  });
