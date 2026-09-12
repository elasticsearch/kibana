/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { licenseMock } from '@kbn/licensing-plugin/common/licensing.mock';
import { FleetPackagePolicyGenerator } from '../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import { policyFactory } from '../../../../../../common/endpoint/models/policy_config';
import { ProtectionModes, type PolicyConfig } from '../../../../../../common/endpoint/types';
import { createEndpointPolicySnapshot } from '../endpoint_policy_snapshot';
import { normalizeEndpointPolicy } from '../normalized_endpoint_policy';
import { buildPolicyChangeAssessment } from './build_policy_change_assessment';
import type { PolicyChangeCapabilities } from './build_policy_change_assessment';

const generator = new FleetPackagePolicyGenerator();

const capabilities = (
  licenseInformation = licenseMock.createLicense({ license: { type: 'enterprise' } })
): PolicyChangeCapabilities => ({
  licenseInformation,
  endpointPolicyProtections: true,
  endpointTrustedDevices: true,
  trustedDevicesExperimental: true,
  endpointProtectionUpdates: true,
  serverless: false,
});

const createPolicy = (storedConfig: PolicyConfig) => {
  const packagePolicy = generator.generateEndpointPackagePolicy({
    id: 'policy-1',
    name: 'Endpoint Policy',
    version: 'WzEsMV0=',
  });
  const policyEntry = packagePolicy.inputs[0]?.config?.policy;
  if (policyEntry == null) {
    throw new Error('expected generated endpoint package policy to include config.policy');
  }
  policyEntry.value = storedConfig;
  return normalizeEndpointPolicy(createEndpointPolicySnapshot(packagePolicy));
};

describe('buildPolicyChangeAssessment', () => {
  it('attributes a save-blocking manifest to the direct path and one global blocker', () => {
    const stored = policyFactory();
    stored.windows.malware.mode = ProtectionModes.prevent;
    const assessment = buildPolicyChangeAssessment(
      createPolicy(stored),
      [
        { op: 'set_field', path: 'windows.malware.mode', value: ProtectionModes.detect },
        { op: 'set_field', path: 'global_manifest_version', value: '2020-01-01' },
      ],
      capabilities()
    );
    const malwareChange = assessment.changes.find(
      (change) => change.path === 'windows.malware.mode'
    );
    const manifestChange = assessment.changes.find(
      (change) => change.path === 'global_manifest_version'
    );

    expect(malwareChange?.eligibility).toEqual({ eligible: true });
    expect(manifestChange?.eligibility).toEqual({
      eligible: false,
      reason: 'global_manifest_version_too_old',
    });
    expect(assessment.globalBlockers).toEqual([{ reason: 'global_manifest_version_too_old' }]);
  });

  it('adds one generic blocker when the final policy retains a stale license-invalid feature', () => {
    const stored = policyFactory();
    stored.windows.popup.malware.enabled = false;

    const assessment = buildPolicyChangeAssessment(
      createPolicy(stored),
      [{ op: 'set_field', path: 'windows.malware.mode', value: ProtectionModes.detect }],
      capabilities(licenseMock.createLicense({ license: { type: 'gold' } }))
    );

    expect(assessment.changes[0]?.eligibility).toEqual({ eligible: true });
    expect(assessment.globalBlockers).toEqual([{ reason: 'license_invalid_policy' }]);
  });

  it('does not block an unrelated change when the stored global_manifest_version is absent', () => {
    const stored = policyFactory();
    stored.windows.malware.mode = ProtectionModes.prevent;
    delete (stored as unknown as { global_manifest_version?: unknown }).global_manifest_version;

    const assessment = buildPolicyChangeAssessment(
      createPolicy(stored),
      [{ op: 'set_field', path: 'windows.malware.mode', value: ProtectionModes.detect }],
      capabilities()
    );

    expect(assessment.changes[0]?.eligibility).toEqual({ eligible: true });
    expect(assessment.globalBlockers).toEqual([]);
  });
});
