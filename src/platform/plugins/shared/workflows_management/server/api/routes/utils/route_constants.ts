/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Common route options used across workflow management routes
 */
export const WORKFLOW_ROUTE_OPTIONS = {
  tags: ['api', 'workflows'],
};

// Pagination constants
export const MAX_PAGE_SIZE = 100;

export const MAX_TRIGGER_EVENT_SEARCH_KQL_LENGTH = 4096;
export const MAX_TRIGGER_EVENT_SEARCH_TIME_STRING_LENGTH = 64;

// Versioned API constants
export const API_VERSION = '2023-10-31';
export const INTERNAL_API_VERSION = '1';
export const OAS_TAG = 'oas-tag:workflows';
export const AVAILABILITY = { since: '9.4.0', stability: 'stable' } as const;

// Maximum size for array parameters in API routes
export const MAX_ARRAY_PARAM_SIZE = 1000;

export const MAX_EXECUTION_FIELD_NAME_LENGTH = 1024;
