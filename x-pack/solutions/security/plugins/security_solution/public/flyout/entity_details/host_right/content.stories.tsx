/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { Meta } from '@storybook/react';
import { EuiFlyout } from '@elastic/eui';
import { TestProvider } from '@kbn/expandable-flyout/src/test/provider';
import { StorybookProviders } from '../../../common/mock/storybook_providers';
import { mockRiskScoreState, mockEntityRiskScores } from '../../shared/mocks';
import { HostPanelContent } from './content';
import { mockObservedHostData, mockEntityRecord } from '../mocks';

const riskScoreData = { ...mockRiskScoreState, data: [] };

export default {
  title: 'Components/HostPanelContent',

  decorators: [
    (storyFn) => (
      <StorybookProviders>
        <TestProvider>
          <EuiFlyout size="m" onClose={() => {}}>
            {storyFn()}
          </EuiFlyout>
        </TestProvider>
      </StorybookProviders>
    ),
  ],
} as Meta;

export const Default = {
  render: () => (
    <HostPanelContent
      observedHost={mockObservedHostData}
      riskScoreState={riskScoreData}
      entityRiskScores={mockEntityRiskScores}
      contextID={'test-host-details'}
      scopeId={'test-scopeId'}
      openDetailsPanel={() => {}}
      identityFields={{ 'host.name': 'test-host-name' }}
      onAssetCriticalityChange={() => {}}
      recalculatingScore={false}
      isPreviewMode={false}
    />
  ),

  name: 'default',
};

export const WithGraphVisualization = {
  render: () => (
    <HostPanelContent
      observedHost={mockObservedHostData}
      riskScoreState={riskScoreData}
      entityRiskScores={mockEntityRiskScores}
      contextID={'test-host-details'}
      scopeId={'test-scopeId'}
      openDetailsPanel={() => {}}
      identityFields={{ 'host.name': 'test-host-name' }}
      onAssetCriticalityChange={() => {}}
      recalculatingScore={false}
      isPreviewMode={false}
      entityRecord={mockEntityRecord}
      entityStoreEntityId={mockEntityRecord.entity.id}
    />
  ),

  name: 'with graph visualization',
};

export const NoObservedData = {
  render: () => (
    <HostPanelContent
      observedHost={{
        details: {},
        isLoading: false,
        firstSeen: {
          isLoading: false,
          date: undefined,
        },
        lastSeen: {
          isLoading: false,
          date: undefined,
        },
      }}
      riskScoreState={riskScoreData}
      entityRiskScores={mockEntityRiskScores}
      contextID={'test-host-details'}
      scopeId={'test-scopeId'}
      openDetailsPanel={() => {}}
      identityFields={{ 'host.name': 'test-host-name' }}
      onAssetCriticalityChange={() => {}}
      recalculatingScore={false}
      isPreviewMode={false}
    />
  ),

  name: 'no observed data',
};

export const Loading = {
  render: () => (
    <HostPanelContent
      observedHost={{
        details: {},
        isLoading: true,
        firstSeen: {
          isLoading: true,
          date: undefined,
        },
        lastSeen: {
          isLoading: true,
          date: undefined,
        },
      }}
      riskScoreState={riskScoreData}
      entityRiskScores={mockEntityRiskScores}
      contextID={'test-host-details'}
      scopeId={'test-scopeId'}
      openDetailsPanel={() => {}}
      identityFields={{ 'host.name': 'test-host-name' }}
      onAssetCriticalityChange={() => {}}
      recalculatingScore={false}
      isPreviewMode={false}
    />
  ),

  name: 'loading',
};
