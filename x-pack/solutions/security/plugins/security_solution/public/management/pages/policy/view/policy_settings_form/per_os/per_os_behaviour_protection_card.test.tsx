/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import userEvent from '@testing-library/user-event';
import { within } from '@testing-library/react';
import { cloneDeep } from 'lodash';
import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { useLicense as _useLicense } from '../../../../../../common/hooks/use_license';
import { licenseService as licenseServiceMocked } from '../../../../../../common/hooks/__mocks__/use_license';
import { createLicenseServiceMock } from '../../../../../../../common/license/mocks';
import { FleetPackagePolicyGenerator } from '../../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import type { PolicyConfig } from '../../../../../../../common/endpoint/types';
import { PolicyOperatingSystem, ProtectionModes } from '../../../../../../../common/endpoint/types';
import { getPolicySettingsFormTestSubjects } from '../mocks';
import type { PerOsBehaviourProtectionCardProps } from './per_os_behaviour_protection_card';
import { PerOsBehaviourProtectionCard } from './per_os_behaviour_protection_card';

jest.mock('../../../../../../common/hooks/use_license');

const useLicenseMock = _useLicense as jest.Mock;
const BEHAVIOUR_OS_VALUES = [
  PolicyOperatingSystem.windows,
  PolicyOperatingSystem.mac,
  PolicyOperatingSystem.linux,
] as const;

