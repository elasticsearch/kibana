/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import userEvent from '@testing-library/user-event';
import { cloneDeep } from 'lodash';
import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { useLicense as _useLicense } from '../../../../../../common/hooks/use_license';
import { licenseService as licenseServiceMocked } from '../../../../../../common/hooks/__mocks__/use_license';
import { createLicenseServiceMock } from '../../../../../../../common/license/mocks';
import { FleetPackagePolicyGenerator } from '../../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import type { PolicyConfig } from '../../../../../../../common/endpoint/types';
import { PolicyOperatingSystem, ProtectionModes } from '../../../../../../../common/endpoint/types';
import { PerOsReputationService } from './per_os_reputation_service';
import { createBehaviorProtectionPolicyAccessor } from './policy_accessor';

jest.mock('../../../../../../common/hooks/use_license');

const useLicenseMock = _useLicense as jest.Mock;

describe('PerOsReputationService', () => {
  let mockedContext: AppContextTestRender;
  let policy: PolicyConfig;
  let onChange: jest.Mock;
  let renderResult: ReturnType<AppContextTestRender['render']>;

  beforeEach(() => {
    mockedContext = createAppRootMockRenderer();
    mockedContext.startServices.cloud!.isCloudEnabled = true;
    policy = new FleetPackagePolicyGenerator('seed').generateEndpointPackagePolicy().inputs[0]
      .config.policy.value;
    onChange = jest.fn();
  });

  afterEach(() => {
    useLicenseMock.mockReturnValue(licenseServiceMocked);
  });

  it("reads the enabled and checked state from the accessor's OS only", () => {
    policy.windows.behavior_protection.mode = ProtectionModes.off;
    policy.windows.behavior_protection.reputation_service = true;
    policy.mac.behavior_protection.mode = ProtectionModes.prevent;
    policy.mac.behavior_protection.reputation_service = true;

    renderResult = mockedContext.render(
      <>
        <PerOsReputationService
          accessor={createBehaviorProtectionPolicyAccessor(policy, PolicyOperatingSystem.windows)}
          onChange={onChange}
          data-test-subj="windows-reputation"
        />
        <PerOsReputationService
          accessor={createBehaviorProtectionPolicyAccessor(policy, PolicyOperatingSystem.mac)}
          onChange={onChange}
          data-test-subj="mac-reputation"
        />
      </>
    );

    expect(renderResult.getByTestId('windows-reputation-checkbox')).toBeDisabled();
    expect(renderResult.getByTestId('windows-reputation-checkbox')).not.toBeChecked();
    expect(renderResult.getByTestId('mac-reputation-checkbox')).toBeEnabled();
    expect(renderResult.getByTestId('mac-reputation-checkbox')).toBeChecked();
  });

  it('setting macOS reputation_service leaves the Windows and Linux branches byte-identical', async () => {
    policy.mac.behavior_protection.mode = ProtectionModes.prevent;
    policy.mac.behavior_protection.reputation_service = true;
    const windowsBefore = cloneDeep(policy.windows);
    const linuxBefore = cloneDeep(policy.linux);

    renderResult = mockedContext.render(
      <PerOsReputationService
        accessor={createBehaviorProtectionPolicyAccessor(policy, PolicyOperatingSystem.mac)}
        onChange={onChange}
        data-test-subj="mac-reputation"
      />
    );
    await userEvent.click(renderResult.getByTestId('mac-reputation-checkbox'));

    const updatedPolicy = onChange.mock.calls[0][0].updatedPolicy as PolicyConfig;
    expect(updatedPolicy.mac.behavior_protection.reputation_service).toBe(false);
    expect(updatedPolicy.windows).toEqual(windowsBefore);
    expect(updatedPolicy.linux).toEqual(linuxBefore);
  });

  it('does not render outside cloud', () => {
    mockedContext.startServices.cloud!.isCloudEnabled = false;

    renderResult = mockedContext.render(
      <PerOsReputationService
        accessor={createBehaviorProtectionPolicyAccessor(policy, PolicyOperatingSystem.windows)}
        onChange={onChange}
        data-test-subj="windows-reputation"
      />
    );

    expect(renderResult.queryByTestId('windows-reputation')).not.toBeInTheDocument();
  });

  it('does not render below Platinum', () => {
    const licenseServiceMock = createLicenseServiceMock();
    licenseServiceMock.isPlatinumPlus.mockReturnValue(false);
    useLicenseMock.mockReturnValue(licenseServiceMock);

    renderResult = mockedContext.render(
      <PerOsReputationService
        accessor={createBehaviorProtectionPolicyAccessor(policy, PolicyOperatingSystem.windows)}
        onChange={onChange}
        data-test-subj="windows-reputation"
      />
    );

    expect(renderResult.queryByTestId('windows-reputation')).not.toBeInTheDocument();
  });
});
