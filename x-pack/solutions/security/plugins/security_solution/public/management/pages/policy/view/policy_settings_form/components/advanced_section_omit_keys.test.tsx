/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import userEvent from '@testing-library/user-event';
import { FleetPackagePolicyGenerator } from '../../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { AdvancedPolicySchema } from '../../../models/advanced_policy_schema';
import { getPolicySettingsFormTestSubjects } from '../mocks';
import { AdvancedSection } from './advanced_section';

jest.mock('../../../../../../common/hooks/use_license');
jest.setTimeout(15_000);

const OMITTED_KEY = 'mac.ransomware.mode';

describe('Policy Advanced Settings section omitted keys', () => {
  it('omits only the requested schema row', async () => {
    const testSubj = getPolicySettingsFormTestSubjects('test').advancedSection;
    const mockedContext = createAppRootMockRenderer();
    const policy = new FleetPackagePolicyGenerator('seed').generateEndpointPackagePolicy().inputs[0]
      .config.policy.value;
    const renderResult = mockedContext.render(
      <AdvancedSection
        policy={policy}
        onChange={jest.fn()}
        mode="edit"
        omitKeys={[OMITTED_KEY]}
        data-test-subj={testSubj.container}
      />
    );

    await userEvent.click(renderResult.getByTestId(testSubj.showHideButton));

    expect(
      renderResult.queryByTestId(testSubj.settingRowTestSubjects(OMITTED_KEY).container)
    ).not.toBeInTheDocument();

    for (const { key } of AdvancedPolicySchema) {
      if (key !== OMITTED_KEY) {
        expect(
          renderResult.getByTestId(testSubj.settingRowTestSubjects(key).container)
        ).toBeInTheDocument();
      }
    }

    expect(
      renderResult.getByTestId(
        testSubj.settingRowTestSubjects('mac.advanced.ransomware.diagnostic').container
      )
    ).toBeInTheDocument();
  });
});
