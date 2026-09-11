/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALL_SPACES_ID } from '@kbn/spaces-plugin/common/constants';
import {
  type ConfigKey,
  type SyntheticsMonitor,
  MonitorTypeEnum,
} from '../../../common/runtime_types';
import { PARAMS_KEYS_TO_SKIP } from './common';

export const SHELL_PARAMS_REGEX = /\$\{[a-zA-Z_][a-zA-Z0-9\._\-?:]*\}/g;

/**
 * Returns the effective params for a monitor living in `spaceId`, always folding in
 * params that are shared across all spaces (`ALL_SPACES_ID`).
 *
 * `getSyntheticsParams` buckets params by their own `namespaces`, so a param shared
 * across all spaces only ever lands in the `'*'` bucket. When that method is called
 * with `spaceId: '*'` (the global-params sync path), it never materializes a bucket
 * for a concrete space that has no space-specific params, so a direct
 * `paramsBySpace[spaceId]` lookup returns `undefined` and silently drops the shared
 * params. Callers that inject params into private-location configs must go through
 * this helper (or the equivalent spread) so shared params are never lost.
 */
export const getParamsForSpace = (
  paramsBySpace: Record<string, Record<string, string>>,
  spaceId: string
): Record<string, string> => ({
  ...(paramsBySpace[spaceId] ?? {}),
  ...(paramsBySpace[ALL_SPACES_ID] ?? {}),
});

export const hasNoParams = (strVal: string) => {
  return strVal.match(SHELL_PARAMS_REGEX) === null;
};

/**
 * Extracts all parameter names referenced in a string using ${paramName} syntax.
 * Handles optional default values (${paramName:default}) and nested syntax.
 *
 * @param strVal - The string to extract parameter references from
 * @returns Array of unique parameter names found in the string
 */
export const extractParamReferences = (strVal: string): string[] => {
  const matches = strVal.match(SHELL_PARAMS_REGEX);
  if (!matches) {
    return [];
  }

  const paramNames = new Set<string>();
  for (const match of matches) {
    // Remove ${ and } and extract just the param name (before any : for defaults)
    const content = match.slice(2, -1);
    // Handle ${paramName:default} syntax - extract just the param name
    const paramName = content.split(':')[0].split('?')[0];
    if (paramName) {
      paramNames.add(paramName);
    }
  }

  return Array.from(paramNames);
};

/**
 * Checks if a value (string, object, or array) contains any global parameter references.
 *
 * @param value - The value to check for parameter references
 * @returns true if the value contains at least one parameter reference
 */
export const valueContainsParams = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return !hasNoParams(value);
  }

  if (typeof value === 'object') {
    const strValue = JSON.stringify(value);
    return !hasNoParams(strValue);
  }

  return false;
};

/**
 * Checks if a monitor configuration uses global parameters.
 *
 * For lightweight monitors (HTTP, TCP, ICMP): checks for ${paramName} syntax in fields.
 * For browser monitors: always returns true since they access params via JavaScript
 * (params.paramName) which we cannot reliably detect by scanning the script content.
 *
 * @param monitor - The monitor configuration to check
 * @param modifiedParamKeys - Optional array of specific param keys to check for.
 *                            If provided, only checks if the monitor uses any of these specific params.
 *                            If not provided, checks if the monitor uses any global params.
 * @returns true if the monitor uses at least one global parameter reference
 */
export const monitorUsesGlobalParams = (
  monitor: SyntheticsMonitor,
  modifiedParamKeys?: string[]
): boolean => {
  // Browser and API monitors access params via JavaScript (`params.paramName`)
  // which cannot be reliably detected by scanning script content, so assume
  // they always use global params.
  if (monitor.type === MonitorTypeEnum.BROWSER || monitor.type === MonitorTypeEnum.API) {
    return true;
  }

  const modifiedSet =
    modifiedParamKeys && modifiedParamKeys.length > 0 ? new Set(modifiedParamKeys) : undefined;
  const keysToCheck = Object.keys(monitor) as Array<keyof SyntheticsMonitor>;

  for (const key of keysToCheck) {
    if (PARAMS_KEYS_TO_SKIP.includes(key as ConfigKey)) {
      continue;
    }

    const value = monitor[key];
    if (value === null || value === undefined) {
      continue;
    }

    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
    const params = extractParamReferences(strValue);

    if (params.length === 0) {
      continue;
    }

    if (!modifiedSet) {
      return true;
    }

    if (params.some((p) => modifiedSet.has(p))) {
      return true;
    }
  }

  return false;
};
