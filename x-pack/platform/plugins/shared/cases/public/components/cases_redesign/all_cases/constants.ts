/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const CUSTOM_FIELD_KEY_PREFIX = 'cf_';
export const ALL_CASES_STATE_URL_KEY = 'cases';

export const LEGACY_SUPPORTED_STATE_KEYS = [
  'status',
  'severity',
  'page',
  'perPage',
  'sortField',
  'sortOrder',
] as const;

export const VIEW_TOGGLE_LIST_ID = 'list' as const;
export const VIEW_TOGGLE_TABLE_ID = 'table' as const;

export type ViewToggleId = typeof VIEW_TOGGLE_LIST_ID | typeof VIEW_TOGGLE_TABLE_ID;

/**
 * Fields rendered directly in every list item (title row + meta row).
 * The Fields popover excludes these so users only toggle optional extras.
 */
export const LIST_ALWAYS_VISIBLE_FIELDS = [
  'title',
  'assignees',
  'createdBy',
  'updatedAt',
  'status',
  'severity',
];
