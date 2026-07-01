/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TableId } from '@kbn/securitysolution-data-table';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { DocumentDetailsContext } from '../../shared/context';
import { TestProviders } from '../../../../common/mock';
import {
  AnalyzeGraph,
  DATA_VIEW_ERROR_TEST_ID,
  DATA_VIEW_LOADING_TEST_ID,
  resetAnalyzerColdFrozenTierCalloutDismissedStateForTests,
} from './analyze_graph';
import {
  ANALYZER_COLD_FROZEN_TIER_CALLOUT_DISMISS_BUTTON_TEST_ID,
  ANALYZER_COLD_FROZEN_TIER_CALLOUT_TEST_ID,
  ANALYZER_GRAPH_TEST_ID,
} from './test_ids';
import { useWhichFlyout } from '../../shared/hooks/use_which_flyout';
import { mockFlyoutApi } from '../../shared/mocks/mock_flyout_context';
import { DocumentDetailsAnalyzerPanelKey } from '../../shared/constants/panel_keys';
import { useIsAnalyzerEnabled } from '../../../../detections/hooks/use_is_analyzer_enabled';
import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';
import { useSelectedPatterns } from '../../../../data_view_manager/hooks/use_selected_patterns';
import { useDataView } from '../../../../data_view_manager/hooks/use_data_view';
import type { DataView } from '@kbn/data-views-plugin/common';
import { createStubDataView } from '@kbn/data-views-plugin/common/data_views/data_view.stub';
import { ANALYZER_PREVIEW_BANNER } from '../../../../resolver/view/resolver_without_providers';

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useLocation: jest.fn().mockReturnValue({ pathname: '' }) };
});
jest.mock('@kbn/expandable-flyout');
jest.mock('../../../../resolver/view/use_resolver_query_params_cleaner');
jest.mock('../../shared/hooks/use_which_flyout');
jest.mock('../../../../detections/hooks/use_is_analyzer_enabled');
jest.mock('../../../../common/hooks/use_experimental_features');
jest.mock('../../../../data_view_manager/hooks/use_selected_patterns');

const mockUiSettingsGet = jest.fn();
let mockServerless: unknown;
jest.mock('../../../../common/lib/kibana', () => {
  const actual = jest.requireActual('../../../../common/lib/kibana');
  return {
    ...actual,
    useKibana: () => ({
      services: {
        uiSettings: {
          get: mockUiSettingsGet,
        },
        serverless: mockServerless,
      },
    }),
  };
});

const mockUseWhichFlyout = useWhichFlyout as jest.Mock;
const FLYOUT_KEY = 'securitySolution';
const mockExperimentalFeatureFlags = (flags: Record<string, boolean>) => {
  (useIsExperimentalFeatureEnabled as jest.Mock).mockImplementation(
    (flag: string) => flags[flag] ?? false
  );
};

const mockDispatch = jest.fn();
jest.mock('react-redux', () => {
  const original = jest.requireActual('react-redux');

  return {
    ...original,
    useDispatch: () => mockDispatch,
  };
});

const NO_ANALYZER_MESSAGE =
  'You can only visualize events triggered by hosts configured with the Elastic Defend integration or any sysmon data from winlogbeat. Refer to Visual event analyzer(external, opens in a new tab or window) for more information.';

const dataView: DataView = createStubDataView({
  spec: { title: '.alerts-security.alerts-default' },
});

const searchHit = {
  _id: 'eventId',
  _index: 'index',
  _source: {},
} as unknown as DocumentDetailsContext['searchHit'];

const renderAnalyzer = (
  contextValue = {
    eventId: 'eventId',
    scopeId: TableId.test,
    searchHit,
  } as unknown as DocumentDetailsContext
) =>
  render(
    <TestProviders>
      <DocumentDetailsContext.Provider value={contextValue}>
        <AnalyzeGraph />
      </DocumentDetailsContext.Provider>
    </TestProviders>
  );

