/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { cloneDeep } from 'lodash';
import type { Immutable, PolicyConfig } from '../../../../../../../common/endpoint/types';
import type {
  BehaviorProtectionOSes,
  DeviceControlOSes,
  MalwareProtectionOSes,
  MemoryProtectionOSes,
  RansomwareProtectionOSes,
} from '../../../types';

type PerOsPolicyOperatingSystem =
  | MalwareProtectionOSes
  | MemoryProtectionOSes
  | BehaviorProtectionOSes
  | RansomwareProtectionOSes
  | DeviceControlOSes;

export interface PerOsPolicyAccessor<OS extends PerOsPolicyOperatingSystem> {
  read: () => Immutable<PolicyConfig[OS]>;
  update: (updater: (osPolicy: PolicyConfig[OS]) => void) => PolicyConfig;
}

const createPerOsPolicyAccessor = <OS extends PerOsPolicyOperatingSystem>(
  policy: PolicyConfig,
  os: OS
): PerOsPolicyAccessor<OS> => {
  return {
    read: () => policy[os] as Immutable<PolicyConfig[OS]>,
    update: (updater) => {
      const updatedPolicy = cloneDeep(policy);
      updater(updatedPolicy[os]);
      return updatedPolicy;
    },
  };
};

export const createMalwarePolicyAccessor = <OS extends MalwareProtectionOSes>(
  policy: PolicyConfig,
  os: OS
): PerOsPolicyAccessor<OS> => createPerOsPolicyAccessor(policy, os);

export const createMemoryProtectionPolicyAccessor = <OS extends MemoryProtectionOSes>(
  policy: PolicyConfig,
  os: OS
): PerOsPolicyAccessor<OS> => createPerOsPolicyAccessor(policy, os);

export const createBehaviorProtectionPolicyAccessor = <OS extends BehaviorProtectionOSes>(
  policy: PolicyConfig,
  os: OS
): PerOsPolicyAccessor<OS> => createPerOsPolicyAccessor(policy, os);

export const createRansomwarePolicyAccessor = <OS extends RansomwareProtectionOSes>(
  policy: PolicyConfig,
  os: OS
): PerOsPolicyAccessor<OS> => createPerOsPolicyAccessor(policy, os);

export const createDeviceControlPolicyAccessor = <OS extends DeviceControlOSes>(
  policy: PolicyConfig,
  os: OS
): PerOsPolicyAccessor<OS> => createPerOsPolicyAccessor(policy, os);
