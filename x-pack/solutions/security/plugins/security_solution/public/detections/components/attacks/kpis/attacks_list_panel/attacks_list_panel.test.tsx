/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import type { DataView } from '@kbn/data-views-plugin/common';
import { AttacksListPanel } from './attacks_list_panel';
import { useAttacksListData } from './use_attacks_list_data';
import { AttackDetailsRightPanelKey } from '../../../../../flyout/attack_details/constants/panel_keys';
import { useKibana } from '../../../../../common/lib/kibana';
import { AttacksEventTypes } from '../../../../../common/lib/telemetry';
import { useIsExperimentalFeatureEnabled } from '../../../../../common/hooks/use_experimental_features';
import { useDefaultDocumentFlyoutProperties } from '../../../../../flyout_v2/shared/hooks/use_default_flyout_properties';

jest.mock('../../../../../common/lib/kibana');
jest.mock('./use_attacks_list_data');
jest.mock('@kbn/expandable-flyout');
jest.mock('../../../../../entity_analytics/components/severity/severity_bar', () => ({
  SeverityBar: () => <div data-test-subj="severity-bar" />,
}));
jest.mock('../../../../../common/hooks/use_experimental_features');
jest.mock('../../../../../flyout_v2/shared/hooks/use_default_flyout_properties');
jest.mock('../../../../../flyout_v2/shared/components/flyout_provider', () => ({
  flyoutProviders: jest.fn(({ children }: { children: React.ReactNode }) => (
    <div data-test-subj="flyout-providers">{children}</div>
  )),
}));
jest.mock('../../../../../flyout_v2/attack/main/attack_flyout_wrapper', () => ({
  AttackFlyoutWrapper: (props: unknown) => (
    <div data-test-subj="attack-flyout-wrapper">{JSON.stringify(props)}</div>
  ),
}));
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useStore: () => ({ getState: jest.fn(), dispatch: jest.fn(), subscribe: jest.fn() }),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: () => ({ push: jest.fn() }),
}));

describe('AttacksListPanel', () => {
  const mockDataView = {
    title: 'test-index-pattern',
    getIndexPattern: () => 'test-index-pattern',
  } as unknown as DataView;

  const mockOpenFlyout = jest.fn();
  const mockOpenSystemFlyout = jest.fn();
  const reportEvent = jest.fn();

  beforeEach(() => {
    (useExpandableFlyoutApi as jest.Mock).mockReturnValue({
      openFlyout: mockOpenFlyout,
    });
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        telemetry: {
          reportEvent,
        },
        overlays: {
          openSystemFlyout: mockOpenSystemFlyout,
        },
      },
    });
    (useIsExperimentalFeatureEnabled as jest.Mock).mockReturnValue(false);
    (useDefaultDocumentFlyoutProperties as jest.Mock).mockReturnValue({
      maxWidth: 1200,
      minWidth: 400,
      ownFocus: false,
      paddingSize: 'm',
      resizable: true,
      size: 's',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state correctly', () => {
    (useAttacksListData as jest.Mock).mockReturnValue({
      items: [],
      isLoading: true,
      pageIndex: 0,
      pageSize: 10,
      total: 0,
      setPageIndex: jest.fn(),
      setPageSize: jest.fn(),
      refetch: jest.fn(),
    });

    render(<AttacksListPanel dataView={mockDataView} />);
    expect(screen.getByRole('progressbar', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders table with data correctly', () => {
    const mockItems = [
      {
        id: 'attack-1',
        name: 'Attack 1',
        alertsCount: 5,
        severityCount: { critical: 2, high: 3 },
      },
      {
        id: 'attack-2',
        name: 'Attack 2',
        alertsCount: 3,
        severityCount: { low: 3 },
      },
    ];

    (useAttacksListData as jest.Mock).mockReturnValue({
      items: mockItems,
      isLoading: false,
      pageIndex: 0,
      pageSize: 10,
      total: 2,
      setPageIndex: jest.fn(),
      setPageSize: jest.fn(),
      refetch: jest.fn(),
    });

    render(<AttacksListPanel dataView={mockDataView} />);

    expect(screen.getByText('2 attacks detected')).toBeInTheDocument();
    expect(screen.getByText('Attack 1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Attack 2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getAllByTestId('severity-bar')).toHaveLength(2);
  });

  it('calls openFlyout (legacy) when clicking on an attack name with flag off', () => {
    const mockItems = [{ id: 'attack-1', name: 'Attack 1', alertsCount: 5, severityCount: {} }];

    (useAttacksListData as jest.Mock).mockReturnValue({
      items: mockItems,
      isLoading: false,
      pageIndex: 0,
      pageSize: 10,
      total: 1,
      setPageIndex: jest.fn(),
      setPageSize: jest.fn(),
      refetch: jest.fn(),
    });

    render(<AttacksListPanel dataView={mockDataView} />);

    const link = screen.getByText('Attack 1');
    link.click();

    expect(mockOpenFlyout).toHaveBeenCalledWith({
      right: {
        id: AttackDetailsRightPanelKey,
        params: {
          attackId: 'attack-1',
          indexName: 'test-index-pattern',
        },
      },
    });
    expect(mockOpenSystemFlyout).not.toHaveBeenCalled();
    expect(reportEvent).toHaveBeenCalledWith(AttacksEventTypes.DetailsFlyoutOpened, {
      id: 'attack-1',
      source: 'attacks_page_summary_kpi',
    });
  });

  it('calls openSystemFlyout with AttackFlyoutWrapper when flag is on', () => {
    const mockRefetch = jest.fn();
    const mockItems = [{ id: 'attack-1', name: 'Attack 1', alertsCount: 5, severityCount: {} }];

    (useIsExperimentalFeatureEnabled as jest.Mock).mockReturnValue(true);
    (useAttacksListData as jest.Mock).mockReturnValue({
      items: mockItems,
      isLoading: false,
      pageIndex: 0,
      pageSize: 10,
      total: 1,
      setPageIndex: jest.fn(),
      setPageSize: jest.fn(),
      refetch: mockRefetch,
    });

    render(<AttacksListPanel dataView={mockDataView} />);

    const link = screen.getByText('Attack 1');
    link.click();

    expect(mockOpenSystemFlyout).toHaveBeenCalled();
    expect(mockOpenFlyout).not.toHaveBeenCalled();
    expect(reportEvent).toHaveBeenCalledWith(AttacksEventTypes.DetailsFlyoutOpened, {
      id: 'attack-1',
      source: 'attacks_page_summary_kpi',
    });
  });

  it('handles pagination changes', () => {
    const setPageIndex = jest.fn();
    const setPageSize = jest.fn();

    (useAttacksListData as jest.Mock).mockReturnValue({
      items: [],
      isLoading: false,
      pageIndex: 0,
      pageSize: 10,
      total: 20,
      setPageIndex,
      setPageSize,
      refetch: jest.fn(),
    });

    render(<AttacksListPanel dataView={mockDataView} />);

    // Find next page button and click it
    const nextPageButton = screen.getByLabelText('Next page');
    nextPageButton.click();

    expect(setPageIndex).toHaveBeenCalledWith(1);
  });
});