describe('PerOsBehaviourProtectionCard', () => {
  const testSubj = getPolicySettingsFormTestSubjects('test').perOsBehaviour;
  let policy: PolicyConfig;
  let props: PerOsBehaviourProtectionCardProps;
  let mockedContext: AppContextTestRender;
  let renderResult: ReturnType<AppContextTestRender['render']>;

  const render = (nextPolicy: PolicyConfig = policy) => {
    renderResult = mockedContext.render(
      <PerOsBehaviourProtectionCard {...props} policy={nextPolicy} />
    );
    return renderResult;
  };
  const rerender = (nextPolicy: PolicyConfig) => {
    renderResult.rerender(<PerOsBehaviourProtectionCard {...props} policy={nextPolicy} />);
  };
  const getUpdatedPolicy = (): PolicyConfig => {
    const onChange = props.onChange as jest.Mock;
    return onChange.mock.calls[onChange.mock.calls.length - 1][0].updatedPolicy;
  };

  beforeEach(() => {
    mockedContext = createAppRootMockRenderer();
    mockedContext.startServices.cloud!.isCloudEnabled = true;
    policy = new FleetPackagePolicyGenerator('seed').generateEndpointPackagePolicy().inputs[0]
      .config.policy.value;
    props = {
      policy,
      onChange: jest.fn(),
      mode: 'edit',
      'data-test-subj': testSubj.card,
    };
  });

  afterEach(() => {
    useLicenseMock.mockReturnValue(licenseServiceMocked);
  });

  it('renders a row for each supported operating system', () => {
    render();

    expect(renderResult.getByTestId(testSubj.windows.row)).toHaveTextContent('Windows');
    expect(renderResult.getByTestId(testSubj.mac.row)).toHaveTextContent('Mac');
    expect(renderResult.getByTestId(testSubj.linux.row)).toHaveTextContent('Linux');
  });

  it("reads every row control and disabled state from that row's own OS branch", () => {
    policy.windows.behavior_protection.mode = ProtectionModes.off;
    policy.windows.behavior_protection.reputation_service = true;
    policy.windows.popup.behavior_protection.enabled = false;
    policy.mac.behavior_protection.mode = ProtectionModes.prevent;
    policy.mac.behavior_protection.reputation_service = true;
    policy.mac.popup.behavior_protection.enabled = true;
    policy.linux.behavior_protection.mode = ProtectionModes.detect;
    policy.linux.behavior_protection.reputation_service = false;
    policy.linux.popup.behavior_protection.enabled = false;
    render();

    expect(renderResult.getByTestId(testSubj.windows.modeSelect)).toHaveTextContent(/^Disable$/);
    expect(renderResult.getByTestId(testSubj.mac.modeSelect)).toHaveTextContent(
      /^Detect & prevent$/
    );
    expect(renderResult.getByTestId(testSubj.linux.modeSelect)).toHaveTextContent(/^Detect$/);
    expect(
      renderResult.queryByTestId(testSubj.windows.reputationServiceCheckbox)
    ).not.toBeInTheDocument();
    expect(renderResult.getByTestId(testSubj.mac.reputationServiceCheckbox)).toBeEnabled();
    expect(renderResult.getByTestId(testSubj.mac.reputationServiceCheckbox)).toBeChecked();
    expect(renderResult.queryByTestId(testSubj.windows.notifyUserCheckbox)).not.toBeInTheDocument();
    expect(renderResult.getByTestId(testSubj.mac.notifyUserCheckbox)).toBeChecked();
  });

  it('a row at Disable renders its mode dropdown and no reputation control or notify panel', () => {
    policy.windows.behavior_protection.mode = ProtectionModes.off;
    policy.mac.behavior_protection.mode = ProtectionModes.detect;
    render();

    const windowsRow = within(renderResult.getByTestId(testSubj.windows.row));
    expect(renderResult.getByTestId(testSubj.windows.modeSelect)).toHaveTextContent(/^Disable$/);
    expect(
      renderResult.queryByTestId(testSubj.windows.reputationServiceCheckbox)
    ).not.toBeInTheDocument();
    expect(windowsRow.queryByText('Notify user')).not.toBeInTheDocument();
  });

  it('with Windows at Disable and macOS at Detect, macOS still shows all its controls', () => {
    policy.windows.behavior_protection.mode = ProtectionModes.off;
    policy.mac.behavior_protection.mode = ProtectionModes.detect;
    policy.mac.behavior_protection.reputation_service = true;
    policy.mac.popup.behavior_protection.enabled = true;
    render();

    expect(renderResult.getByTestId(testSubj.mac.reputationServiceCheckbox)).toBeEnabled();
    expect(renderResult.getByTestId(testSubj.mac.notifyUserCheckbox)).toBeEnabled();
    expect(renderResult.getByTestId(testSubj.mac.notifyCustomMessage)).toBeInTheDocument();
  });

  it('setting a row to Disable and back to Detect preserves reputation_service and notify values in every emitted updatedPolicy', async () => {
    policy.windows.behavior_protection.mode = ProtectionModes.detect;
    policy.windows.behavior_protection.reputation_service = true;
    policy.windows.popup.behavior_protection.enabled = true;
    policy.windows.popup.behavior_protection.message = 'keep me';
    render();

    await userEvent.click(renderResult.getByTestId(testSubj.windows.modeSelect));
    await userEvent.click(renderResult.getByRole('option', { name: /^Disable$/ }));
    const afterDisable = getUpdatedPolicy();
    expect(afterDisable.windows.behavior_protection.reputation_service).toBe(true);
    expect(afterDisable.windows.popup.behavior_protection.enabled).toBe(true);
    expect(afterDisable.windows.popup.behavior_protection.message).toBe('keep me');

    rerender(afterDisable);
    expect(
      renderResult.queryByTestId(testSubj.windows.reputationServiceCheckbox)
    ).not.toBeInTheDocument();
    expect(renderResult.queryByTestId(testSubj.windows.notifyUserCheckbox)).not.toBeInTheDocument();

    await userEvent.click(renderResult.getByTestId(testSubj.windows.modeSelect));
    await userEvent.click(renderResult.getByRole('option', { name: /^Detect$/ }));
    const afterDetect = getUpdatedPolicy();
    expect(afterDetect.windows.behavior_protection.reputation_service).toBe(true);
    expect(afterDetect.windows.popup.behavior_protection.enabled).toBe(true);
    expect(afterDetect.windows.popup.behavior_protection.message).toBe('keep me');
  });

  it("setting a non-Windows OS's mode, reputation_service, or notify value leaves the other two OS branches byte-identical", async () => {
    policy.mac.behavior_protection.mode = ProtectionModes.prevent;
    policy.mac.behavior_protection.reputation_service = true;
    policy.mac.popup.behavior_protection.enabled = true;
    const windowsBefore = cloneDeep(policy.windows);
    const linuxBefore = cloneDeep(policy.linux);
    render();

    await userEvent.click(renderResult.getByTestId(testSubj.mac.modeSelect));
    await userEvent.click(renderResult.getByRole('option', { name: /^Detect$/ }));
    const afterMode = getUpdatedPolicy();
    expect(afterMode.mac.behavior_protection.mode).toBe(ProtectionModes.detect);
    expect(afterMode.windows).toEqual(windowsBefore);
    expect(afterMode.linux).toEqual(linuxBefore);

    (props.onChange as jest.Mock).mockClear();
    rerender(afterMode);
    await userEvent.click(renderResult.getByTestId(testSubj.mac.reputationServiceCheckbox));
    const afterReputation = getUpdatedPolicy();
    expect(afterReputation.mac.behavior_protection.reputation_service).toBe(false);
    expect(afterReputation.windows).toEqual(windowsBefore);
    expect(afterReputation.linux).toEqual(linuxBefore);

    (props.onChange as jest.Mock).mockClear();
    rerender(afterReputation);
    await userEvent.click(renderResult.getByTestId(testSubj.mac.notifyUserCheckbox));
    const afterNotify = getUpdatedPolicy();
    expect(afterNotify.mac.popup.behavior_protection.enabled).toBe(false);
    expect(afterNotify.windows).toEqual(windowsBefore);
    expect(afterNotify.linux).toEqual(linuxBefore);
  });

  it('master toggle off sets every OS mode off and reputation_service false; on sets prevent and true', async () => {
    for (const os of BEHAVIOUR_OS_VALUES) {
      policy[os].behavior_protection.mode = ProtectionModes.detect;
      policy[os].behavior_protection.reputation_service = true;
      policy[os].popup.behavior_protection.enabled = true;
    }
    const expectedOffPolicy = cloneDeep(policy);
    for (const os of BEHAVIOUR_OS_VALUES) {
      expectedOffPolicy[os].behavior_protection.mode = ProtectionModes.off;
      expectedOffPolicy[os].behavior_protection.reputation_service = false;
      expectedOffPolicy[os].popup.behavior_protection.enabled = false;
    }
    render();

    await userEvent.click(renderResult.getByTestId(testSubj.enableDisableSwitch));
    const afterOff = getUpdatedPolicy();
    expect(afterOff).toEqual(expectedOffPolicy);

    const expectedOnPolicy = cloneDeep(afterOff);
    for (const os of BEHAVIOUR_OS_VALUES) {
      expectedOnPolicy[os].behavior_protection.mode = ProtectionModes.prevent;
      expectedOnPolicy[os].behavior_protection.reputation_service = true;
      expectedOnPolicy[os].popup.behavior_protection.enabled = true;
    }
    (props.onChange as jest.Mock).mockClear();
    rerender(afterOff);

    await userEvent.click(renderResult.getByTestId(testSubj.enableDisableSwitch));
    const afterOn = getUpdatedPolicy();
    expect(afterOn).toEqual(expectedOnPolicy);
  });

  it('renders the locked card below Platinum', () => {
    const licenseServiceMock = createLicenseServiceMock();
    licenseServiceMock.isPlatinumPlus.mockReturnValue(false);
    useLicenseMock.mockReturnValue(licenseServiceMock);
    render();

    expect(renderResult.getByTestId(testSubj.lockedCardTitle)).toHaveTextContent(
      'Malicious Behavior'
    );
    expect(renderResult.queryByTestId(testSubj.card)).not.toBeInTheDocument();
  });
});
