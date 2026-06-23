/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import '@testing-library/jest-dom';
import { EuiThemeProvider } from '@elastic/eui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SerializedPolicy } from '@kbn/index-lifecycle-management-common-shared';
import type { IlmPolicyForFlyout } from '../edit_data_lifecycle_flyout/types';
import {
  FlyoutFooterWithRetentionWarning,
  useRetentionWarning,
} from './flyout_footer_with_retention_warning';

const POLICY_WITH_DOWNSAMPLE: SerializedPolicy = {
  name: '.alerts-ilm-policy',
  phases: {
    hot: { min_age: '0ms', actions: {} },
    warm: { min_age: '7d', actions: { downsample: { fixed_interval: '1h' } } },
    delete: { min_age: '60d', actions: { delete: {} } },
  },
};

const ilmPolicies: IlmPolicyForFlyout[] = [
  { name: POLICY_WITH_DOWNSAMPLE.name, phases: POLICY_WITH_DOWNSAMPLE.phases },
];

const WarningFooter = (props: {
  selectedIlmPolicyName?: string;
  canUseDownsampling?: boolean;
  inheritLifecycle?: boolean;
}) => {
  const showWarning = useRetentionWarning({ ilmPolicies, ...props });
  return (
    <FlyoutFooterWithRetentionWarning
      onCancel={() => {}}
      onApply={() => {}}
      showWarning={showWarning}
    />
  );
};

describe('FlyoutFooterWithRetentionWarning', () => {
  const renderWithTheme = (node: React.ReactElement) =>
    render(node, {
      wrapper: EuiThemeProvider,
    });

  it('shows the downsampling warning when selected policy has downsampling and stream cannot use downsampling', () => {
    renderWithTheme(
      <WarningFooter
        selectedIlmPolicyName={POLICY_WITH_DOWNSAMPLE.name}
        canUseDownsampling={false}
      />
    );

    expect(screen.getByTestId('flyoutFooter-downsamplingNotAppliedCallout')).toBeInTheDocument();
  });

  it('does not show the warning when inheriting lifecycle', () => {
    renderWithTheme(
      <WarningFooter
        selectedIlmPolicyName={POLICY_WITH_DOWNSAMPLE.name}
        canUseDownsampling={false}
        inheritLifecycle
      />
    );

    expect(
      screen.queryByTestId('flyoutFooter-downsamplingNotAppliedCallout')
    ).not.toBeInTheDocument();
  });

  it('shows custom cancel/apply labels and disables apply when requested', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    const onApply = jest.fn();

    renderWithTheme(
      <FlyoutFooterWithRetentionWarning
        cancelLabel="Back"
        applyLabel="Save changes"
        onCancel={onCancel}
        onApply={onApply}
        isApplyDisabled
      />
    );

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    const applyButton = screen.getByRole('button', { name: 'Save changes' });
    expect(applyButton).toBeDisabled();
  });

  it('renders the action button test subjects', () => {
    renderWithTheme(<FlyoutFooterWithRetentionWarning onCancel={() => {}} onApply={() => {}} />);

    expect(screen.getByTestId('dataLifecycleFlyoutCancelButton')).toBeInTheDocument();
    expect(screen.getByTestId('dataLifecycleFlyoutApplyButton')).toBeInTheDocument();
  });

  it('shows the downsampling warning when canUseDownsampling becomes false between renders', () => {
    const { rerender } = renderWithTheme(
      <WarningFooter selectedIlmPolicyName={POLICY_WITH_DOWNSAMPLE.name} canUseDownsampling />
    );

    expect(
      screen.queryByTestId('flyoutFooter-downsamplingNotAppliedCallout')
    ).not.toBeInTheDocument();

    rerender(
      <EuiThemeProvider>
        <WarningFooter
          selectedIlmPolicyName={POLICY_WITH_DOWNSAMPLE.name}
          canUseDownsampling={false}
        />
      </EuiThemeProvider>
    );

    expect(screen.getByTestId('flyoutFooter-downsamplingNotAppliedCallout')).toBeInTheDocument();
  });
});
