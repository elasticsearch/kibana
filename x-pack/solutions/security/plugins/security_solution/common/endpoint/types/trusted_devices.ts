/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  OperatingSystem,
  TrustedDeviceConditionEntryField,
} from '@kbn/securitysolution-utils';
import type { EffectScope } from './trusted_apps';

export interface TrustedDeviceConditionEntry<
  T extends TrustedDeviceConditionEntryField = TrustedDeviceConditionEntryField
> {
  field: T;
  type: 'match' | 'wildcard';
  operator: 'included';
  value: string;
}

interface TrustedDeviceConditionEntries {
  os: OperatingSystem.WINDOWS | OperatingSystem.MAC;
  entries: TrustedDeviceConditionEntry[];
}

export type NewTrustedDevice = {
  name: string;
  description?: string;
  effectScope: EffectScope;
} & TrustedDeviceConditionEntries;
