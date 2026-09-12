/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { NormalizedPolicyConfig } from './normalized_policy_config';
import { policyValuesEqual } from './policy_value_equality';

export interface PolicyDiffEntry {
  readonly path: string;
  readonly from: unknown;
  readonly to: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const childPath = (path: string, key: string): string => (path === '' ? key : `${path}.${key}`);

const collectDiffs = (fromValue: unknown, toValue: unknown, path: string): PolicyDiffEntry[] => {
  if (policyValuesEqual(fromValue, toValue)) {
    return [];
  }

  if (isRecord(fromValue) && isRecord(toValue)) {
    const keys = new Set([...Object.keys(fromValue), ...Object.keys(toValue)]);
    return [...keys].flatMap((key) => {
      const fromHas = Object.hasOwn(fromValue, key);
      const toHas = Object.hasOwn(toValue, key);
      const nextPath = childPath(path, key);

      if (!fromHas) {
        return [{ path: nextPath, from: undefined, to: toValue[key] }];
      }
      if (!toHas) {
        return [{ path: nextPath, from: fromValue[key], to: undefined }];
      }
      return collectDiffs(fromValue[key], toValue[key], nextPath);
    });
  }

  return [{ path, from: fromValue, to: toValue }];
};

export const diffPolicyConfig = (
  a: NormalizedPolicyConfig,
  b: NormalizedPolicyConfig
): readonly PolicyDiffEntry[] => collectDiffs(a, b, '');
