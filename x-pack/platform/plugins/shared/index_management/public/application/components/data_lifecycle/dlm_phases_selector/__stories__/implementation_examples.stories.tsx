/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { EuiCheckbox, EuiSpacer } from '@elastic/eui';
import { DlmPhasesSelector } from '../dlm_phases_selector';
import type { DlmPhasesSelectorProps } from '../dlm_phases_selector';

const meta: Meta<typeof DlmPhasesSelector> = {
  component: DlmPhasesSelector,
  title: 'DLM Phases Selector/Implementation examples',
  args: {
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
      onUpgrade: action('enterprise.onUpgrade'),
      subscriptionFeaturesUrl: 'https://www.elastic.co/subscriptions/cloud',
    },
    onChange: action('onChange'),
  },
};

export default meta;

type Story = StoryObj<typeof DlmPhasesSelector>;

export const Collapsed: Story = {
  render: (args) => <DlmPhasesSelector {...args} />,
};

export const Expanded: Story = {
  args: {
    defaultValue: {
      frozen: { enabled: true, value: '30', unit: 'd' },
      delete: { enabled: true, value: '60', unit: 'd' },
    },
  },
  render: (args) => <DlmPhasesSelector {...args} />,
};

const DisabledStory = (args: DlmPhasesSelectorProps) => {
  const [isDisabled, setIsDisabled] = useState(true);

  return (
    <>
      <EuiCheckbox
        id="dlmPhasesSelectorDisabledToggle"
        label="Disabled"
        checked={isDisabled}
        onChange={(e) => setIsDisabled(e.target.checked)}
      />
      <EuiSpacer size="m" />
      <DlmPhasesSelector {...args} isDisabled={isDisabled} />
    </>
  );
};

export const Disabled: Story = {
  name: 'Disabled',
  args: {
    defaultValue: {
      frozen: { enabled: true, value: '30', unit: 'd' },
      delete: { enabled: true, value: '60', unit: 'd' },
    },
  },
  render: (args) => <DisabledStory {...args} />,
};

export const FrozenRequiresEnterprise: Story = {
  args: {
    hasEnterpriseLicense: false,
  },
  render: (args) => <DlmPhasesSelector {...args} />,
};

export const FrozenRequiresDefaultRepository: Story = {
  args: {
    hasDefaultSnapshotRepository: false,
  },
  render: (args) => <DlmPhasesSelector {...args} />,
};

export const FrozenOmittedWithoutRepositoryPermission: Story = {
  args: {
    hasDefaultSnapshotRepository: false,
    canCreateDefaultSnapshotRepository: false,
  },
  render: (args) => <DlmPhasesSelector {...args} />,
};

export const ExistingFrozenActiveMissingEnterprise: Story = {
  name: 'Existing template — frozen active, enterprise missing',
  args: {
    hasEnterpriseLicense: false,
    defaultValue: {
      frozen: { enabled: true, value: '30', unit: 'd' },
      delete: { enabled: true, value: '60', unit: 'd' },
    },
  },
  render: (args) => <DlmPhasesSelector {...args} />,
};

export const ExistingFrozenActiveMissingRepository: Story = {
  name: 'Existing template — frozen active, repository missing',
  args: {
    hasDefaultSnapshotRepository: false,
    defaultValue: {
      frozen: { enabled: true, value: '30', unit: 'd' },
      delete: { enabled: true, value: '60', unit: 'd' },
    },
  },
  render: (args) => <DlmPhasesSelector {...args} />,
};
