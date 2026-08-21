/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { licenseMock } from '@kbn/licensing-plugin/common/licensing.mock';
import type { ILicense } from '@kbn/licensing-types';
import moment from 'moment';
import { policyFactory } from '../../../../../../common/endpoint/models/policy_config';
import type { PolicyConfig } from '../../../../../../common/endpoint/types';
import { DeviceControlAccessLevel } from '../../../../../../common/endpoint/types';
import { buildEligibilityContext } from './build_eligibility_context';
import { computePathEligibility } from './compute_path_eligibility';
import type { EligibilityContext } from './policy_change_operation';

const Gold = licenseMock.createLicense({ license: { type: 'gold', mode: 'gold' } });
const Platinum = licenseMock.createLicense({ license: { type: 'platinum', mode: 'platinum' } });
const Enterprise = licenseMock.createLicense({ license: { type: 'enterprise' } });

const eligibilityContext = (
  proposedConfig: PolicyConfig,
  options: {
    license?: ILicense;
    endpointPolicyProtections?: boolean;
    endpointTrustedDevices?: boolean;
    trustedDevicesExperimental?: boolean;
    endpointProtectionUpdates?: boolean;
    serverless?: boolean;
  } = {}
): EligibilityContext =>
  buildEligibilityContext({
    proposedConfig,
    licenseInformation: options.license ?? Enterprise,
    endpointPolicyProtections: options.endpointPolicyProtections ?? true,
    endpointTrustedDevices: options.endpointTrustedDevices ?? true,
    trustedDevicesExperimental: options.trustedDevicesExperimental ?? true,
    endpointProtectionUpdates: options.endpointProtectionUpdates ?? true,
    serverless: options.serverless ?? false,
  });

const recentManifestDate = (): string => moment.utc().subtract(1, 'day').format('YYYY-MM-DD');

