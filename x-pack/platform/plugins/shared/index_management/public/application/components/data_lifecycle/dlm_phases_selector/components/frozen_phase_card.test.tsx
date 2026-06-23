/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import '@testing-library/jest-dom';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { fireEvent, render } from '@testing-library/react';
import { FrozenPhaseCard } from './frozen_phase_card';

const defaultDuration = { enabled: true, value: '30', unit: 'd' };

const enterpriseConfig = {
  isCloudEnabled: true,
  canManageLicense: true,
  trialDaysLeft: undefined,
  onUpgrade: jest.fn(),
  subscriptionFeaturesUrl: 'https://www.elastic.co/subscriptions/cloud',
};

const renderFrozenPhaseCard = (props?: Partial<React.ComponentProps<typeof FrozenPhaseCard>>) => {
  const onChange = jest.fn();

  const result = render(
    <IntlProvider>
      <FrozenPhaseCard
        id="frozenPhase"
        color="#006bb4"
        duration={defaultDuration}
        isFormDisabled={false}
        hasEnterpriseLicense={true}
        hasDefaultSnapshotRepository={true}
        canCreateDefaultSnapshotRepository={true}
        createDefaultRepositoryUrl="/app/management/data/snapshot_restore/add_repository"
        enterprise={enterpriseConfig}
        onChange={onChange}
        {...props}
      />
    </IntlProvider>
  );

  return { ...result, onChange };
};

