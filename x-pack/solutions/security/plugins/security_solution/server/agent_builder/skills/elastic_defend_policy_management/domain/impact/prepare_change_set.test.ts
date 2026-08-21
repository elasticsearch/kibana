/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { policyFactory } from '../../../../../../common/endpoint/models/policy_config';
import { AntivirusRegistrationModes } from '../../../../../../common/endpoint/types';
import { prepareChangeSet } from './prepare_change_set';
import type { AssessPolicyChangeParams, PolicyChangeOperation } from './policy_change_operation';

const typedRequest = (
  changes: PolicyChangeOperation[],
  idOrName = 'policy-1'
): AssessPolicyChangeParams => ({
  idOrName,
  changes,
});

describe('prepareChangeSet', () => {
  it('classifies antivirus enabled only as a side effect after normalize', () => {
    const malwareOff = prepareChangeSet(
      typedRequest([{ op: 'set_protection_enabled', protection: 'malware', enabled: false }]),
      policyFactory()
    );

    expect(malwareOff.explicitChanges.map((change) => change.path)).not.toContain(
      'windows.antivirus_registration.enabled'
    );
    expect(malwareOff.sideEffects).toEqual([
      expect.objectContaining({
        path: 'windows.antivirus_registration.enabled',
        from: true,
        to: false,
        reason: 'derived_field_update',
      }),
    ]);

    const ransomwareOff = prepareChangeSet(
      typedRequest([{ op: 'set_protection_enabled', protection: 'ransomware', enabled: false }]),
      policyFactory()
    );
    expect(ransomwareOff.sideEffects).toEqual([]);

    const avMode = prepareChangeSet(
      typedRequest([
        {
          op: 'set_field',
          path: 'windows.antivirus_registration.mode',
          value: AntivirusRegistrationModes.disabled,
        },
      ]),
      policyFactory()
    );
    expect(avMode.explicitChanges.map((change) => change.path)).toEqual([
      'windows.antivirus_registration.mode',
    ]);
    expect(avMode.sideEffects).toEqual([
      expect.objectContaining({
        path: 'windows.antivirus_registration.enabled',
        from: true,
        to: false,
        reason: 'derived_field_update',
      }),
    ]);
  });
});
