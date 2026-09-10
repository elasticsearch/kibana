/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  getEntitiesAlias,
  ENTITY_LATEST,
  getLatestEntitiesIndexName,
} from '@kbn/entity-store/common';

export const ENTITY_ANALYTICS_TABLE_ID = 'entity-analytics-home-table';

// The EA homepage hides the global date picker, so alert queries on this page
// use a fixed "last 30 days" window instead of the global time range.
export const ENTITY_ANALYTICS_ALERTS_FROM = 'now-30d';
export const ENTITY_ANALYTICS_ALERTS_TO = 'now';

const LOCAL_STORAGE_PREFIX = 'entityAnalytics';
export const ENTITY_ANALYTICS_LOCAL_STORAGE_COLUMNS_KEY = `${LOCAL_STORAGE_PREFIX}:columns`;
export const ENTITY_ANALYTICS_LOCAL_STORAGE_PAGE_SIZE_KEY = `${LOCAL_STORAGE_PREFIX}:dataTable:pageSize`;