describe('FrozenPhaseCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hides configuration when the phase is disabled', () => {
    const { queryByTestId } = renderFrozenPhaseCard({
      duration: { ...defaultDuration, enabled: false },
    });

    expect(queryByTestId('frozenDurationValue')).not.toBeInTheDocument();
    expect(queryByTestId('frozenSearchableSnapshotLabel')).not.toBeInTheDocument();
  });

  it('hides configuration and shows a badge when a requirement is missing and the phase was not active', () => {
    const { queryByTestId } = renderFrozenPhaseCard({
      duration: { ...defaultDuration, enabled: false },
      hasEnterpriseLicense: false,
    });

    expect(queryByTestId('frozenDurationValue')).not.toBeInTheDocument();
    expect(queryByTestId('frozenSearchableSnapshotLabel')).not.toBeInTheDocument();
    expect(queryByTestId('enterpriseLicenseRequiredBadge')).toBeInTheDocument();
  });

  it('renders searchable snapshot info with repository name and manage link', () => {
    const { getByTestId, getByRole } = renderFrozenPhaseCard({
      defaultSnapshotRepository: 'my-repo',
      manageRepositoriesHref: '/app/management/data/snapshot_restore/repositories',
    });

    expect(getByTestId('frozenSearchableSnapshotLabel')).toBeInTheDocument();
    expect(getByTestId('frozenSearchableSnapshotInfo')).toHaveTextContent('my-repo');

    const manageLink = getByRole('link', { name: /manage your repositories/i });
    expect(manageLink).toHaveAttribute(
      'href',
      '/app/management/data/snapshot_restore/repositories'
    );
  });

  it('renders searchable snapshot label without repository info when name is omitted', () => {
    const { getByTestId, queryByRole } = renderFrozenPhaseCard();

    expect(getByTestId('frozenSearchableSnapshotLabel')).toBeInTheDocument();
    expect(queryByRole('link', { name: /manage your repositories/i })).not.toBeInTheDocument();
  });

  it('calls onChange when toggling the phase checkbox', () => {
    const { getByTestId, onChange } = renderFrozenPhaseCard({
      duration: { ...defaultDuration, enabled: false },
    });

    fireEvent.click(getByTestId('dlmPhasesSelectorFrozenPhaseCard'));

    expect(onChange).toHaveBeenCalledWith({
      enabled: true,
      value: '30',
      unit: 'd',
    });
  });

  it('opens the enterprise gating modal from the enterprise badge', () => {
    const { getByTestId, getByText } = renderFrozenPhaseCard({
      duration: { ...defaultDuration, enabled: false },
      hasEnterpriseLicense: false,
    });

    fireEvent.click(getByTestId('enterpriseLicenseRequiredBadge'));

    expect(
      getByText('Unlock the frozen data phase by upgrading to Enterprise')
    ).toBeInTheDocument();
  });

  it('opens the default repository modal from the default repository badge', () => {
    const { getByTestId, getByRole } = renderFrozenPhaseCard({
      duration: { ...defaultDuration, enabled: false },
      hasDefaultSnapshotRepository: false,
    });

    fireEvent.click(getByTestId('defaultRepositoryRequiredBadge'));

    // The modal (not the callout) exposes a "Refresh snapshot repositories" button.
    expect(getByRole('button', { name: 'Refresh snapshot repositories' })).toBeInTheDocument();
  });

  it('shows the default repository badge (not enterprise) when only the repository is missing', () => {
    const { getByTestId, queryByTestId } = renderFrozenPhaseCard({
      duration: { ...defaultDuration, enabled: false },
      hasDefaultSnapshotRepository: false,
    });

    expect(getByTestId('defaultRepositoryRequiredBadge')).toBeInTheDocument();
    expect(queryByTestId('enterpriseLicenseRequiredBadge')).not.toBeInTheDocument();
  });

  describe('grace state (phase active on mount with a missing requirement)', () => {
    it('renders the enterprise callout above the configuration and opens the upgrade modal', () => {
      const { getByTestId, getByText } = renderFrozenPhaseCard({
        hasEnterpriseLicense: false,
      });

      expect(getByTestId('frozenEnterpriseRequiredCallout')).toBeInTheDocument();
      expect(getByTestId('frozenDurationValue')).toBeInTheDocument();

      fireEvent.click(getByTestId('frozenUpgradeEnterpriseButton'));
      expect(
        getByText('Unlock the frozen data phase by upgrading to Enterprise')
      ).toBeInTheDocument();
    });

    it('renders the default repository callout and opens the create-repository modal', () => {
      const { getByTestId, queryByTestId, getByRole } = renderFrozenPhaseCard({
        hasDefaultSnapshotRepository: false,
        defaultSnapshotRepository: 'my-repo',
      });

      expect(getByTestId('frozenDefaultRepositoryRequiredCallout')).toBeInTheDocument();
      expect(queryByTestId('frozenSearchableSnapshotInfo')).not.toBeInTheDocument();

      fireEvent.click(getByTestId('frozenCreateDefaultRepositoryButton'));
      // The modal (not the callout) exposes a "Refresh snapshot repositories" button.
      expect(getByRole('button', { name: 'Refresh snapshot repositories' })).toBeInTheDocument();
    });

    it('disables the create repository action when the user cannot create one', () => {
      const { getByTestId } = renderFrozenPhaseCard({
        hasDefaultSnapshotRepository: false,
        canCreateDefaultSnapshotRepository: false,
      });

      expect(getByTestId('frozenCreateDefaultRepositoryButton')).toBeDisabled();
    });

    it('renders both callouts when both requirements are missing', () => {
      const { getByTestId } = renderFrozenPhaseCard({
        hasEnterpriseLicense: false,
        hasDefaultSnapshotRepository: false,
      });

      expect(getByTestId('frozenEnterpriseRequiredCallout')).toBeInTheDocument();
      expect(getByTestId('frozenDefaultRepositoryRequiredCallout')).toBeInTheDocument();
    });

    it('disables the duration inputs while a warning callout is active', () => {
      const { getByTestId } = renderFrozenPhaseCard({
        hasEnterpriseLicense: false,
      });

      expect(getByTestId('frozenDurationValue')).toBeDisabled();
      expect(getByTestId('frozenDurationUnit')).toBeDisabled();
    });

    it('collapses to the disabled badge state after the user unchecks the phase', () => {
      const { getByTestId, queryByTestId, rerender, onChange } = renderFrozenPhaseCard({
        hasEnterpriseLicense: false,
      });

      // Initially in the grace state.
      expect(getByTestId('frozenEnterpriseRequiredCallout')).toBeInTheDocument();

      fireEvent.click(getByTestId('dlmPhasesSelectorFrozenPhaseCard'));
      expect(onChange).toHaveBeenCalledWith({ enabled: false, value: '30', unit: 'd' });

      // Simulate the parent updating the duration to disabled.
      rerender(
        <IntlProvider>
          <FrozenPhaseCard
            id="frozenPhase"
            color="#006bb4"
            duration={{ ...defaultDuration, enabled: false }}
            isFormDisabled={false}
            hasEnterpriseLicense={false}
            hasDefaultSnapshotRepository={true}
            canCreateDefaultSnapshotRepository={true}
            createDefaultRepositoryUrl="/app/management/data/snapshot_restore/add_repository"
            enterprise={enterpriseConfig}
            onChange={onChange}
          />
        </IntlProvider>
      );

      expect(queryByTestId('frozenEnterpriseRequiredCallout')).not.toBeInTheDocument();
      expect(getByTestId('enterpriseLicenseRequiredBadge')).toBeInTheDocument();
    });
  });
});
