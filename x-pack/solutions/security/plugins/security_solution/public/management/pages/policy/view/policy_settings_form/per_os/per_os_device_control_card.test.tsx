/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import userEvent from '@testing-library/user-event';
import { cloneDeep } from 'lodash';
import { useLicense as _useLicense } from '../../../../../../common/hooks/use_license';
import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { FleetPackagePolicyGenerator } from '../../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import { createLicenseServiceMock } from '../../../../../../../common/license/mocks';
import { licenseService as licenseServiceMocked } from '../../../../../../common/hooks/__mocks__/use_license';
import type { PolicyConfig } from '../../../../../../../common/endpoint/types';
import {
  DeviceControlAccessLevel,
  PolicyOperatingSystem,
} from '../../../../../../../common/endpoint/types';
import { getPolicySettingsFormTestSubjects } from '../mocks';
import { useGetDeviceControlUpsellComponent as _useGetDeviceControlUpsellComponent } from '../hooks/use_get_device_control_component';
import type { PerOsDeviceControlCardProps } from './per_os_device_control_card';
import {
  PER_OS_DEVICE_CONTROL_CARD_TITLE,
  PerOsDeviceControlCard,
} from './per_os_device_control_card';

jest.mock('../../../../../../common/hooks/use_license');
jest.mock('../hooks/use_get_device_control_component');

const useLicenseMock = _useLicense as jest.Mock;
const useGetDeviceControlUpsellComponentMock = _useGetDeviceControlUpsellComponent as jest.Mock;

