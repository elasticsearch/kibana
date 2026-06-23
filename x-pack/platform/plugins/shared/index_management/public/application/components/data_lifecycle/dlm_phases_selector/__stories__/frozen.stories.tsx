/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { usePhaseColors } from '@kbn/data-lifecycle-phases';
import { FrozenPhaseCard } from '../components/frozen_phase_card';
import type { DlmPhaseDuration } from '../types';

const FrozenCard = (args: {
  hasEnterpriseLicense: boolean;
  hasDefaultSnapshotRepository: boolean;
  initiallyEnabled?: boolean;
}) => {
  const phaseColors = usePhaseColors();
  const [duration, setDuration] = useState<DlmPhaseDuration>({
    enabled: args.initiallyEnabled ?? true,
    value: '30',
    unit: 'd',
  });

  return (
    <FrozenPhaseCard
      id="storybookFrozenPhase"
      color={phaseColors.frozen}
      duration={duration}
      durationError={undefined}
      helpText={undefined}
      isFormDisabled={false}
      defaultSnapshotRepository="found-snapshots"
      manageRepositoriesHref="/app/management/data/snapshot_restore/repositories"
      hasEnterpriseLicense={args.hasEnterpriseLicense}
      hasDefaultSnapshotRepository={args.hasDefaultSnapshotRepository}
      canCreateDefaultSnapshotRepository={true}
      createDefaultRepositoryUrl="/app/management/data/snapshot_restore/add_repository"
      enterprise={{
        isCloudEnabled: true,
        canManageLicense: true,
        trialDaysLeft: undefined,
        onUpgrade: action('enterprise.onUpgrade'),
        subscriptionFeaturesUrl: 'https://www.elastic.co/subscriptions/cloud',
      }}
      onRefreshDefaultSnapshotRepository={action('onRefreshDefaultSnapshotRepository')}
      onChange={setDuration}
    />
  );
};

const meta: Meta<typeof FrozenCard> = {
  component: FrozenCard,
  title: 'DLM Phases Selector/Cards/Frozen',
  args: {
    hasEnterpriseLicense: true,
    hasDefaultSnapshotRepository: true,
    initiallyEnabled: true,
  },
};

export default meta;

type Story = StoryObj<typeof FrozenCard>;

export const Card: Story = {};

export const CardEnterpriseRequired: Story = {
  args: {
    hasEnterpriseLicense: false,
    initiallyEnabled: false,
  },
};

export const CardDefaultRepositoryRequired: Story = {
  args: {
    hasDefaultSnapshotRepository: false,
    initiallyEnabled: false,
  },
};

export const CardActiveWithEnterpriseWarning: Story = {
  args: {
    hasEnterpriseLicense: false,
    initiallyEnabled: true,
  },
};

export const CardActiveWithDefaultRepositoryWarning: Story = {
  args: {
    hasDefaultSnapshotRepository: false,
    initiallyEnabled: true,
  },
};
