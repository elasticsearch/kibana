/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { useFetchGraphData } from '@kbn/cloud-security-posture-graph/src/hooks';
import {
  GRAPH_PREVIEW,
  uiMetricService,
} from '@kbn/cloud-security-posture-common/utils/ui_metrics';
import { METRIC_TYPE } from '@kbn/analytics';
import type { DataTableRecord } from '@kbn/discover-utils';
import { TestProviders } from '../../../../common/mock';
import { GraphPreviewContainer } from './graph_preview_container';
import {
  EXPANDABLE_PANEL_CONTENT_TEST_ID,
  EXPANDABLE_PANEL_HEADER_TITLE_ICON_TEST_ID,
  EXPANDABLE_PANEL_HEADER_TITLE_LINK_TEST_ID,
  EXPANDABLE_PANEL_HEADER_TITLE_TEXT_TEST_ID,
  GRAPH_PREVIEW_TEST_ID,
} from '../../../shared/components/test_ids';
import { useGraphPreview } from '../hooks/use_graph_preview';
import { useUpsellingComponent } from '../../../../common/hooks/use_upselling';

jest.mock('../../../../common/hooks/use_upselling');
jest.mock('../hooks/use_graph_preview');
jest.mock('@kbn/cloud-security-posture-graph/src/hooks', () => ({
  useFetchGraphData: jest.fn(),
}));
jest.mock('@kbn/cloud-security-posture-common/utils/ui_metrics', () => ({
  uiMetricService: { trackUiMetric: jest.fn() },
}));
jest.mock('@kbn/cloud-security-posture-graph', () => ({
  Graph: () => <div data-test-subj="securitySolutionFlyoutGraphPreview" />,
}));
jest.mock('../../../shared/components/graph_preview', () => ({
  GraphPreview: () => <div data-test-subj="securitySolutionFlyoutGraphPreview" />,
}));

const mockUseUpsellingComponent = useUpsellingComponent as jest.Mock;
const mockUseGraphPreview = useGraphPreview as jest.Mock;
const mockUseFetchGraphData = useFetchGraphData as jest.Mock;
const uiMetricServiceMock = uiMetricService as jest.Mocked<typeof uiMetricService>;

const mockHit = {
  id: '1',
  raw: {},
  flattened: { 'event.kind': 'signal' },
  isAnchor: false,
} as DataTableRecord;

const mockOnShowGraph = jest.fn();

const renderContainer = (
  overrides: Partial<React.ComponentProps<typeof GraphPreviewContainer>> = {}
) =>
  render(
    <TestProviders>
      <GraphPreviewContainer
        hit={mockHit}
        onShowGraph={mockOnShowGraph}
        showIcon
        disableNavigation={false}
        {...overrides}
      />
    </TestProviders>
  );

const previewAvailable = {
  timestamp: new Date().toISOString(),
  eventIds: ['eventId'],
  action: ['action'],
  shouldShowGraph: true,
  hasGraphData: true,
};

