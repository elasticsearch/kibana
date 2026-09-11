/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { getPolicySettingsFormTestSubjects } from './mocks';
import type { AppContextTestRender } from '../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../common/mock/endpoint';
import type { PolicySettingsFormProps } from './policy_settings_form';
import { PolicySettingsForm } from './policy_settings_form';
import { FleetPackagePolicyGenerator } from '../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import { useLicense as _useLicense } from '../../../../../common/hooks/use_license';
import { licenseService as licenseServiceMocked } from '../../../../../common/hooks/__mocks__/use_license';
import { useGetDeviceControlUpsellComponent as _useGetDeviceControlUpsellComponent } from './hooks/use_get_device_control_component';

jest.mock('../../../../../common/hooks/use_license');
jest.mock('./hooks/use_get_device_control_component');

const useLicenseMock = _useLicense as jest.Mock;
const useGetDeviceControlUpsellComponentMock = _useGetDeviceControlUpsellComponent as jest.Mock;

describe('PolicySettingsForm per-OS feature-flag fork', () => {
  const formTestSubj = getPolicySettingsFormTestSubjects('test');

  let formProps: PolicySettingsFormProps;
  let render: () => ReturnType<AppContextTestRender['render']>;
  let renderResult: ReturnType<typeof render>;
  let mockedContext: AppContextTestRender;

  beforeEach(() => {
    mockedContext = createAppRootMockRenderer();
    mockedContext.setExperimentalFlag({ linuxDnsEvents: true });

    formProps = {
      policy: new FleetPackagePolicyGenerator('seed').generateEndpointPackagePolicy().inputs[0]
        .config.policy.value,
      onChange: jest.fn(),
      mode: 'edit',
      'data-test-subj': 'test',
    };

    mockedContext.startServices.storage.set('securitySolution.showEventMergingBanner', false);
    useLicenseMock.mockReturnValue(licenseServiceMocked);
    useGetDeviceControlUpsellComponentMock.mockReturnValue(null);

    render = () => (renderResult = mockedContext.render(<PolicySettingsForm {...formProps} />));
  });

  it('renders the per-OS form and not the legacy form when perOsPolicySettings is enabled', () => {
    mockedContext.setExperimentalFlag({ linuxDnsEvents: true, perOsPolicySettings: true });
    render();

    expect(renderResult.getByTestId(formTestSubj.perOsMalware.card)).toBeInTheDocument();
    expect(
      renderResult.queryByTestId(formTestSubj.malware.enableDisableSwitch)
    ).not.toBeInTheDocument();
  });

  it('renders the legacy form and not the per-OS form when perOsPolicySettings is disabled', () => {
    mockedContext.setExperimentalFlag({ linuxDnsEvents: true, perOsPolicySettings: false });
    render();

    expect(renderResult.getByTestId(formTestSubj.malware.enableDisableSwitch)).toBeInTheDocument();
    expect(renderResult.queryByTestId(formTestSubj.perOsMalware.card)).not.toBeInTheDocument();
  });
});