describe('computePathEligibility', () => {
  it('marks tty_io ineligible when session_data is off in the proposed config', () => {
    const proposed = policyFactory();
    proposed.linux.events.tty_io = true;
    const context = eligibilityContext(proposed);

    expect(computePathEligibility('linux.events.tty_io', context)).toEqual({
      eligible: false,
      reason: 'tty_io_requires_session_data',
    });
  });

  it('marks session_data ineligible when process is off in the proposed config', () => {
    const proposed = policyFactory();
    proposed.linux.events.process = false;
    proposed.linux.events.session_data = true;
    const context = eligibilityContext(proposed);

    expect(computePathEligibility('linux.events.session_data', context)).toEqual({
      eligible: false,
      reason: 'session_data_requires_process',
    });
  });

  it('marks a session_data change to false eligible while process is off', () => {
    const proposed = policyFactory();
    proposed.linux.events.process = false;
    proposed.linux.events.session_data = false;
    const context = eligibilityContext(proposed);

    expect(computePathEligibility('linux.events.session_data', context)).toEqual({
      eligible: true,
    });
  });

  it('keeps unrelated paths eligible when the proposed global_manifest_version is stale', () => {
    const proposed = policyFactory();
    proposed.global_manifest_version = '2020-01-01';
    const context = eligibilityContext(proposed);

    expect(computePathEligibility('linux.events.process', context)).toEqual({ eligible: true });
  });

  it('keeps unrelated paths eligible when the stored version is latest and endpointProtectionUpdates is disabled', () => {
    const proposed = policyFactory();
    proposed.global_manifest_version = 'latest';
    const context = eligibilityContext(proposed, { endpointProtectionUpdates: false });

    expect(computePathEligibility('linux.events.process', context)).toEqual({ eligible: true });
  });

  it('marks platinum protections ineligible on gold while malware mode stays eligible', () => {
    const context = eligibilityContext(policyFactory(), { license: Gold });

    expect(computePathEligibility('windows.ransomware.mode', context)).toEqual({
      eligible: false,
      reason: 'license_below_platinum',
    });
    const disabledMalwarePopup = policyFactory();
    disabledMalwarePopup.windows.popup.malware.enabled = false;
    expect(
      computePathEligibility(
        'windows.popup.malware.enabled',
        eligibilityContext(disabledMalwarePopup, { license: Gold })
      )
    ).toEqual({
      eligible: false,
      reason: 'license_below_platinum',
    });
    expect(computePathEligibility('windows.malware.mode', context)).toEqual({ eligible: true });
    expect(computePathEligibility('windows.antivirus_registration.enabled', context)).toEqual({
      eligible: true,
    });
    expect(computePathEligibility('linux.events.process', context)).toEqual({ eligible: true });
  });

  it('marks device_control and global_manifest_version ineligible on platinum', () => {
    const proposed = policyFactory();
    proposed.global_manifest_version = recentManifestDate();
    const context = eligibilityContext(proposed, { license: Platinum });

    expect(computePathEligibility('windows.device_control.enabled', context)).toEqual({
      eligible: false,
      reason: 'license_below_enterprise',
    });
    expect(computePathEligibility('mac.popup.device_control.enabled', context)).toEqual({
      eligible: false,
      reason: 'license_below_enterprise',
    });
    expect(computePathEligibility('global_manifest_version', context)).toEqual({
      eligible: false,
      reason: 'license_below_enterprise',
    });
    expect(computePathEligibility('windows.ransomware.mode', context)).toEqual({ eligible: true });
    expect(computePathEligibility('windows.malware.mode', context)).toEqual({ eligible: true });
    expect(computePathEligibility('linux.events.process', context)).toEqual({ eligible: true });
  });

  it('marks a dated global_manifest_version ineligible when endpointProtectionUpdates is disabled', () => {
    const proposed = policyFactory();
    proposed.global_manifest_version = '2024-01-01';
    const context = eligibilityContext(proposed, { endpointProtectionUpdates: false });

    expect(computePathEligibility('global_manifest_version', context)).toEqual({
      eligible: false,
      reason: 'endpoint_protection_updates_disabled',
    });
  });

  it('rejects a global_manifest_version with an invalid date format', () => {
    const proposed = policyFactory();
    proposed.global_manifest_version = 'not-a-date';
    const context = eligibilityContext(proposed);

    expect(computePathEligibility('global_manifest_version', context)).toEqual({
      eligible: false,
      reason: 'global_manifest_version_invalid_format',
    });
  });

  it('keeps product-feature gating in serverless', () => {
    const context = eligibilityContext(policyFactory(), {
      serverless: true,
      endpointPolicyProtections: false,
    });

    expect(computePathEligibility('windows.malware.mode', context)).toEqual({
      eligible: false,
      reason: 'endpoint_policy_protections_disabled',
    });
    expect(computePathEligibility('linux.events.process', context)).toEqual({ eligible: true });
  });

  it('marks protection paths ineligible when endpointPolicyProtections is disabled', () => {
    const context = eligibilityContext(policyFactory(), {
      endpointPolicyProtections: false,
    });

    expect(computePathEligibility('windows.malware.mode', context)).toEqual({
      eligible: false,
      reason: 'endpoint_policy_protections_disabled',
    });
    expect(computePathEligibility('windows.popup.malware.enabled', context)).toEqual({
      eligible: false,
      reason: 'endpoint_policy_protections_disabled',
    });
    expect(computePathEligibility('linux.events.process', context)).toEqual({ eligible: true });
  });

  it('marks device_control ineligible when trusted devices product feature is disabled', () => {
    const context = eligibilityContext(policyFactory(), { endpointTrustedDevices: false });

    expect(computePathEligibility('windows.device_control.enabled', context)).toEqual({
      eligible: false,
      reason: 'endpoint_trusted_devices_disabled',
    });
    expect(computePathEligibility('mac.popup.device_control.enabled', context)).toEqual({
      eligible: false,
      reason: 'endpoint_trusted_devices_disabled',
    });
    expect(computePathEligibility('windows.malware.mode', context)).toEqual({ eligible: true });
  });

  it('marks device_control ineligible when trustedDevices experimental flag is off', () => {
    const context = eligibilityContext(policyFactory(), { trustedDevicesExperimental: false });

    expect(computePathEligibility('windows.device_control.enabled', context)).toEqual({
      eligible: false,
      reason: 'trusted_devices_experimental_disabled',
    });
    expect(computePathEligibility('windows.malware.mode', context)).toEqual({ eligible: true });
  });

  it('marks platinum usb_storage read_only eligible when device_control is disabled', () => {
    const proposed = policyFactory();
    proposed.windows.device_control = {
      enabled: false,
      usb_storage: DeviceControlAccessLevel.read_only,
    };
    const context = eligibilityContext(proposed, { license: Platinum });

    expect(computePathEligibility('windows.device_control.usb_storage', context)).toEqual({
      eligible: true,
    });
  });

  it('marks gold linux.behavior_protection.reputation_service true eligible', () => {
    const proposed = policyFactory();
    proposed.linux.behavior_protection.reputation_service = true;
    const context = eligibilityContext(proposed, { license: Gold });

    expect(computePathEligibility('linux.behavior_protection.reputation_service', context)).toEqual(
      { eligible: true }
    );
  });
});
