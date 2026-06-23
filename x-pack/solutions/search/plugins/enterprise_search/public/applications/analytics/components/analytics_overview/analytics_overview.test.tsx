/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues, setMockActions } from '../../../__mocks__/kea_logic';

import React from 'react';

import { screen, waitFor } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import type { AnalyticsCollection } from '../../../../../common/types/analytics';

import { AnalyticsOverview } from './analytics_overview';

jest.mock('../../utils/find_or_create_data_view', () => ({
  findOrCreateDataView: jest.fn().mockResolvedValue(undefined),
}));

const mockValues = {
  analyticsCollections: [
    {
      events_datastream: 'analytics-events-1',
      name: 'Analytics Collection 1',
    },
  ] as AnalyticsCollection[],
  hasNoAnalyticsCollections: false,
  hasPlatinumLicense: true,
  isCloud: false,
};

const mockActions = {
  fetchAnalyticsCollections: jest.fn(),
};

describe('AnalyticsOverview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('empty state', () => {
    it('renders when analytics collections are empty on inital query', async () => {
      setMockValues({
        ...mockValues,
        analyticsCollections: [],
        hasNoAnalyticsCollections: true,
      });
      setMockActions(mockActions);

      renderWithKibanaRenderContext(<AnalyticsOverview />);

      await waitFor(() => {
        expect(mockActions.fetchAnalyticsCollections).toHaveBeenCalled();
      });
      expect(screen.getByText('Create your first Collection')).toBeInTheDocument();
      expect(screen.queryByText('Analytics Collection 1')).not.toBeInTheDocument();
    });

    it('renders with Data', async () => {
      setMockValues(mockValues);
      setMockActions(mockActions);

      renderWithKibanaRenderContext(<AnalyticsOverview />);

      await waitFor(() => {
        expect(mockActions.fetchAnalyticsCollections).toHaveBeenCalled();
      });
      expect(screen.getByText('Analytics Collection 1')).toBeInTheDocument();
      expect(
        screen.queryByText('Behavioral Analytics require a Platinum license or higher')
      ).not.toBeInTheDocument();
    });

    it('renders Platinum license callout when not Cloud or Platinum', async () => {
      setMockValues({
        ...mockValues,
        hasPlatinumLicense: false,
        isCloud: false,
      });
      setMockActions(mockActions);

      renderWithKibanaRenderContext(<AnalyticsOverview />);

      expect(
        screen.getByText(
          'Behavioral Analytics require a Platinum license or higher and are not available to Standard license self-managed deployments. You need to upgrade to use this feature.',
          { exact: false }
        )
      ).toBeInTheDocument();
      expect(screen.queryByText('Analytics Collection 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Create your first Collection')).not.toBeInTheDocument();
    });

    it('Does not render Platinum license callout when Cloud', async () => {
      setMockValues({
        ...mockValues,
        hasPlatinumLicense: false,
        isCloud: true,
      });
      setMockActions(mockActions);

      renderWithKibanaRenderContext(<AnalyticsOverview />);

      expect(
        screen.queryByText('Behavioral Analytics require a Platinum license or higher', {
          exact: false,
        })
      ).not.toBeInTheDocument();
    });
  });
});
