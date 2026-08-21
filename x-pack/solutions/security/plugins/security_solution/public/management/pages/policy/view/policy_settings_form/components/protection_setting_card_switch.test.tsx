/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useLicense as _useLicense } from '../../../../../../common/hooks/use_license';
import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { FleetPackagePolicyGenerator } from '../../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import React from 'react';
import { createLicenseServiceMock } from '../../../../../../../common/license/mocks';
import { licenseService as licenseServiceMocked } from '../../../../../../common/hooks/__mocks__/use_license';
import type { ProtectionSettingCardSwitchProps } from './protection_setting_card_switch';
import { ProtectionSettingCardSwitch } from './protection_setting_card_switch';
import { exactMatchText, expectIsViewOnly, setMalwareMode } from '../mocks';
import { ProtectionModes, PolicyOperatingSystem } from '../../../../../../../common/endpoint/types';
import { cloneDeep } from 'lodash';
import { set } from '@kbn/safer-lodash-set';
import userEvent from '@testing-library/user-event';

jest.mock('../../../../../../common/hooks/use_license');

const useLicenseMock = _useLicense as jest.Mock;

describe('Policy form ProtectionSettingCardSwitch component', () => {
  let formProps: ProtectionSettingCardSwitchProps;
  let render: () => ReturnType<AppContextTestRender['render']>;
  let renderResult: ReturnType<typeof render>;

  beforeEach(() => {
    const mockedContext = createAppRootMockRenderer();

    formProps = {
      policy: new FleetPackagePolicyGenerator('seed').generateEndpointPackagePolicy().inputs[0]
        .config.policy.value,
      onChange: jest.fn(),
      mode: 'edit',
      'data-test-subj': 'test',
      protection: 'malware',
      selected: true,
      protectionLabel: 'Malware',
      osList: [
        PolicyOperatingSystem.windows,
        PolicyOperatingSystem.mac,
        PolicyOperatingSystem.linux,
      ],
    };

    render = () => {
      const selected = formProps.policy.windows[formProps.protection].mode !== ProtectionModes.off;
      renderResult = mockedContext.render(
        <ProtectionSettingCardSwitch {...formProps} selected={selected} />
      );
      return renderResult;
    };
  });

  it('should render expected output when enabled', () => {
    const { getByTestId } = render();

    expect(getByTestId('test')).toHaveAttribute('aria-checked', 'true');
    expect(getByTestId('test-label')).toHaveTextContent(exactMatchText('Malware'));
  });

  it('should render expected output when disabled', () => {
    set(formProps.policy, 'windows.malware.mode', ProtectionModes.off);
    const { getByTestId } = render();

    expect(getByTestId('test')).toHaveAttribute('aria-checked', 'false');
    expect(getByTestId('test-label')).toHaveTextContent(exactMatchText('Malware'));
  });

  it('should be able to disable it', async () => {
    const expectedUpdatedPolicy = cloneDeep(formProps.policy);
    setMalwareMode({
      policy: expectedUpdatedPolicy,
      turnOff: true,
      includeSubfeatures: false,
    });
    render();
    await userEvent.click(renderResult.getByTestId('test'));

    expect(formProps.onChange).toHaveBeenCalledWith({
      isValid: true,
      updatedPolicy: expectedUpdatedPolicy,
    });
  });

  it('should be able to enable it', async () => {
    setMalwareMode({
      policy: formProps.policy,
      turnOff: true,
      includeSubfeatures: false,
    });
    const expectedUpdatedPolicy = cloneDeep(formProps.policy);
    setMalwareMode({
      policy: expectedUpdatedPolicy,
      turnOff: false,
      includeSubfeatures: false,
    });
    render();
    await userEvent.click(renderResult.getByTestId('test'));

    expect(formProps.onChange).toHaveBeenCalledWith({
      isValid: true,
      updatedPolicy: expectedUpdatedPolicy,
    });
  });

  it('should invoke `additionalOnSwitchChange` callback if one was defined', async () => {
    formProps.additionalOnSwitchChange = jest.fn(({ policyConfigData }) => {
      const updated = cloneDeep(policyConfigData);
      updated.windows.popup.malware.message = 'foo';
      return updated;
    });

    const expectedPolicyDataBeforeAdditionalCallback = cloneDeep(formProps.policy);
    setMalwareMode({
      policy: expectedPolicyDataBeforeAdditionalCallback,
      turnOff: true,
      includeSubfeatures: false,
    });

    const expectedUpdatedPolicy = cloneDeep(expectedPolicyDataBeforeAdditionalCallback);
    expectedUpdatedPolicy.windows.popup.malware.message = 'foo';

    render();
    await userEvent.click(renderResult.getByTestId('test'));

    expect(formProps.additionalOnSwitchChange).toHaveBeenCalledWith({
      value: false,
      policyConfigData: expectedPolicyDataBeforeAdditionalCallback,
      protectionOsList: formProps.osList,
    });

    expect(formProps.onChange).toHaveBeenCalledWith({
      isValid: true,
      updatedPolicy: expectedUpdatedPolicy,
    });
  });

  describe('and license is lower than platinum', () => {
    beforeEach(() => {
      const licenseServiceMock = createLicenseServiceMock();
      licenseServiceMock.isPlatinumPlus.mockReturnValue(false);

      useLicenseMock.mockReturnValue(licenseServiceMock);
    });

    afterEach(() => {
      useLicenseMock.mockReturnValue(licenseServiceMocked);
    });

    it('should NOT update notification settings when disabling', async () => {
      const expectedUpdatedPolicy = cloneDeep(formProps.policy);
      setMalwareMode({
        policy: expectedUpdatedPolicy,
        turnOff: true,
        includePopup: false,
        includeSubfeatures: false,
      });
      render();
      await userEvent.click(renderResult.getByTestId('test'));

      expect(formProps.onChange).toHaveBeenCalledWith({
        isValid: true,
        updatedPolicy: expectedUpdatedPolicy,
      });
    });

    it('should NOT update notification settings when enabling', async () => {
      const expectedUpdatedPolicy = cloneDeep(formProps.policy);
      setMalwareMode({
        policy: formProps.policy,
        turnOff: true,
        includePopup: false,
        includeSubfeatures: false,
      });
      render();
      await userEvent.click(renderResult.getByTestId('test'));

      expect(formProps.onChange).toHaveBeenCalledWith({
        isValid: true,
        updatedPolicy: expectedUpdatedPolicy,
      });
    });
  });

  describe('and rendered in View mode', () => {
    beforeEach(() => {
      formProps.mode = 'view';
    });

    it('should not include any enabled form elements', () => {
      render();

      expectIsViewOnly(renderResult.getByTestId('test'));
    });

    it('should show option when checked', () => {
      render();

      expect(renderResult.getByTestId('test-label')).toHaveTextContent(exactMatchText('Malware'));
      expect(renderResult.getByTestId('test').getAttribute('aria-checked')).toBe('true');
    });

    it('should show option when unchecked', () => {
      setMalwareMode({
        policy: formProps.policy,
        turnOff: true,
        includeSubfeatures: false,
      });
      render();

      expect(renderResult.getByTestId('test-label')).toHaveTextContent(exactMatchText('Malware'));
      expect(renderResult.getByTestId('test').getAttribute('aria-checked')).toBe('false');
    });
  });
});