describe('<AnalyzeGraph />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAnalyzerColdFrozenTierCalloutDismissedStateForTests();
    mockServerless = undefined;
    mockUiSettingsGet.mockReturnValue(true);
    mockUseWhichFlyout.mockReturnValue(FLYOUT_KEY);
    jest.mocked(useExpandableFlyoutApi).mockReturnValue(mockFlyoutApi);
    mockExperimentalFeatureFlags({});
    (useSelectedPatterns as jest.Mock).mockReturnValue(['index']);
    (useIsAnalyzerEnabled as jest.Mock).mockReturnValue(true);
    (useDataView as jest.Mock).mockReturnValue({
      status: 'ready',
      dataView: {
        ...dataView,
        hasMatchedIndices: jest.fn().mockReturnValue(true),
      },
    });
  });

  it('renders analyzer graph correctly', () => {
    const wrapper = renderAnalyzer();

    expect(wrapper.getByTestId(ANALYZER_GRAPH_TEST_ID)).toBeInTheDocument();
  });

  it('should render excluded cold/frozen tiers callout when setting is enabled', () => {
    const { getByTestId } = renderAnalyzer();

    expect(getByTestId(ANALYZER_COLD_FROZEN_TIER_CALLOUT_TEST_ID)).toHaveTextContent(
      'Some data excluded'
    );
    expect(getByTestId(ANALYZER_COLD_FROZEN_TIER_CALLOUT_TEST_ID)).toHaveTextContent(
      'Cold and frozen tiers are excluded to improve performance.'
    );
  });

  it('should render included cold/frozen tiers callout when setting is disabled', () => {
    mockUiSettingsGet.mockReturnValue(false);

    const { getByTestId } = renderAnalyzer();

    expect(getByTestId(ANALYZER_COLD_FROZEN_TIER_CALLOUT_TEST_ID)).toHaveTextContent(
      'Performance optimization'
    );
    expect(getByTestId(ANALYZER_COLD_FROZEN_TIER_CALLOUT_TEST_ID)).toHaveTextContent(
      'This view loads more slowly because cold and frozen tiers are included.'
    );
  });

  it('should hide cold/frozen tiers callout in serverless', () => {
    mockServerless = {};

    const { queryByTestId } = renderAnalyzer();

    expect(queryByTestId(ANALYZER_COLD_FROZEN_TIER_CALLOUT_TEST_ID)).not.toBeInTheDocument();
  });

  it('should keep callout hidden in same tab session after dismissing and opening another alert flyout', () => {
    const { getByTestId, queryByTestId, unmount } = renderAnalyzer();

    fireEvent.click(getByTestId(ANALYZER_COLD_FROZEN_TIER_CALLOUT_DISMISS_BUTTON_TEST_ID));
    expect(queryByTestId(ANALYZER_COLD_FROZEN_TIER_CALLOUT_TEST_ID)).not.toBeInTheDocument();

    unmount();

    const { queryByTestId: queryByTestIdAfterOpeningAnotherFlyout } = renderAnalyzer({
      eventId: 'eventId-2',
      scopeId: TableId.test,
      searchHit: {
        ...searchHit,
        _id: 'eventId-2',
      } as unknown as DocumentDetailsContext['searchHit'],
    } as unknown as DocumentDetailsContext);

    expect(
      queryByTestIdAfterOpeningAnotherFlyout(ANALYZER_COLD_FROZEN_TIER_CALLOUT_TEST_ID)
    ).not.toBeInTheDocument();
  });

  it('should show callout again after page refresh', () => {
    const { getByTestId, queryByTestId } = renderAnalyzer();

    fireEvent.click(getByTestId(ANALYZER_COLD_FROZEN_TIER_CALLOUT_DISMISS_BUTTON_TEST_ID));
    expect(queryByTestId(ANALYZER_COLD_FROZEN_TIER_CALLOUT_TEST_ID)).not.toBeInTheDocument();

    resetAnalyzerColdFrozenTierCalloutDismissedStateForTests();
    const { getByTestId: getByTestIdAfterRefresh } = renderAnalyzer();

    expect(getByTestIdAfterRefresh(ANALYZER_COLD_FROZEN_TIER_CALLOUT_TEST_ID)).toBeInTheDocument();
  });

  it('should render no data message when analyzer is not enabled', () => {
    (useIsAnalyzerEnabled as jest.Mock).mockReturnValue(false);

    const contextValue = {
      eventId: 'eventId',
      scopeId: TableId.test,
      searchHit,
    } as unknown as DocumentDetailsContext;

    const { container } = renderAnalyzer(contextValue);

    expect(container).toHaveTextContent(NO_ANALYZER_MESSAGE);
  });

  it('should show loading spinner while data view is loading', () => {
    (useDataView as jest.Mock).mockReturnValue({
      status: 'loading',
    });

    const { getByTestId } = renderAnalyzer();

    expect(getByTestId(DATA_VIEW_LOADING_TEST_ID)).toBeInTheDocument();
  });

  it('should show loading spinner while data view is pristine', () => {
    (useDataView as jest.Mock).mockReturnValue({
      status: 'pristine',
    });

    const { getByTestId } = renderAnalyzer();

    expect(getByTestId(DATA_VIEW_LOADING_TEST_ID)).toBeInTheDocument();
  });

  it('should show error message if data view is error', () => {
    (useDataView as jest.Mock).mockReturnValue({
      status: 'error',
    });

    const { getByTestId } = renderAnalyzer();

    expect(getByTestId(DATA_VIEW_ERROR_TEST_ID)).toHaveTextContent(
      'Unable to retrieve the data view for analyzer'
    );
  });

  it('should show error message if data view is ready but no matched indices', () => {
    (useDataView as jest.Mock).mockReturnValue({
      status: 'ready',
      dataView: {
        ...dataView,
        hasMatchedIndices: jest.fn().mockReturnValue(false),
      },
    });

    const { getByTestId } = renderAnalyzer();

    expect(getByTestId(DATA_VIEW_ERROR_TEST_ID)).toHaveTextContent(
      'Unable to retrieve the data view for analyzer'
    );
  });

  it('should open details panel in preview when clicking on view button', () => {
    const wrapper = renderAnalyzer();

    expect(wrapper.getByTestId('resolver:graph-controls:show-panel-button')).toBeInTheDocument();
    wrapper.getByTestId('resolver:graph-controls:show-panel-button').click();
    expect(mockFlyoutApi.openPreviewPanel).toBeCalledWith({
      id: DocumentDetailsAnalyzerPanelKey,
      params: {
        resolverComponentInstanceID: `${FLYOUT_KEY}-${TableId.test}`,
        banner: ANALYZER_PREVIEW_BANNER,
      },
    });
  });
});
