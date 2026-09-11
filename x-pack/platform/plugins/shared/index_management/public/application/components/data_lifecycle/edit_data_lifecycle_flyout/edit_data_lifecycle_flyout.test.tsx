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
import type { SerializedPolicy } from '@kbn/index-lifecycle-management-common-shared';
import type { DataLifecycleMethod } from '@kbn/data-lifecycle-phases';
import {
  EditDataLifecycleFlyout,
  type EditDataLifecycleFlyoutProps,
} from './edit_data_lifecycle_flyout';

const BASE_SUCCESSFUL_DATA: EditDataLifecycleFlyoutProps['successfulData'] = {
  inheritLifecycle: false,
  onInheritLifecycleChange: jest.fn(),
  dlm: {
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
  },
};

const BASE_FAILED_DATA: EditDataLifecycleFlyoutProps['failedData'] = {
  inheritLifecycle: false,
  onInheritLifecycleChange: jest.fn(),
  failureStoreEnabled: true,
  onFailureStoreChange: jest.fn(),
  deletePhaseDefaultValue: { enabled: false, value: '60', unit: 'd' },
};

const renderFlyout = (props?: Partial<EditDataLifecycleFlyoutProps>) => {
  const onClose = jest.fn();
  const onApply = jest.fn();

  const result = render(
    <IntlProvider>
      <EditDataLifecycleFlyout
        onClose={onClose}
        onApply={onApply}
        successfulData={BASE_SUCCESSFUL_DATA}
        failedData={BASE_FAILED_DATA}
        {...props}
      />
    </IntlProvider>
  );

  return { ...result, onClose, onApply };
};

