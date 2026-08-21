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
import type { NotifyUserOptionProps } from './notify_user_option';
import { NotifyUserOption } from './notify_user_option';
import { expectIsViewOnly, exactMatchText } from '../mocks';
import { cloneDeep } from 'lodash';
import { set } from '@kbn/safer-lodash-set';
import { ProtectionModes, PolicyOperatingSystem } from '../../../../../../../common/endpoint/types';
import userEvent from '@testing-library/user-event';
import {
  NOTIFY_USER_SECTION_TITLE,
  NOTIFY_USER_CHECKBOX_LABEL,
  CUSTOMIZE_NOTIFICATION_MESSAGE_LABEL,
} from './shared_translations';

jest.mock('../../../../../../common/hooks/use_license');

const useLicenseMock = _useLicense as jest.Mock;

describe('Policy form Notify User option component', () => {
  let formProps: NotifyUserOptionProps;
  let render: () => ReturnType<AppContextTestRender['render']>;
  let renderResult: ReturnType<typeof render>;

  const isChecked = (selector: string): boolean => {
    return (renderResult.getByTestId(selector) as HTMLInputElement).checked;
  };

  beforeEach(() => {
    const mockedContext = createAppRootMockRenderer();

    formProps = {
      policy: new FleetPackagePolicyGenerator('seed').generateEndpointPackagePolicy().inputs[0]
        .config.policy.value,
      onChange: jest.fn(),
      mode: 'edit',
      'data-test-subj': 'test',
      protection: 'malware',
      osList: [
        PolicyOperatingSystem.windows,
        PolicyOperatingSystem.mac,
        PolicyOperatingSystem.linux,
      ],
    };

    render = () => {
      renderResult = mockedContext.render(<NotifyUserOption {...formProps} />);
      return renderResult;
    };
  });

  it('should render with expected content', () => {
    set(formProps.policy, 'windows.popup.malware.message', 'hello world');
    const { getByTestId } = render();

    expect(getByTestId('test-title')).toHaveTextContent(exactMatchText(NOTIFY_USER_SECTION_TITLE));
    expect(getByTestId('test-supportedVersion')).toHaveTextContent(
      exactMatchText('Agent version 7.11+')
    );
    expect(isChecked('test-checkbox')).toBe(true);
    expect(renderResult.getByLabelText(NOTIFY_USER_CHECKBOX_LABEL));
    expect(getByTestId('test-customMessageTitle')).toHaveTextContent(
      exactMatchText(CUSTOMIZE_NOTIFICATION_MESSAGE_LABEL)
    );
    expect(getByTestId('test-customMessage')).toHaveValue('hello world');
  });

  it('should render with options un-checked', () => {
    set(formProps.policy, 'windows.popup.malware.enabled', false);
    render();

    expect(isChecked('test-checkbox')).toBe(false);
    expect(renderResult.queryByTestId('test-customMessage')).toBeNull();
  });

  it('should render checked disabled if protection mode is OFF', () => {
    set(formProps.policy, 'windows.popup.malware.enabled', false);
    set(formProps.policy, 'windows.malware.mode', ProtectionModes.off);
    render();

    expect(renderResult.getByTestId('test-checkbox')).toBeDisabled();
  });

  it('should be able to un-check the option', async () => {
    const expectedUpdatedPolicy = cloneDeep(formProps.policy);
    set(expectedUpdatedPolicy, 'windows.popup.malware.enabled', false);
    set(expectedUpdatedPolicy, 'mac.popup.malware.enabled', false);
    set(expectedUpdatedPolicy, 'linux.popup.malware.enabled', false);
    render();
    await userEvent.click(renderResult.getByTestId('test-checkbox'));

    expect(formProps.onChange).toHaveBeenCalledWith({
      isValid: true,
      updatedPolicy: expectedUpdatedPolicy,
    });
  });

  it('should be able to check the option', async () => {
    set(formProps.policy, 'windows.popup.malware.enabled', false);
    const expectedUpdatedPolicy = cloneDeep(formProps.policy);
    set(expectedUpdatedPolicy, 'windows.popup.malware.enabled', true);
    set(expectedUpdatedPolicy, 'mac.popup.malware.enabled', true);
    set(expectedUpdatedPolicy, 'linux.popup.malware.enabled', true);
    render();
    await userEvent.click(renderResult.getByTestId('test-checkbox'));

    expect(formProps.onChange).toHaveBeenCalledWith({
      isValid: true,
      updatedPolicy: expectedUpdatedPolicy,
    });
  });

  it('should be able to change the notification message', async () => {
    const msg = 'a';
    const expectedUpdatedPolicy = cloneDeep(formProps.policy);
    set(expectedUpdatedPolicy, 'windows.popup.malware.message', msg);
    set(expectedUpdatedPolicy, 'mac.popup.malware.message', msg);
    set(expectedUpdatedPolicy, 'linux.popup.malware.message', msg);
    render();
    await userEvent.type(renderResult.getByTestId('test-customMessage'), msg);

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

    it('should NOT render the component', () => {
      render();

      expect(renderResult.queryByTestId('test')).toBeNull();
    });
  });

  describe('and rendered in View mode', () => {
    beforeEach(() => {
      formProps.mode = 'view';
      set(formProps.policy, 'windows.popup.malware.message', 'you got owned');
    });

    it('should render with no form elements', () => {
      render();

      expectIsViewOnly(renderResult.getByTestId('test'));
    });

    it('should render with expected output when checked', () => {
      render();

      expect(renderResult.getByTestId('test')).toHaveTextContent(
        exactMatchText(
          'User notification' +
            'Agent version 7.11+' +
            'Notify user' +
            'Notification message' +
            'you got owned'
        )
      );
    });

    it('should render with expected output when checked with empty message', () => {
      set(formProps.policy, 'windows.popup.malware.message', '');
      render();

      expect(renderResult.getByTestId('test')).toHaveTextContent(
        exactMatchText('User notificationAgent version 7.11+Notify userNotification message—')
      );
    });

    it('should render with expected output when un-checked', () => {
      set(formProps.policy, 'windows.popup.malware.enabled', false);
      render();

      expect(renderResult.getByTestId('test')).toHaveTextContent(
        exactMatchText('User notificationAgent version 7.11+Notify user')
      );
    });
  });
});
