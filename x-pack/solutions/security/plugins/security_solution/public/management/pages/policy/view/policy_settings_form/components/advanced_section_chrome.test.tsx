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
import type { AdvancedSectionProps } from './advanced_section';

jest.mock('../../../../../../common/hooks/use_license');
jest.setTimeout(15_000);

const OMITTED_KEY = 'mac.ransomware.mode';

describe('Policy Advanced Settings section chrome', () => {
  const testSubj = getPolicySettingsFormTestSubjects('test').advancedSection;

  const renderSection = (props: Partial<AdvancedSectionProps> = {}) => {
    const mockedContext = createAppRootMockRenderer();
    const policy = new FleetPackagePolicyGenerator('seed').generateEndpointPackagePolicy().inputs[0]
      .config.policy.value;

    return mockedContext.render(
      <AdvancedSection
        policy={policy}
        onChange={jest.fn()}
        mode="edit"
        data-test-subj={testSubj.container}
        {...props}
      />
    );
  };

  const getToggle = (
    renderResult: ReturnType<ReturnType<typeof createAppRootMockRenderer>['render']>
  ) => renderResult.getByTestId(testSubj.showHideButton);

  it('renders the legacy inline button without the full-width styling hook when the prop is omitted', () => {
    const renderResult = renderSection();
    const toggle = getToggle(renderResult);

    expect(toggle.querySelector('[data-euiicon-type="arrowDown"]')).not.toBeInTheDocument();
    expect(toggle.querySelector('[data-euiicon-type="arrowUp"]')).not.toBeInTheDocument();
  });

  it('renders a full-width toggle with a chevron when fullWidthToggle is true', async () => {
    const renderResult = renderSection({ fullWidthToggle: true });
    const toggle = getToggle(renderResult);

    expect(toggle.querySelector('[data-euiicon-type="arrowDown"]')).toBeInTheDocument();

    await userEvent.click(toggle);

    expect(
      getToggle(renderResult).querySelector('[data-euiicon-type="arrowUp"]')
    ).toBeInTheDocument();
  });

  it.each([undefined, true])(
    'sets aria-expanded to false when collapsed and true after click (fullWidthToggle=%s)',
    async (fullWidthToggle) => {
      const renderResult = renderSection(fullWidthToggle ? { fullWidthToggle } : {});
      const toggle = getToggle(renderResult);

      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await userEvent.click(toggle);

      expect(getToggle(renderResult)).toHaveAttribute('aria-expanded', 'true');
    }
  );

  it.each([undefined, true])(
    'points aria-controls at a useId-derived region id (fullWidthToggle=%s)',
    async (fullWidthToggle) => {
      const renderResult = renderSection(fullWidthToggle ? { fullWidthToggle } : {});
      const toggle = getToggle(renderResult);
      const controlsId = toggle.getAttribute('aria-controls');

      expect(controlsId).toBeTruthy();
      expect(controlsId).not.toBe('advanced-settings');
      expect(controlsId).not.toBe('advancedSettings');

      await userEvent.click(toggle);

      const region = renderResult.container.querySelector(`#${CSS.escape(controlsId!)}`);
      expect(region).toBeInTheDocument();
      expect(region).toHaveAttribute('id', controlsId);
    }
  );

  it('still filters omitted keys when fullWidthToggle is enabled', async () => {
    const renderResult = renderSection({
      fullWidthToggle: true,
      omitKeys: [OMITTED_KEY],
    });

    await userEvent.click(getToggle(renderResult));

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
  });
});
