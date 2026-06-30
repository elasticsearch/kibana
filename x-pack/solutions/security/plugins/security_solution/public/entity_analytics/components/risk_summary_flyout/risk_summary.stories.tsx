/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { StoryFn } from '@storybook/react';
import { TestProvider } from '@kbn/expandable-flyout/src/test/provider';
import { EntityType } from '../../../../common/search_strategy';
import { StorybookProviders } from '../../../common/mock/storybook_providers';
import { mockRiskScoreState, mockEntityRiskScores } from '../../../flyout/shared/mocks';
import { FlyoutRiskSummary } from './risk_summary';

export default {
  component: FlyoutRiskSummary,
  title: 'Components/FlyoutRiskSummary',
};

export const Default: StoryFn = () => {
  return (
    <StorybookProviders>
      <TestProvider>
        <div css={{ maxWidth: '300px' }}>
          <FlyoutRiskSummary
            openDetailsPanel={() => {}}
            riskScoreData={{ ...mockRiskScoreState, data: [] }}
            entityRiskScores={mockEntityRiskScores}
            queryId={'testQuery'}
            recalculatingScore={false}
            isPreviewMode={false}
            entityType={EntityType.user}
          />
        </div>
      </TestProvider>
    </StorybookProviders>
  );
};

export const InPreviewMode: StoryFn = () => {
  return (
    <StorybookProviders>
      <TestProvider>
        <div css={{ maxWidth: '300px' }}>
          <FlyoutRiskSummary
            riskScoreData={{ ...mockRiskScoreState, data: [] }}
            entityRiskScores={mockEntityRiskScores}
            queryId={'testQuery'}
            recalculatingScore={false}
            openDetailsPanel={() => {}}
            isPreviewMode
            entityType={EntityType.user}
          />
        </div>
      </TestProvider>
    </StorybookProviders>
  );
};
