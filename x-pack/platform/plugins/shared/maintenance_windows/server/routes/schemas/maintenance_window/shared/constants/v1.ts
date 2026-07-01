/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const maintenanceWindowCategoryIdTypes = {
  KIBANA: 'kibana',
  OBSERVABILITY: 'observability',
  SECURITY_SOLUTION: 'securitySolution',
  MANAGEMENT: 'management',
} as const;

export const maintenanceWindowStatus = {
  RUNNING: 'running',
  FINISHED: 'finished',
  UPCOMING: 'upcoming',
  ARCHIVED: 'archived',
  DISABLED: 'disabled',
} as const;

export const ID_MAX_LENGTH = 100;
export const TITLE_MAX_LENGTH = 256;
export const SEARCH_MAX_LENGTH = 1024;
export const BULK_GET_IDS_MAX_SIZE = 100;
export const STATUS_FILTER_MAX_SIZE = Object.keys(maintenanceWindowStatus).length;
export const CATEGORY_IDS_MAX_SIZE = 3;
