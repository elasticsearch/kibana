/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { cloneDeep } from 'lodash';
import { FleetPackagePolicyGenerator } from '../../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import { ProtectionModes } from '../../../../../../../common/endpoint/types';
import { createMalwarePolicyAccessor, createRansomwarePolicyAccessor } from './policy_accessor';

const createPolicy = () =>
  new FleetPackagePolicyGenerator('per-os-policy-accessor').generateEndpointPackagePolicy()
    .inputs[0].config.policy.value;

describe('per-OS policy accessor', () => {
  it('reads only the requested OS branch', () => {
    const policy = createPolicy();
    policy.windows.popup.malware.message = 'windows message';
    policy.mac.popup.malware.message = 'mac message';
    policy.linux.popup.malware.message = 'linux message';

    const macPolicy = createMalwarePolicyAccessor(policy, 'mac').read();

    expect(macPolicy).toBe(policy.mac);
    expect(macPolicy.popup.malware.message).toBe('mac message');

    // @ts-expect-error An OS branch does not expose any other OS branch
    expect(macPolicy.windows).toBeUndefined();
  });

  it('updates only the requested OS branch', () => {
    const policy = createPolicy();
    const originalPolicy = cloneDeep(policy);

    const updatedPolicy = createMalwarePolicyAccessor(policy, 'mac').update((macPolicy) => {
      macPolicy.malware.mode = ProtectionModes.off;
      macPolicy.popup.malware.message = 'updated mac message';
    });

    expect(updatedPolicy).not.toBe(policy);
    expect(updatedPolicy.mac.malware.mode).toBe(ProtectionModes.off);
    expect(updatedPolicy.mac.popup.malware.message).toBe('updated mac message');
    expect(updatedPolicy.windows).toEqual(originalPolicy.windows);
    expect(updatedPolicy.linux).toEqual(originalPolicy.linux);
    expect(policy).toEqual(originalPolicy);
  });

  it('rejects capabilities unsupported by the selected OS', () => {
    const policy = createPolicy();
    // @ts-expect-error Linux policies do not support ransomware protection
    const accessor = createRansomwarePolicyAccessor(policy, 'linux');
    expect(accessor.read()).toBe(policy.linux);
  });
});
