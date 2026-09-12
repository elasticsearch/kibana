/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PolicyConfig } from '../../../../../common/endpoint/types';
import { PolicyOperatingSystem } from '../../../../../common/endpoint/types';
import { updateAntivirusRegistrationEnabled } from '../../../../../common/endpoint/utils/update_antivirus_registration_enabled';
import { isExcludedPath } from './field_registry/path_rules';
import type { NormalizedPolicyConfig } from './normalized_policy_config';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asMutableRecord = (value: object): { [key: string]: unknown } =>
  value as { [key: string]: unknown };

const dropExcludedPaths = (value: object, path: string): void => {
  const record = asMutableRecord(value);
  for (const key of Object.keys(record)) {
    const childPath = path === '' ? key : `${path}.${key}`;
    if (isExcludedPath(childPath)) {
      delete record[key];
    } else {
      const child = record[key];
      if (isRecord(child)) {
        dropExcludedPaths(child, childPath);
      }
    }
  }
};

const collapseEmptyOsAdvanced = (policy: PolicyConfig): void => {
  for (const os of Object.values(PolicyOperatingSystem)) {
    const { advanced } = policy[os];
    if (advanced === undefined || Object.keys(advanced).length === 0) {
      delete policy[os].advanced;
    }
  }
};

export const normalize = (policy: PolicyConfig): NormalizedPolicyConfig => {
  const clone = structuredClone(policy);
  dropExcludedPaths(clone, '');
  updateAntivirusRegistrationEnabled(clone);
  collapseEmptyOsAdvanced(clone);
  return clone as NormalizedPolicyConfig;
};