describe('<GraphPreviewContainer />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUpsellingComponent.mockReturnValue(null);
    mockUseFetchGraphData.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { nodes: [{ id: '1', color: 'primary', shape: 'ellipse' }], edges: [] },
    });
  });

  it('renders the graph and a clickable header link when navigation is enabled', () => {
    mockUseGraphPreview.mockReturnValue(previewAvailable);

    const { getByTestId } = renderContainer();

    expect(getByTestId(GRAPH_PREVIEW_TEST_ID)).toBeInTheDocument();
    expect(
      getByTestId(EXPANDABLE_PANEL_HEADER_TITLE_LINK_TEST_ID(GRAPH_PREVIEW_TEST_ID))
    ).toBeInTheDocument();
    expect(
      getByTestId(EXPANDABLE_PANEL_HEADER_TITLE_ICON_TEST_ID(GRAPH_PREVIEW_TEST_ID))
    ).toBeInTheDocument();
    expect(
      getByTestId(EXPANDABLE_PANEL_CONTENT_TEST_ID(GRAPH_PREVIEW_TEST_ID))
    ).toBeInTheDocument();
  });

  it('calls onShowGraph when the header link is clicked', () => {
    mockUseGraphPreview.mockReturnValue(previewAvailable);

    const { getByTestId } = renderContainer();

    expect(getByTestId(GRAPH_PREVIEW_TEST_ID)).toBeInTheDocument();
    fireEvent.click(getByTestId(EXPANDABLE_PANEL_HEADER_TITLE_LINK_TEST_ID(GRAPH_PREVIEW_TEST_ID)));
    expect(mockOnShowGraph).toHaveBeenCalled();
  });

  it('hides the header link when disableNavigation is true', () => {
    mockUseGraphPreview.mockReturnValue(previewAvailable);

    const { getByTestId, queryByTestId } = renderContainer({
      disableNavigation: true,
    });

    expect(getByTestId(GRAPH_PREVIEW_TEST_ID)).toBeInTheDocument();
    expect(
      queryByTestId(EXPANDABLE_PANEL_HEADER_TITLE_LINK_TEST_ID(GRAPH_PREVIEW_TEST_ID))
    ).not.toBeInTheDocument();
    expect(
      getByTestId(EXPANDABLE_PANEL_HEADER_TITLE_TEXT_TEST_ID(GRAPH_PREVIEW_TEST_ID))
    ).toBeInTheDocument();
  });

  it('hides the header link when onShowGraph is not provided', () => {
    mockUseGraphPreview.mockReturnValue(previewAvailable);

    const { getByTestId, queryByTestId } = renderContainer({ onShowGraph: undefined });

    expect(getByTestId(GRAPH_PREVIEW_TEST_ID)).toBeInTheDocument();
    expect(
      queryByTestId(EXPANDABLE_PANEL_HEADER_TITLE_LINK_TEST_ID(GRAPH_PREVIEW_TEST_ID))
    ).not.toBeInTheDocument();
  });

  it('hides the header icon when showIcon is false', () => {
    mockUseGraphPreview.mockReturnValue(previewAvailable);

    const { getByTestId, queryByTestId } = renderContainer({ showIcon: false });

    expect(getByTestId(GRAPH_PREVIEW_TEST_ID)).toBeInTheDocument();
    expect(
      queryByTestId(EXPANDABLE_PANEL_HEADER_TITLE_ICON_TEST_ID(GRAPH_PREVIEW_TEST_ID))
    ).not.toBeInTheDocument();
  });

  it('tracks ui metric when shouldShowGraph is true', () => {
    mockUseGraphPreview.mockReturnValue(previewAvailable);

    const { getByTestId } = renderContainer();
    expect(getByTestId(GRAPH_PREVIEW_TEST_ID)).toBeInTheDocument();

    expect(uiMetricServiceMock.trackUiMetric).toHaveBeenCalledWith(
      METRIC_TYPE.LOADED,
      GRAPH_PREVIEW
    );
  });

  it('renders nothing when shouldShowGraph is false and no upsell is registered', () => {
    mockUseGraphPreview.mockReturnValue({ ...previewAvailable, shouldShowGraph: false });

    const { container } = renderContainer();

    expect(container).toBeEmptyDOMElement();
    expect(uiMetricServiceMock.trackUiMetric).not.toHaveBeenCalled();
  });

  it('renders the upsell when shouldShowGraph is false and an upsell component exists', () => {
    mockUseGraphPreview.mockReturnValue({ ...previewAvailable, shouldShowGraph: false });
    mockUseUpsellingComponent.mockReturnValue(() => (
      <div data-test-subj="graphVisualizationUpsell">{'Upgrade'}</div>
    ));

    const { getByTestId } = renderContainer();

    expect(getByTestId('graphVisualizationUpsell')).toBeInTheDocument();
  });

  it('passes hit to useGraphPreview', () => {
    mockUseGraphPreview.mockReturnValue({ ...previewAvailable, shouldShowGraph: false });

    renderContainer();

    expect(mockUseGraphPreview).toHaveBeenCalledWith({ hit: mockHit });
  });

  it('fetches graph data from the document event ids', async () => {
    mockUseGraphPreview.mockReturnValue(previewAvailable);

    renderContainer();

    expect(mockUseFetchGraphData).toHaveBeenCalledWith({
      req: {
        query: {
          originEventIds: [{ id: 'eventId', isAlert: true }],
          start: `${previewAvailable.timestamp}||-30m`,
          end: `${previewAvailable.timestamp}||+30m`,
        },
      },
      options: {
        enabled: true,
        refetchOnWindowFocus: false,
      },
    });
  });
});
