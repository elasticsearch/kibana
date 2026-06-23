/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import type { DlmPhasesSelectorProps } from './dlm_phases_selector';
import { DlmPhasesSelector } from './dlm_phases_selector';

const BASE_PROPS: Omit<DlmPhasesSelectorProps, 'onChange'> = {
  hasEnterpriseLicense: true,
  hasDefaultSnapshotRepository: true,
  defaultSnapshotRepository: 'found-snapshots',
  manageRepositoriesUrl: '/app/management/data/snapshot_restore/repositories',
  createDefaultRepositoryUrl: '/app/management/data/snapshot_restore/add_repository',
  canCreateDefaultSnapshotRepository: true,
  enterprise: {
    isCloudEnabled: true,
    canManageLicense: true,
    trialDaysLeft: undefined,
    onUpgrade: jest.fn(),
    subscriptionFeaturesUrl: 'https://www.elastic.co/subscriptions/cloud',
  },
};

const renderSelector = (props?: Partial<DlmPhasesSelectorProps>) => {
  const onChange = jest.fn();
  const result = render(
    <IntlProvider>
      <DlmPhasesSelector {...BASE_PROPS} onChange={onChange} {...props} />
    </IntlProvider>
  );

  return { ...result, onChange };
};

describe('DlmPhasesSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the required hot phase and collapsed optional phases', () => {
    const { getByText, queryByLabelText } = renderSelector();

    expect(getByText('Hot phase')).toBeInTheDocument();
    expect(getByText('Required')).toBeInTheDocument();
    expect(getByText('Frozen phase')).toBeInTheDocument();
    expect(getByText('Delete phase')).toBeInTheDocument();
    expect(queryByLabelText('Move after')).not.toBeInTheDocument();
    expect(queryByLabelText('Delete after')).not.toBeInTheDocument();
  });

  it('omits searchable snapshot repository info when defaultSnapshotRepository is not provided', () => {
    const { getByText, queryByRole } = renderSelector({
      defaultSnapshotRepository: undefined,
      defaultValue: {
        frozen: { enabled: true, value: '30', unit: 'd' },
      },
    });

    expect(getByText('Searchable snapshot')).toBeInTheDocument();
    expect(queryByRole('link', { name: /manage your repositories/i })).not.toBeInTheDocument();
  });

  it('enables frozen phase and serializes frozen_after', () => {
    const { getByLabelText, getByRole, getByText, onChange } = renderSelector();

    fireEvent.click(getByLabelText('Enable frozen phase'));

    const manageLink = getByRole('link', { name: /manage your repositories/i });
    expect(manageLink).toHaveAttribute(
      'href',
      '/app/management/data/snapshot_restore/repositories'
    );
    expect(getByText(/found-snapshots/)).toBeInTheDocument();

    expect(onChange).toHaveBeenLastCalledWith(
      {
        frozen: { enabled: true, value: '30', unit: 'd' },
        delete: { enabled: false, value: '60', unit: 'd' },
      },
      { frozen_after: '30d', data_retention: undefined },
      true
    );
  });

  it('validates delete phase occurs after frozen phase', () => {
    const { getByText, getByTestId, onChange } = renderSelector({
      defaultValue: {
        frozen: { enabled: true, value: '30', unit: 'd' },
        delete: { enabled: true, value: '60', unit: 'd' },
      },
    });

    fireEvent.change(getByTestId('deleteDurationValue'), { target: { value: '20' } });

    expect(getByText('Must occur after the frozen phase (30d).')).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(
      {
        frozen: { enabled: true, value: '30', unit: 'd' },
        delete: { enabled: true, value: '20', unit: 'd' },
      },
      { frozen_after: '30d', data_retention: '20d' },
      false
    );
  });

  it('disables frozen phase when Enterprise license is unavailable', () => {
    const { getByLabelText, getByRole, getByText, queryByText, queryByTestId } = renderSelector({
      hasEnterpriseLicense: false,
    });

    expect(getByText('Enterprise required')).toBeInTheDocument();
    expect(getByLabelText('Enable frozen phase')).toBeDisabled();
    fireEvent.click(getByRole('button', { name: 'Open enterprise license requirement modal' }));
    expect(
      getByText('Unlock the frozen data phase by upgrading to Enterprise')
    ).toBeInTheDocument();
    expect(queryByText('Move after')).not.toBeInTheDocument();
    expect(queryByTestId('frozenDurationValue')).not.toBeInTheDocument();
    expect(queryByTestId('frozenDurationUnit')).not.toBeInTheDocument();
    expect(queryByText('Searchable snapshot')).not.toBeInTheDocument();
  });

  it('disables frozen phase when a default snapshot repository is unavailable', async () => {
    const onRefreshDefaultSnapshotRepository = jest.fn();
    const { getByLabelText, getByRole, getByText, queryByText, queryByTestId } = renderSelector({
      hasDefaultSnapshotRepository: false,
      onRefreshDefaultSnapshotRepository,
    });

    expect(getByText('Default repository required')).toBeInTheDocument();
    expect(getByLabelText('Enable frozen phase')).toBeDisabled();
    fireEvent.click(getByRole('button', { name: 'Open default repository requirement modal' }));
    expect(getByText('Default snapshot repository required')).toBeInTheDocument();
    expect(getByRole('link', { name: 'Create default repository' })).toHaveAttribute(
      'href',
      '/app/management/data/snapshot_restore/add_repository'
    );
    fireEvent.click(getByRole('button', { name: 'Refresh snapshot repositories' }));
    await waitFor(() => expect(onRefreshDefaultSnapshotRepository).toHaveBeenCalledTimes(1));
    expect(queryByText('Move after')).not.toBeInTheDocument();
    expect(queryByTestId('frozenDurationValue')).not.toBeInTheDocument();
    expect(queryByTestId('frozenDurationUnit')).not.toBeInTheDocument();
    expect(queryByText('Searchable snapshot')).not.toBeInTheDocument();
  });

  it('closes the default snapshot repository modal when repository validation passes', async () => {
    const onRefreshDefaultSnapshotRepository = jest.fn();
    const { getByRole, queryByText, rerender } = renderSelector({
      hasDefaultSnapshotRepository: false,
      onRefreshDefaultSnapshotRepository,
    });

    fireEvent.click(getByRole('button', { name: 'Open default repository requirement modal' }));
    expect(queryByText('Default snapshot repository required')).toBeInTheDocument();

    rerender(
      <IntlProvider>
        <DlmPhasesSelector
          {...BASE_PROPS}
          hasDefaultSnapshotRepository
          onRefreshDefaultSnapshotRepository={onRefreshDefaultSnapshotRepository}
        />
      </IntlProvider>
    );

    await waitFor(() =>
      expect(queryByText('Default snapshot repository required')).not.toBeInTheDocument()
    );
  });

  it('omits frozen phase when a default snapshot repository is unavailable and cannot be created', () => {
    const { queryByLabelText, queryByText, queryByTestId } = renderSelector({
      hasDefaultSnapshotRepository: false,
      canCreateDefaultSnapshotRepository: false,
    });

    expect(queryByText('Frozen phase')).not.toBeInTheDocument();
    expect(queryByLabelText('Enable frozen phase')).not.toBeInTheDocument();
    expect(queryByTestId('dlmPhasesSelectorFrozenPhaseCard')).not.toBeInTheDocument();
  });

  describe('existing template with frozen phase already active (grace state)', () => {
    const GRACE_DEFAULT_VALUE = {
      frozen: { enabled: true, value: '30', unit: 'd' },
      delete: { enabled: true, value: '60', unit: 'd' },
    };

    it('keeps frozen enabled with the enterprise warning callout when the license is missing', () => {
      const { getByLabelText, getByTestId, getByText, queryByText } = renderSelector({
        hasEnterpriseLicense: false,
        defaultValue: GRACE_DEFAULT_VALUE,
      });

      expect(getByLabelText('Enable frozen phase')).not.toBeDisabled();
      expect(getByLabelText('Enable frozen phase')).toBeChecked();
      expect(getByTestId('frozenEnterpriseRequiredCallout')).toBeInTheDocument();
      expect(getByText('Move after')).toBeInTheDocument();
      expect(queryByText('Enterprise required')).not.toBeInTheDocument();
    });

    it('keeps frozen enabled with the default repository warning callout when the repository is missing', () => {
      const { getByLabelText, getByTestId, queryByText } = renderSelector({
        hasDefaultSnapshotRepository: false,
        defaultValue: GRACE_DEFAULT_VALUE,
      });

      expect(getByLabelText('Enable frozen phase')).not.toBeDisabled();
      expect(getByTestId('frozenDefaultRepositoryRequiredCallout')).toBeInTheDocument();
      expect(queryByText('Default repository required')).not.toBeInTheDocument();
    });

    it('shows both warning callouts when both requirements are missing', () => {
      const { getByTestId } = renderSelector({
        hasEnterpriseLicense: false,
        hasDefaultSnapshotRepository: false,
        defaultValue: GRACE_DEFAULT_VALUE,
      });

      expect(getByTestId('frozenEnterpriseRequiredCallout')).toBeInTheDocument();
      expect(getByTestId('frozenDefaultRepositoryRequiredCallout')).toBeInTheDocument();
    });

    it('collapses to the disabled badge state after the user unchecks the phase', () => {
      const { getByLabelText, getByText, queryByTestId } = renderSelector({
        hasEnterpriseLicense: false,
        defaultValue: GRACE_DEFAULT_VALUE,
      });

      fireEvent.click(getByLabelText('Enable frozen phase'));

      expect(getByText('Enterprise required')).toBeInTheDocument();
      expect(getByLabelText('Enable frozen phase')).toBeDisabled();
      expect(queryByTestId('frozenEnterpriseRequiredCallout')).not.toBeInTheDocument();
    });

    it('keeps the frozen phase visible in the grace state even without create permission', () => {
      const { getByTestId } = renderSelector({
        hasDefaultSnapshotRepository: false,
        canCreateDefaultSnapshotRepository: false,
        defaultValue: GRACE_DEFAULT_VALUE,
      });

      expect(getByTestId('dlmPhasesSelectorFrozenPhaseCard')).toBeInTheDocument();
      expect(getByTestId('frozenDefaultRepositoryRequiredCallout')).toBeInTheDocument();
      expect(getByTestId('frozenCreateDefaultRepositoryButton')).toBeDisabled();
    });
  });

  it('disables phase configuration fields when the selector is disabled', () => {
    const { getByText, getByTestId } = renderSelector({
      isDisabled: true,
      defaultValue: {
        frozen: { enabled: true, value: '30', unit: 'd' },
        delete: { enabled: true, value: '60', unit: 'd' },
      },
    });

    expect(getByText('Move after')).toBeInTheDocument();
    expect(getByTestId('frozenDurationValue')).toBeDisabled();
    expect(getByTestId('frozenDurationUnit')).toBeDisabled();

    expect(getByText('Delete after')).toBeInTheDocument();
    expect(getByTestId('deleteDurationValue')).toBeDisabled();
    expect(getByTestId('deleteDurationUnit')).toBeDisabled();
  });
});
