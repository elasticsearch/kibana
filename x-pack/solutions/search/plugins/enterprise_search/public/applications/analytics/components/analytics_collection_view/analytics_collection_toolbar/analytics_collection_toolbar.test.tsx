/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockActions, setMockValues } from '../../../../__mocks__/kea_logic';

import React from 'react';

import { fireEvent, screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import type { AnalyticsCollection } from '../../../../../../common/types/analytics';

import { AnalyticsCollectionToolbar } from './analytics_collection_toolbar';

// EuiSuperDatePicker has no stable test IDs for its internal controls (quick-select buttons,
// apply button, etc.), so triggering onTimeChange/onRefreshChange/onRefresh through real DOM
// interaction is fragile. Instead, the mock below intercepts the callback props passed by
// AnalyticsCollectionToolbar during render and exposes them via the captured* variables so each
// test can invoke them directly — verifying that the component wires callbacks to kea actions
// without relying on EUI internals.
let capturedOnTimeChange: ((props: any) => void) | undefined;
let capturedOnRefreshChange: ((props: any) => void) | undefined;
let capturedOnRefresh: (() => void) | undefined;

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    EuiSuperDatePicker: (props: any) => {
      capturedOnTimeChange = props.onTimeChange;
      capturedOnRefreshChange = props.onRefreshChange;
      capturedOnRefresh = props.onRefresh;
      return <div data-test-subj="superDatePicker" />;
    },
  };
});

describe('AnalyticsCollectionToolbar', () => {
  const mockActions = {
    deleteAnalyticsCollection: jest.fn(),
    findDataViewId: jest.fn(),
    onTimeRefresh: jest.fn(),
    setRefreshInterval: jest.fn(),
    setTimeRange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnTimeChange = undefined;
    capturedOnRefreshChange = undefined;
    capturedOnRefresh = undefined;

    setMockValues({
      analyticsCollection: {
        events_datastream: 'test-events',
        name: 'test',
      } as AnalyticsCollection,
      dataView: { id: 'data-view-test' },
      isLoading: false,
      refreshInterval: { pause: false, value: 10000 },
      timeRange: { from: 'now-90d', to: 'now' },
    });
    setMockActions(mockActions);
  });

  it('should call setTimeRange when date picker changed time', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionToolbar />);

    expect(screen.getByTestId('superDatePicker')).toBeInTheDocument();
    capturedOnTimeChange!({ end: 'now', start: 'now-30d' });

    expect(mockActions.setTimeRange).toHaveBeenCalledWith({ from: 'now-30d', to: 'now' });
  });

  it('should call setRefreshInterval when date picker changed refresh time', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionToolbar />);

    capturedOnRefreshChange!({ isPaused: true, refreshInterval: 20000 });

    expect(mockActions.setRefreshInterval).toHaveBeenCalledWith({
      pause: true,
      value: 20000,
    });
  });

  it('should call onTimeRefresh when the refresh button is clicked', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionToolbar />);

    capturedOnRefresh!();

    expect(mockActions.onTimeRefresh).toHaveBeenCalled();
  });

  it('should correct link to explore in discover item', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionToolbar />);

    fireEvent.click(screen.getByTestId('enterpriseSearchAnalyticsCollectionToolbarManageButton'));

    const discoverLink = screen.getByText('Create dashboards in Discover').closest('a');
    expect(discoverLink).toHaveAttribute(
      'href',
      "/app/discover#/?_a=(index:'data-view-test')&_g=(filters:!(),refreshInterval:(pause:!f,value:10000),time:(from:now-90d,to:now))"
    );
  });

  it('should correct link to the manage datastream link', () => {
    renderWithKibanaRenderContext(<AnalyticsCollectionToolbar />);

    fireEvent.click(screen.getByTestId('enterpriseSearchAnalyticsCollectionToolbarManageButton'));

    const datastreamLink = screen.getByText('Manage events datastream').closest('a');
    expect(datastreamLink).toHaveAttribute(
      'href',
      '/app/management/data/index_management/data_streams/test-events'
    );
  });
});
