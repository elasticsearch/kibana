/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { EuiPanel } from '@elastic/eui';
import { FrozenDefaultRepositoryRequiredCallout } from '../frozen_default_repository_required_callout';
import { FrozenEnterpriseRequiredCallout } from '../frozen_enterprise_required_callout';

const meta: Meta = {
  title: 'Data Lifecycle Phases / Frozen phase callouts',
};

export default meta;
type Story = StoryObj;

const Container = ({ children }: { children: React.ReactNode }) => (
  <EuiPanel hasBorder hasShadow={false} paddingSize="m" css={{ maxWidth: 520 }}>
    {children}
  </EuiPanel>
);

export const EnterpriseRequiredWithUpgrade: Story = {
  name: 'Enterprise required — with upgrade action',
  render: () => (
    <Container>
      <FrozenEnterpriseRequiredCallout
        onUpgradeEnterprise={() => action('onUpgradeEnterprise')()}
      />
    </Container>
  ),
};

export const EnterpriseRequiredNoAction: Story = {
  name: 'Enterprise required — no action',
  render: () => (
    <Container>
      <FrozenEnterpriseRequiredCallout />
    </Container>
  ),
};

export const DefaultRepositoryRequiredWithActions: Story = {
  name: 'Default repository required — with actions',
  render: () => (
    <Container>
      <FrozenDefaultRepositoryRequiredCallout
        onCreateDefaultRepository={() => action('onCreateDefaultRepository')()}
        onRefresh={() => action('onRefresh')()}
      />
    </Container>
  ),
};

export const DefaultRepositoryRequiredRefreshing: Story = {
  name: 'Default repository required — refreshing',
  render: () => (
    <Container>
      <FrozenDefaultRepositoryRequiredCallout
        onCreateDefaultRepository={() => action('onCreateDefaultRepository')()}
        onRefresh={() => action('onRefresh')()}
        isRefreshing
      />
    </Container>
  ),
};

export const DefaultRepositoryRequiredNoActions: Story = {
  name: 'Default repository required — no actions',
  render: () => (
    <Container>
      <FrozenDefaultRepositoryRequiredCallout />
    </Container>
  ),
};