describe('EditDataLifecycleFlyout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the flyout title and both tabs', () => {
    const { getByText } = renderFlyout();

    expect(getByText('Edit data lifecycle')).toBeInTheDocument();
    expect(getByText('Successful data')).toBeInTheDocument();
    expect(getByText('Failed data')).toBeInTheDocument();
  });

  it('defaults to the successful data tab', () => {
    const { getByTestId } = renderFlyout();

    expect(getByTestId('flyoutTab-successful_data').getAttribute('aria-selected')).toBe('true');
    expect(getByTestId('flyoutTab-failed_data').getAttribute('aria-selected')).toBe('false');
  });

  it('respects initialTabId and opens the failed data tab first', () => {
    const { getByTestId } = renderFlyout({ initialTabId: 'failed_data' });

    expect(getByTestId('flyoutTab-failed_data').getAttribute('aria-selected')).toBe('true');
    expect(getByTestId('flyoutTab-successful_data').getAttribute('aria-selected')).toBe('false');
  });

  it('switches to the failed data tab on click', () => {
    const { getByTestId, getByText } = renderFlyout();

    fireEvent.click(getByTestId('flyoutTab-failed_data'));

    expect(getByTestId('flyoutTab-failed_data').getAttribute('aria-selected')).toBe('true');
    expect(getByText('Delete phase')).toBeInTheDocument();
  });

  it('renders a successful data notice only on the successful data tab', () => {
    const { getByTestId, queryByTestId } = renderFlyout({
      successfulData: {
        ...BASE_SUCCESSFUL_DATA,
        notice: <div data-test-subj="successfulDataNotice" />,
      },
    });

    expect(getByTestId('successfulDataNotice')).toBeInTheDocument();
    fireEvent.click(getByTestId('flyoutTab-failed_data'));
    expect(queryByTestId('successfulDataNotice')).not.toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', () => {
    const { getByRole, onClose } = renderFlyout();

    fireEvent.click(getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onApply with DLM payload when Apply is clicked', () => {
    const { getByTestId, onApply } = renderFlyout();

    fireEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

    expect(onApply).toHaveBeenCalledWith({
      successfulData: {
        inheritLifecycle: false,
        method: 'dlm',
        frozenAfter: undefined,
        dataRetention: undefined,
      },
      failedData: undefined,
    });
  });

  it('applies only failed data when the successful tab was not edited', () => {
    const { getByTestId, onApply } = renderFlyout({ initialTabId: 'failed_data' });

    fireEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

    expect(onApply).toHaveBeenCalledWith({
      successfulData: undefined,
      failedData: {
        inheritLifecycle: false,
        failureStoreEnabled: true,
        retentionDisabled: true,
      },
    });
  });

  it('keeps edits from both tabs when applying from the failed data tab', () => {
    const { getByTestId, onApply } = renderFlyout();

    fireEvent.click(getByTestId('dlmPhasesSelectorDeletePhaseCard'));
    fireEvent.click(getByTestId('flyoutTab-failed_data'));
    fireEvent.click(getByTestId('dlmPhasesSelectorDeletePhaseCard'));
    fireEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

    expect(onApply).toHaveBeenCalledWith({
      successfulData: expect.objectContaining({
        method: 'dlm',
        dataRetention: '60d',
      }),
      failedData: expect.objectContaining({
        failureStoreEnabled: true,
        retention: '60d',
      }),
    });
  });

  it('keeps edits from both tabs when applying from the successful data tab', () => {
    const { getByTestId, onApply } = renderFlyout();

    fireEvent.click(getByTestId('flyoutTab-failed_data'));
    fireEvent.click(getByTestId('dlmPhasesSelectorDeletePhaseCard'));
    fireEvent.click(getByTestId('flyoutTab-successful_data'));
    fireEvent.click(getByTestId('dlmPhasesSelectorDeletePhaseCard'));
    fireEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

    expect(onApply).toHaveBeenCalledWith({
      successfulData: expect.objectContaining({
        method: 'dlm',
        dataRetention: '60d',
      }),
      failedData: expect.objectContaining({
        failureStoreEnabled: true,
        retention: '60d',
      }),
    });
  });

  it('keeps a toggled failure store when applying from the successful data tab', () => {
    const { getByTestId, onApply } = renderFlyout({ initialTabId: 'failed_data' });

    fireEvent.click(getByTestId('editFailedDataLifecycle-enableFailureStoreCheckbox'));
    fireEvent.click(getByTestId('flyoutTab-successful_data'));
    fireEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

    expect(BASE_FAILED_DATA.onFailureStoreChange).toHaveBeenCalledWith(false);
    expect(onApply).toHaveBeenCalledWith({
      successfulData: expect.objectContaining({ inheritLifecycle: false }),
      failedData: expect.objectContaining({ failureStoreEnabled: true }),
    });
  });

  it('keeps a toggled failed inherit setting when applying from the successful data tab', () => {
    const { getByTestId, onApply } = renderFlyout({ initialTabId: 'failed_data' });

    fireEvent.click(getByTestId('dataLifecycleInheritCheckbox'));
    fireEvent.click(getByTestId('flyoutTab-successful_data'));
    fireEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

    expect(BASE_FAILED_DATA.onInheritLifecycleChange).toHaveBeenCalledWith(true);
    expect(onApply).toHaveBeenCalledWith({
      successfulData: expect.objectContaining({ inheritLifecycle: false }),
      failedData: expect.objectContaining({ inheritLifecycle: false }),
    });
  });

  it('keeps a toggled successful inherit setting when applying from the failed data tab', () => {
    const { getByTestId, onApply } = renderFlyout();

    fireEvent.click(getByTestId('dataLifecycleInheritCheckbox'));
    fireEvent.click(getByTestId('flyoutTab-failed_data'));
    fireEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

    expect(BASE_SUCCESSFUL_DATA.onInheritLifecycleChange).toHaveBeenCalledWith(true);
    expect(onApply).toHaveBeenCalledWith({
      successfulData: expect.objectContaining({ inheritLifecycle: false }),
      failedData: expect.objectContaining({ failureStoreEnabled: true }),
    });
  });

  it('keeps a selected ILM policy when applying from the failed data tab', () => {
    // The policy selection is controlled by the host, so mirror it here for the payload to carry it.
    const onApply = jest.fn();
    const serializedPolicy: SerializedPolicy = { name: 'my_policy', phases: {} };
    const FlyoutWithPolicyState = () => {
      const [selectedPolicyName, setSelectedPolicyName] = React.useState<string | undefined>();

      return (
        <EditDataLifecycleFlyout
          onClose={jest.fn()}
          onApply={onApply}
          successfulData={{
            ...BASE_SUCCESSFUL_DATA,
            ilm: {
              method: 'ilm',
              onMethodChange: jest.fn(),
              policies: [{ name: 'my_policy', phases: {}, serializedPolicy }],
              selectedPolicyName,
              onPolicySelect: setSelectedPolicyName,
            },
          }}
          failedData={BASE_FAILED_DATA}
        />
      );
    };

    const { getByTestId } = render(
      <IntlProvider>
        <FlyoutWithPolicyState />
      </IntlProvider>
    );

    fireEvent.click(getByTestId('retentionSelectableRow-my_policy'));
    fireEvent.click(getByTestId('flyoutTab-failed_data'));
    fireEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

    expect(onApply).toHaveBeenCalledWith({
      successfulData: expect.objectContaining({ method: 'ilm', ilmPolicyName: 'my_policy' }),
      failedData: expect.objectContaining({ failureStoreEnabled: true }),
    });
  });

  it('forces failed delete phase enabled on serverless when failure store is enabled', () => {
    const { getByTestId, onApply } = renderFlyout({
      isServerless: true,
      initialTabId: 'failed_data',
    });

    expect(getByTestId('deleteDurationValue')).not.toBeDisabled();
    expect(getByTestId('deleteDurationUnit')).not.toBeDisabled();

    fireEvent.click(getByTestId('dlmPhasesSelectorDeletePhaseCard'));

    fireEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        failedData: expect.objectContaining({
          inheritLifecycle: false,
          failureStoreEnabled: true,
        }),
      })
    );
  });

  it('hides the failed delete phase toggle on serverless when not inheriting', () => {
    const { getByTestId } = renderFlyout({
      isServerless: true,
      initialTabId: 'failed_data',
    });

    const deleteCard = getByTestId('dlmPhasesSelectorDeletePhaseCard');
    expect(deleteCard.getAttribute('role')).toBe('group');
    expect(deleteCard.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('hides the failed delete phase toggle on serverless when the lifecycle is inherited', () => {
    const { getByTestId } = renderFlyout({
      isServerless: true,
      initialTabId: 'failed_data',
      failedData: { ...BASE_FAILED_DATA, inheritLifecycle: true },
    });

    const deleteCard = getByTestId('dlmPhasesSelectorDeletePhaseCard');
    expect(deleteCard.getAttribute('role')).toBe('group');
    expect(deleteCard.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('calls onPolicyInspect when inspect action is clicked', () => {
    const onPolicyInspect = jest.fn();
    const serializedPolicy: SerializedPolicy = { name: 'my_policy', phases: {} };

    const { getByTestId } = renderFlyout({
      successfulData: {
        ...BASE_SUCCESSFUL_DATA,
        ilm: {
          method: 'ilm',
          onMethodChange: jest.fn(),
          policies: [{ name: 'my_policy', phases: {}, serializedPolicy }],
          selectedPolicyName: 'my_policy',
          onPolicySelect: jest.fn(),
          onPolicyInspect,
        },
      },
    });

    fireEvent.click(getByTestId('retentionSelectableRowInspect-my_policy'));
    expect(onPolicyInspect).toHaveBeenCalledWith('my_policy');
  });

  it('includes DLM phase durations in onApply when the user configures them', () => {
    const { getByTestId, onApply } = renderFlyout();

    fireEvent.click(getByTestId('dlmPhasesSelectorDeletePhaseCard'));

    fireEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

    expect(onApply).toHaveBeenCalledWith({
      successfulData: expect.objectContaining({
        method: 'dlm',
        dataRetention: '60d',
      }),
      failedData: undefined,
    });
  });

  it('calls onApply with inheritLifecycle payload when inherit is enabled', () => {
    const { getByTestId, onApply } = renderFlyout({
      successfulData: { ...BASE_SUCCESSFUL_DATA, inheritLifecycle: true },
      failedData: { ...BASE_FAILED_DATA, inheritLifecycle: true },
    });

    fireEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

    expect(onApply).toHaveBeenCalledWith({
      successfulData: { inheritLifecycle: true },
      failedData: undefined,
    });
  });

  it('includes the failed retention the user configures', () => {
    const { getByTestId, onApply } = renderFlyout({ initialTabId: 'failed_data' });

    fireEvent.click(getByTestId('dlmPhasesSelectorDeletePhaseCard'));

    fireEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        failedData: expect.objectContaining({
          inheritLifecycle: false,
          failureStoreEnabled: true,
          retention: '60d',
        }),
      })
    );
  });

  it('persists the effective failed retention even when the user does not change it', () => {
    const { getByTestId, onApply } = renderFlyout({
      initialTabId: 'failed_data',
      failedData: {
        ...BASE_FAILED_DATA,
        deletePhaseDefaultValue: { enabled: true, value: '30', unit: 'd' },
      },
    });

    fireEvent.click(getByTestId('editDataLifecycleFlyoutApplyButton'));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        failedData: expect.objectContaining({
          inheritLifecycle: false,
          failureStoreEnabled: true,
          retention: '30d',
        }),
      })
    );
  });

  it('disables the Apply button when method is ILM and no policy is selected', () => {
    const { getByTestId } = renderFlyout({
      successfulData: {
        ...BASE_SUCCESSFUL_DATA,
        inheritLifecycle: false,
        ilm: {
          method: 'ilm',
          onMethodChange: jest.fn(),
          policies: [],
          selectedPolicyName: undefined,
          onPolicySelect: jest.fn(),
        },
      },
    });

    expect(getByTestId('editDataLifecycleFlyoutApplyButton')).toBeDisabled();
  });

  it('allows applying failed data when untouched successful ILM is incomplete', () => {
    const { getByTestId } = renderFlyout({
      initialTabId: 'failed_data',
      successfulData: {
        ...BASE_SUCCESSFUL_DATA,
        inheritLifecycle: false,
        ilm: {
          method: 'ilm',
          onMethodChange: jest.fn(),
          policies: [],
          selectedPolicyName: undefined,
          onPolicySelect: jest.fn(),
        },
      },
    });

    expect(getByTestId('editDataLifecycleFlyoutApplyButton')).toBeEnabled();
  });

  it('disables applying from the failed tab when modified successful ILM is incomplete', () => {
    // The method picker is controlled by the host, so mirror it here: switching to ILM has to
    // stick for the incomplete-policy check to still apply from the failed data tab.
    const FlyoutWithMethodState = () => {
      const [method, setMethod] = React.useState<DataLifecycleMethod>('dlm');

      return (
        <EditDataLifecycleFlyout
          onClose={jest.fn()}
          onApply={jest.fn()}
          successfulData={{
            ...BASE_SUCCESSFUL_DATA,
            ilm: {
              method,
              onMethodChange: setMethod,
              policies: [],
              selectedPolicyName: undefined,
              onPolicySelect: jest.fn(),
            },
          }}
          failedData={BASE_FAILED_DATA}
        />
      );
    };

    const { getByTestId } = render(
      <IntlProvider>
        <FlyoutWithMethodState />
      </IntlProvider>
    );

    fireEvent.click(getByTestId('editDataLifecycle-methodCard-ilm'));
    fireEvent.click(getByTestId('flyoutTab-failed_data'));

    expect(getByTestId('editDataLifecycleFlyoutApplyButton')).toBeDisabled();
  });

  it('enables the Apply button when method is ILM and a policy is selected', () => {
    const { getByTestId } = renderFlyout({
      successfulData: {
        ...BASE_SUCCESSFUL_DATA,
        inheritLifecycle: false,
        ilm: {
          method: 'ilm',
          onMethodChange: jest.fn(),
          policies: [{ name: 'my-policy', phases: {} }],
          selectedPolicyName: 'my-policy',
          onPolicySelect: jest.fn(),
        },
      },
    });

    expect(getByTestId('editDataLifecycleFlyoutApplyButton')).not.toBeDisabled();
  });

  it('enables the Apply button when ILM method is set but lifecycle is inherited', () => {
    const { getByTestId } = renderFlyout({
      successfulData: {
        ...BASE_SUCCESSFUL_DATA,
        inheritLifecycle: true,
        ilm: {
          method: 'ilm',
          onMethodChange: jest.fn(),
          policies: [],
          selectedPolicyName: undefined,
          onPolicySelect: jest.fn(),
        },
      },
    });

    expect(getByTestId('editDataLifecycleFlyoutApplyButton')).not.toBeDisabled();
  });

  it('hides the DLM phase selector when isServerless is true and effectiveMethod is DLM', () => {
    const { queryByText } = renderFlyout({ isServerless: true });

    expect(queryByText('Hot phase')).not.toBeInTheDocument();
    expect(queryByText('Frozen phase')).not.toBeInTheDocument();
  });
});
