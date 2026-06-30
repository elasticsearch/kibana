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
import { mockEntityRiskScores, mockRiskScoreState } from '../../shared/mocks';
import { mockObservedUser, mockEntityRecord } from './mocks';
import { UserPanelContent } from './content';

const riskScoreData = { ...mockRiskScoreState, data: [] };

export default {
  title: 'Components/UserPanelContent',

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
    <UserPanelContent
      observedUser={mockObservedUser}
      riskScoreState={riskScoreData}
      entityRiskScores={mockEntityRiskScores}
      contextID={'test-user-details'}
      scopeId={'test-scopeId'}
      openDetailsPanel={() => {}}
      identityFields={{ 'user.name': 'test-user-name' }}
      onAssetCriticalityChange={() => {}}
      recalculatingScore={false}
      isPreviewMode={false}
    />
  ),

  name: 'default',
};

export const IntegrationDisabled = {
  render: () => (
    <UserPanelContent
      observedUser={mockObservedUser}
      riskScoreState={riskScoreData}
      entityRiskScores={mockEntityRiskScores}
      contextID={'test-user-details'}
      scopeId={'test-scopeId'}
      openDetailsPanel={() => {}}
      identityFields={{ 'user.name': 'test-user-name' }}
      onAssetCriticalityChange={() => {}}
      recalculatingScore={false}
      isPreviewMode={false}
      entityRecord={mockEntityRecord}
      entityStoreEntityId={mockEntityRecord.entity.id}
    />
  ),

  name: 'with graph visualization',
};

export const NoManagedData = {
  render: () => (
    <UserPanelContent
      observedUser={mockObservedUser}
      riskScoreState={riskScoreData}
      entityRiskScores={mockEntityRiskScores}
      contextID={'test-user-details'}
      scopeId={'test-scopeId'}
      openDetailsPanel={() => {}}
      identityFields={{ 'user.name': 'test-user-name' }}
      onAssetCriticalityChange={() => {}}
      recalculatingScore={false}
      isPreviewMode={false}
    />
  ),

  name: 'no managed data',
};

export const NoObservedData = {
  render: () => (
    <UserPanelContent
      observedUser={{
        details: {
          user: {
            id: [],
            domain: [],
          },
          host: {
            ip: [],
            os: {
              name: [],
              family: [],
            },
          },
        },
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
      contextID={'test-user-details'}
      scopeId={'test-scopeId'}
      openDetailsPanel={() => {}}
      identityFields={{ 'user.name': 'test-user-name' }}
      onAssetCriticalityChange={() => {}}
      recalculatingScore={false}
      isPreviewMode={false}
    />
  ),

  name: 'no observed data',
};

export const Loading = {
  render: () => (
    <UserPanelContent
      observedUser={{
        details: {
          user: {
            id: [],
            domain: [],
          },
          host: {
            ip: [],
            os: {
              name: [],
              family: [],
            },
          },
        },
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
      contextID={'test-user-details'}
      scopeId={'test-scopeId'}
      openDetailsPanel={() => {}}
      identityFields={{ 'user.name': 'test-user-name' }}
      onAssetCriticalityChange={() => {}}
      recalculatingScore={false}
      isPreviewMode={false}
    />
  ),

  name: 'loading',
};
