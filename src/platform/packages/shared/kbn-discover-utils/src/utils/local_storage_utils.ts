/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Storage } from '@kbn/kibana-utils-plugin/public';
import type { ResizableLayoutProps } from '@kbn/resizable-layout';

export const CHART_HIDDEN_KEY = 'chartHidden';
export const TABLE_HIDDEN_KEY = 'tableHidden';
export const SIDEBAR_CLOSED_KEY = 'sidebarClosed';
export const HISTOGRAM_HEIGHT_KEY = 'histogramHeight';
export const HISTOGRAM_BREAKDOWN_FIELD_KEY = 'histogramBreakdownField';

const getLocalStorageKey = (prefix: string, key: string) => `${prefix}:${key}`;

/**
 * Get the chart hidden state from local storage
 */
export const getChartHidden = (
  storage: Storage,
  localStorageKeyPrefix: string
): boolean | undefined =>
  storage.get(getLocalStorageKey(localStorageKeyPrefix, CHART_HIDDEN_KEY)) ?? undefined;

/**
 * Get the table hidden state from local storage
 */
export const getTableHidden = (
  storage: Storage,
  localStorageKeyPrefix: string
): boolean | undefined =>
  storage.get(getLocalStorageKey(localStorageKeyPrefix, TABLE_HIDDEN_KEY)) ?? undefined;

/**
 * Get the sidebar (field list) collapsed state from local storage
 */
export const getSidebarClosed = (
  storage: Storage,
  localStorageKeyPrefix: string
): boolean | undefined =>
  storage.get(getLocalStorageKey(localStorageKeyPrefix, SIDEBAR_CLOSED_KEY)) ?? undefined;

/**
 * Get the top panel height from local storage
 */
export const getTopPanelHeight = (
  storage: Storage,
  localStorageKeyPrefix: string
): ResizableLayoutProps['fixedPanelSize'] | undefined =>
  storage.get(getLocalStorageKey(localStorageKeyPrefix, HISTOGRAM_HEIGHT_KEY)) ?? undefined;

/**
 * Get the breakdown field from local storage
 */
export const getBreakdownField = (
  storage: Storage,
  localStorageKeyPrefix: string
): string | undefined =>
  storage.get(getLocalStorageKey(localStorageKeyPrefix, HISTOGRAM_BREAKDOWN_FIELD_KEY)) ??
  undefined;

/**
 * Set the chart hidden state in local storage
 */
export const setChartHidden = (
  storage: Storage,
  localStorageKeyPrefix: string,
  chartHidden: boolean | undefined
) => storage.set(getLocalStorageKey(localStorageKeyPrefix, CHART_HIDDEN_KEY), chartHidden);

/**
 * Set the table hidden state in local storage
 */
export const setTableHidden = (
  storage: Storage,
  localStorageKeyPrefix: string,
  tableHidden: boolean | undefined
) => storage.set(getLocalStorageKey(localStorageKeyPrefix, TABLE_HIDDEN_KEY), tableHidden);

/**
 * Set the sidebar (field list) collapsed state in local storage
 */
export const setSidebarClosed = (
  storage: Storage,
  localStorageKeyPrefix: string,
  sidebarClosed: boolean | undefined
) => storage.set(getLocalStorageKey(localStorageKeyPrefix, SIDEBAR_CLOSED_KEY), sidebarClosed);

/**
 * Set the top panel height in local storage
 */
export const setTopPanelHeight = (
  storage: Storage,
  localStorageKeyPrefix: string,
  topPanelHeight: ResizableLayoutProps['fixedPanelSize']
) => storage.set(getLocalStorageKey(localStorageKeyPrefix, HISTOGRAM_HEIGHT_KEY), topPanelHeight);

/**
 * Set the breakdown field in local storage
 */
export const setBreakdownField = (
  storage: Storage,
  localStorageKeyPrefix: string,
  breakdownField: string | undefined
) =>
  storage.set(
    getLocalStorageKey(localStorageKeyPrefix, HISTOGRAM_BREAKDOWN_FIELD_KEY),
    breakdownField
  );
