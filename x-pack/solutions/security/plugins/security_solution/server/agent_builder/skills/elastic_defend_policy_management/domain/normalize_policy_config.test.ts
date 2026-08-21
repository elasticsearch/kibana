/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { policyFactory } from '../../../../../common/endpoint/models/policy_config';
import type { PolicyConfig } from '../../../../../common/endpoint/types';
import { AntivirusRegistrationModes, ProtectionModes } from '../../../../../common/endpoint/types';
import { normalize } from './normalize_policy_config';

const clonePolicy = (policy: PolicyConfig): PolicyConfig => structuredClone(policy);

describe('normalize', () => {
  it('drops excluded meta and popup messages and preserves popup enabled', () => {
    const policy = policyFactory();
    policy.windows.popup.malware.message = 'custom';
    const enabled = policy.windows.popup.malware.enabled;

    const normalized = normalize(policy);

    expect(normalized).not.toHaveProperty('meta');
    expect(normalized.windows.popup.malware).not.toHaveProperty('message');
    expect(normalized.mac.popup.malware).not.toHaveProperty('message');
    expect(normalized.linux.popup.malware).not.toHaveProperty('message');
    expect(normalized.windows.popup.malware.enabled).toBe(enabled);
    expect(policy.windows.popup.malware.message).toBe('custom');
  });

  it('treats empty and missing OS advanced as equal', () => {
    const emptyAdvanced = policyFactory();
    emptyAdvanced.linux.advanced = {};
    const missingAdvanced = policyFactory();
    delete missingAdvanced.linux.advanced;

    const emptyNormalized = normalize(emptyAdvanced);
    const missingNormalized = normalize(missingAdvanced);

    expect(emptyNormalized.linux).not.toHaveProperty('advanced');
    expect(missingNormalized.linux).not.toHaveProperty('advanced');
  });

  it('recomputes derived antivirus registration without mutating the caller input', () => {
    const policy = policyFactory();
    policy.windows.malware.mode = ProtectionModes.prevent;
    policy.windows.antivirus_registration.mode = AntivirusRegistrationModes.sync;
    policy.windows.antivirus_registration.enabled = false;
    const before = clonePolicy(policy);

    const normalized = normalize(policy);

    expect(normalized.windows.antivirus_registration.enabled).toBe(true);
    expect(policy).toEqual(before);
  });
});
