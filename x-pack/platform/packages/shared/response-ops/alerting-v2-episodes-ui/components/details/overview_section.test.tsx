/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { createMockServices } from '../../hooks/test_utils';
import { AlertEpisodeOverviewSection } from './overview_section';

jest.mock('./overview_list_section', () => ({
  AlertEpisodeOverviewListSection: jest.fn(() => <div data-test-subj="overviewListSectionStub" />),
}));

jest.mock('./lifecycle_heatmap_section', () => ({
  AlertEpisodeLifecycleHeatmapSection: jest.fn(() => (
    <div data-test-subj="lifecycleHeatmapSectionStub" />
  )),
}));

jest.mock('./trend_chart_section', () => ({
  AlertEpisodeTrendChartSection: jest.fn(() => <div data-test-subj="trendChartSectionStub" />),
}));

jest.mock('./severity_heatmap_section', () => ({
  AlertEpisodeSeverityHeatmapSection: jest.fn(() => (
    <div data-test-subj="severityHeatmapSectionStub" />
  )),
}));

jest.mock('./rule_overview_panel_section', () => ({
  AlertEpisodeRuleOverviewPanelSection: jest.fn(() => (
    <div data-test-subj="ruleOverviewPanelSectionStub" />
  )),
}));

const { AlertEpisodeOverviewListSection } = jest.requireMock('./overview_list_section') as {
  AlertEpisodeOverviewListSection: jest.Mock;
};

const mockServices = createMockServices();

describe('AlertEpisodeOverviewSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stacks all four sub-sections', () => {
    render(
      <AlertEpisodeOverviewSection episodeId="ep-1" groupHash="gh-1" services={mockServices} />
    );

    expect(screen.getByTestId('overviewListSectionStub')).toBeInTheDocument();
    expect(screen.getByTestId('trendChartSectionStub')).toBeInTheDocument();
    expect(screen.getByTestId('lifecycleHeatmapSectionStub')).toBeInTheDocument();
    expect(screen.getByTestId('severityHeatmapSectionStub')).toBeInTheDocument();
    expect(screen.getByTestId('ruleOverviewPanelSectionStub')).toBeInTheDocument();
  });

  it('forwards groupHash to the overview list section', () => {
    render(
      <AlertEpisodeOverviewSection episodeId="ep-1" groupHash="gh-1" services={mockServices} />
    );

    expect(AlertEpisodeOverviewListSection).toHaveBeenCalledWith(
      expect.objectContaining({ episodeId: 'ep-1', groupHash: 'gh-1' }),
      expect.anything()
    );
  });
});