describe('PerOsDeviceControlCard', () => {
  const testSubj = getPolicySettingsFormTestSubjects('test').perOsDeviceControl;
  let policy: PolicyConfig;
  let props: PerOsDeviceControlCardProps;
  let mockedContext: ReturnType<typeof createAppRootMockRenderer>;
  let renderResult: ReturnType<AppContextTestRender['render']>;

  const render = () => {
    renderResult = mockedContext.render(<PerOsDeviceControlCard {...props} policy={policy} />);
    return renderResult;
  };

  const getUpdatedPolicy = (): PolicyConfig => {
    const onChange = props.onChange as jest.Mock;
    return onChange.mock.calls[onChange.mock.calls.length - 1][0].updatedPolicy;
  };

  beforeEach(() => {
    mockedContext = createAppRootMockRenderer();
    policy = new FleetPackagePolicyGenerator('seed').generateEndpointPackagePolicy().inputs[0]
      .config.policy.value;
    policy[PolicyOperatingSystem.windows].device_control = {
      enabled: true,
      usb_storage: DeviceControlAccessLevel.audit,
    };
    policy[PolicyOperatingSystem.mac].device_control = {
      enabled: true,
      usb_storage: DeviceControlAccessLevel.audit,
    };
    policy[PolicyOperatingSystem.windows].popup.device_control = {
      enabled: true,
      message: 'Windows message',
    };
    policy[PolicyOperatingSystem.mac].popup.device_control = {
      enabled: true,
      message: 'Mac message',
    };
    props = {
      policy,
      onChange: jest.fn(),
      mode: 'edit',
      'data-test-subj': testSubj.card,
    };
    useLicenseMock.mockReturnValue(licenseServiceMocked);
    useGetDeviceControlUpsellComponentMock.mockReturnValue(null);
  });

  it('renders exactly Windows and macOS rows and no Linux row', () => {
    render();

    expect(renderResult.getByTestId(testSubj.windows.row)).toHaveTextContent('Windows');
    expect(renderResult.getByTestId(testSubj.mac.row)).toHaveTextContent('Mac');
    expect(renderResult.queryByTestId('test-perOsDeviceControl-linux')).not.toBeInTheDocument();
    expect(renderResult.getByTestId(testSubj.card)).not.toHaveTextContent('Linux');
  });

  it('hides only the macOS notification when Windows is audit and macOS is deny_all', () => {
    policy[PolicyOperatingSystem.windows].device_control!.usb_storage =
      DeviceControlAccessLevel.audit;
    policy[PolicyOperatingSystem.mac].device_control!.usb_storage =
      DeviceControlAccessLevel.deny_all;
    render();

    expect(renderResult.getByTestId(testSubj.windows.notifyUser)).toBeInTheDocument();
    expect(renderResult.queryByTestId(testSubj.mac.notifyUser)).not.toBeInTheDocument();
  });

  it('hides only the Windows notification when Windows is deny_all and macOS is audit', () => {
    policy[PolicyOperatingSystem.windows].device_control!.usb_storage =
      DeviceControlAccessLevel.deny_all;
    policy[PolicyOperatingSystem.mac].device_control!.usb_storage = DeviceControlAccessLevel.audit;
    render();

    expect(renderResult.queryByTestId(testSubj.windows.notifyUser)).not.toBeInTheDocument();
    expect(renderResult.getByTestId(testSubj.mac.notifyUser)).toBeInTheDocument();
  });

  it("shows each row's own USB storage access level", () => {
    policy[PolicyOperatingSystem.windows].device_control!.usb_storage =
      DeviceControlAccessLevel.no_execute;
    policy[PolicyOperatingSystem.mac].device_control!.usb_storage =
      DeviceControlAccessLevel.read_only;
    render();

    expect(renderResult.getByTestId(testSubj.windows.accessLevelSelect)).toHaveTextContent(
      'Read and write'
    );
    expect(renderResult.getByTestId(testSubj.mac.accessLevelSelect)).toHaveTextContent('Read only');
  });

  it('changing the macOS access level leaves Windows and Linux byte-identical', async () => {
    policy[PolicyOperatingSystem.mac].device_control!.usb_storage =
      DeviceControlAccessLevel.read_only;
    const windowsBefore = cloneDeep(policy[PolicyOperatingSystem.windows]);
    const linuxBefore = cloneDeep(policy[PolicyOperatingSystem.linux]);
    render();

    await userEvent.click(renderResult.getByTestId(testSubj.mac.accessLevelSelect));
    await userEvent.click(renderResult.getByRole('option', { name: 'Read and write' }));

    const updatedPolicy = getUpdatedPolicy();
    expect(updatedPolicy.mac.device_control?.usb_storage).toBe(DeviceControlAccessLevel.no_execute);
    expect(updatedPolicy.windows).toEqual(windowsBefore);
    expect(updatedPolicy.linux).toEqual(linuxBefore);
  });

  it('renders without throwing when one OS has no device_control field', () => {
    delete policy[PolicyOperatingSystem.mac].device_control;

    expect(() => render()).not.toThrow();
    expect(renderResult.getByTestId(testSubj.mac.accessLevelSelect)).toHaveTextContent(
      'Allow read, write and execute'
    );
    expect(renderResult.getByTestId(testSubj.mac.accessLevelSelect)).toBeDisabled();
  });

  // §5.3: the master toggle is derived as `some(OS enabled)`, which is also the legacy
  // `windows?.enabled || mac?.enabled` behaviour. One enabled OS means the card reads on.
  it('reports the card enabled when only one OS is enabled', () => {
    policy[PolicyOperatingSystem.windows].device_control!.enabled = true;
    policy[PolicyOperatingSystem.mac].device_control!.enabled = false;
    render();

    expect(renderResult.getByTestId(testSubj.enableDisableSwitch)).toBeChecked();
  });

  it('reports the card enabled when only the non-Windows OS is enabled', () => {
    policy[PolicyOperatingSystem.windows].device_control!.enabled = false;
    policy[PolicyOperatingSystem.mac].device_control!.enabled = true;
    render();

    expect(renderResult.getByTestId(testSubj.enableDisableSwitch)).toBeChecked();
  });

  it('reports the card disabled only when no supported OS is enabled', () => {
    policy[PolicyOperatingSystem.windows].device_control!.enabled = false;
    policy[PolicyOperatingSystem.mac].device_control!.enabled = false;
    render();

    expect(renderResult.getByTestId(testSubj.enableDisableSwitch)).not.toBeChecked();
  });

  it('the card-local master toggle updates both supported OSes and not Linux', async () => {
    const linuxBefore = cloneDeep(policy[PolicyOperatingSystem.linux]);
    render();

    await userEvent.click(renderResult.getByTestId(testSubj.enableDisableSwitch));

    const updatedPolicy = getUpdatedPolicy();
    expect(updatedPolicy.windows.device_control).toEqual({
      enabled: false,
      usb_storage: DeviceControlAccessLevel.audit,
    });
    expect(updatedPolicy.mac.device_control).toEqual({
      enabled: false,
      usb_storage: DeviceControlAccessLevel.audit,
    });
    expect(updatedPolicy.linux).toEqual(linuxBefore);
  });

  it('renders the Enterprise locked card below the required license', () => {
    const licenseServiceMock = createLicenseServiceMock();
    licenseServiceMock.isEnterprise.mockReturnValue(false);
    useLicenseMock.mockReturnValue(licenseServiceMock);
    render();

    expect(renderResult.getByTestId(testSubj.lockedCardTitle)).toHaveTextContent(
      PER_OS_DEVICE_CONTROL_CARD_TITLE
    );
  });

  it('renders the serverless device-control upsell when available', () => {
    useGetDeviceControlUpsellComponentMock.mockReturnValue(() => (
      <div data-test-subj="deviceControlUpsell" />
    ));
    render();

    expect(renderResult.getByTestId('deviceControlUpsell')).toBeInTheDocument();
    expect(renderResult.queryByTestId(testSubj.card)).not.toBeInTheDocument();
  });
});
