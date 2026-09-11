/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import QualitySummaryCards from '.';

jest.mock('../../../../hooks/use_overview_summary_panel', () => ({
  useOverviewSummaryPanel: jest.fn(),
}));

jest.mock('../../../../hooks/use_quality_issues_docs_chart', () => ({
  useQualityIssuesDocsChart: jest.fn(),
}));

jest.mock('../../../../hooks/use_dataset_quality_details_state', () => ({
  useDatasetQualityDetailsState: jest.fn(),
}));

jest.mock('../../../../hooks/use_failure_store_modal', () => ({
  useFailureStoreModal: jest.fn(),
}));

import { useOverviewSummaryPanel } from '../../../../hooks/use_overview_summary_panel';
import { useQualityIssuesDocsChart } from '../../../../hooks/use_quality_issues_docs_chart';
import { useDatasetQualityDetailsState } from '../../../../hooks/use_dataset_quality_details_state';
import { useFailureStoreModal } from '../../../../hooks/use_failure_store_modal';

describe('QualitySummaryCards', () => {
  const mockUseOverviewSummaryPanel = useOverviewSummaryPanel as jest.Mock;
  const mockUseQualityIssuesDocsChart = useQualityIssuesDocsChart as jest.Mock;
  const mockUseDatasetQualityDetailsState = useDatasetQualityDetailsState as jest.Mock;
  const mockUseFailureStoreModal = useFailureStoreModal as jest.Mock;

  const defaultSummaryPanelData = {
    totalDocsCount: '10000',
    isSummaryPanelLoading: false,
    totalDegradedDocsCount: '100',
    totalFailedDocsCount: '50',
    degradedPercentage: 1.0,
    failedPercentage: 0.5,
    degradedQuality: 'good',
    failedQuality: 'excellent',
  };

  const defaultDocsTrendChartData = {
    handleDocsTrendChartChange: jest.fn(),
  };

  const defaultDetailsState = {
    loadingState: {
      dataStreamSettingsLoading: false,
      dataStreamDetailsLoading: false,
    },
  };

  const defaultFailureStoreModal = {
    openModal: jest.fn(),
    canUserReadFailureStore: true,
    canUserManageFailureStore: true,
    hasFailureStore: true,
    renderModal: jest.fn(() => null),
  };

  const defaultProps = {
    selectedCard: 'failed' as const,
    setSelectedCard: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseOverviewSummaryPanel.mockReturnValue(defaultSummaryPanelData);
    mockUseQualityIssuesDocsChart.mockReturnValue(defaultDocsTrendChartData);
    mockUseDatasetQualityDetailsState.mockReturnValue(defaultDetailsState);
    mockUseFailureStoreModal.mockReturnValue(defaultFailureStoreModal);
  });

  it('renders degraded docs card correctly', () => {
    // defaultProps has selectedCard: 'failed', so the degraded card renders as a button (not selected)
    // and the failed card renders as a div (selected)
    renderWithI18n(<QualitySummaryCards {...defaultProps} />);

    expect(
      screen.getByTestId('datasetQualityDetailsSummaryKpiCard-Degraded documents')
    ).toBeTruthy();
    expect(
      screen.getByTestId('datasetQualityDetailsSummaryKpiValue-Degraded documents')
    ).toHaveTextContent(defaultSummaryPanelData.totalDegradedDocsCount);
  });

  it('renders failed docs card when failure store is available and user has read permission', () => {
    // selectedCard: 'degraded' so the failed card renders as a button (not selected)
    renderWithI18n(<QualitySummaryCards {...defaultProps} selectedCard="degraded" />);

    expect(screen.getByTestId('datasetQualityDetailsSummaryKpiCard-Failed documents')).toBeTruthy();
    expect(
      screen.getByTestId('datasetQualityDetailsSummaryKpiValue-Failed documents')
    ).toHaveTextContent(defaultSummaryPanelData.totalFailedDocsCount);
  });

  it('renders no failure store card when failure store is not available', () => {
    mockUseFailureStoreModal.mockReturnValue({
      ...defaultFailureStoreModal,
      hasFailureStore: false,
      canUserReadFailureStore: false,
    });

    renderWithI18n(<QualitySummaryCards {...defaultProps} />);
    const noFailureStoreCard = screen.getByTestId(
      'datasetQualityDetailsSummaryKpiCard-noFailureStore'
    );

    expect(noFailureStoreCard).toBeTruthy();
    expect(noFailureStoreCard).toHaveTextContent('No failure store');
  });

  it('does not show enable failure store button when user cannot manage failure store', () => {
    mockUseFailureStoreModal.mockReturnValue({
      ...defaultFailureStoreModal,
      hasFailureStore: false,
      canUserReadFailureStore: true,
      canUserManageFailureStore: false,
    });

    renderWithI18n(<QualitySummaryCards {...defaultProps} />);
    const noFailureStoreCard = screen.getByTestId(
      'datasetQualityDetailsSummaryKpiCard-noFailureStore'
    );

    expect(noFailureStoreCard).toBeTruthy();
    expect(noFailureStoreCard).toHaveTextContent('No failure store');
    expect(screen.queryByTestId('datasetQualityDetailsEnableFailureStoreButton')).toBe(null);
  });

  it('calls handleDocsTrendChartChange and setSelectedCard when degraded card is clicked', () => {
    const setSelectedCard = jest.fn();
    const handleDocsTrendChartChange = jest.fn();

    mockUseQualityIssuesDocsChart.mockReturnValue({
      handleDocsTrendChartChange,
    });

    renderWithI18n(
      <QualitySummaryCards
        {...defaultProps}
        selectedCard="failed"
        setSelectedCard={setSelectedCard}
      />
    );

    const degradedCard = screen.getByTestId(
      'datasetQualityDetailsSummaryKpiCard-Degraded documents'
    );
    fireEvent.click(degradedCard);

    expect(handleDocsTrendChartChange).toHaveBeenCalledWith('degraded');
    expect(setSelectedCard).toHaveBeenCalledWith('degraded');
  });

  it('calls handleDocsTrendChartChange and setSelectedCard when failed card is clicked', () => {
    const setSelectedCard = jest.fn();
    const handleDocsTrendChartChange = jest.fn();

    mockUseQualityIssuesDocsChart.mockReturnValue({
      handleDocsTrendChartChange,
    });

    renderWithI18n(
      <QualitySummaryCards
        {...defaultProps}
        selectedCard="degraded"
        setSelectedCard={setSelectedCard}
      />
    );

    const failedCard = screen.getByTestId('datasetQualityDetailsSummaryKpiCard-Failed documents');
    fireEvent.click(failedCard);

    expect(handleDocsTrendChartChange).toHaveBeenCalledWith('failed');
    expect(setSelectedCard).toHaveBeenCalledWith('failed');
  });

  it('only applies button semantics to interactive cards', () => {
    renderWithI18n(<QualitySummaryCards {...defaultProps} selectedCard="degraded" />);

    expect(
      screen.getByTestId('datasetQualityDetailsSummaryKpiCard-Degraded documents')
    ).not.toHaveAttribute('role');
    expect(
      screen.getByTestId('datasetQualityDetailsSummaryKpiCard-Degraded documents')
    ).not.toHaveAttribute('aria-pressed');
    expect(
      screen.getByTestId('datasetQualityDetailsSummaryKpiCard-Failed documents')
    ).toHaveAttribute('role', 'button');
    expect(
      screen.getByTestId('datasetQualityDetailsSummaryKpiCard-Failed documents')
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not call handleDocsTrendChartChange or setSelectedCard when the already-selected card is clicked', () => {
    const setSelectedCard = jest.fn();
    const handleDocsTrendChartChange = jest.fn();

    mockUseQualityIssuesDocsChart.mockReturnValue({
      handleDocsTrendChartChange,
    });

    // degraded card is selected — it renders without an onClick handler, so clicks do nothing
    renderWithI18n(
      <QualitySummaryCards
        {...defaultProps}
        selectedCard="degraded"
        setSelectedCard={setSelectedCard}
      />
    );

    const selectedDegradedCard = screen.getByTestId(
      'datasetQualityDetailsSummaryKpiCard-Degraded documents'
    );
    fireEvent.click(selectedDegradedCard);

    expect(handleDocsTrendChartChange).not.toHaveBeenCalled();
    expect(setSelectedCard).not.toHaveBeenCalled();
  });

  it('shows enable failure store button when user can manage failure store but no failure store exists', () => {
    mockUseFailureStoreModal.mockReturnValue({
      ...defaultFailureStoreModal,
      hasFailureStore: false,
      canUserReadFailureStore: false,
      canUserManageFailureStore: true,
    });

    renderWithI18n(<QualitySummaryCards {...defaultProps} />);

    expect(screen.getByTestId('datasetQualityDetailsEnableFailureStoreButton')).toBeTruthy();
  });

  it('calls openModal when enable failure store button is clicked', () => {
    const openModal = jest.fn();

    mockUseFailureStoreModal.mockReturnValue({
      ...defaultFailureStoreModal,
      hasFailureStore: false,
      canUserReadFailureStore: false,
      canUserManageFailureStore: true,
      openModal,
    });

    renderWithI18n(<QualitySummaryCards {...defaultProps} />);

    const enableButton = screen.getByTestId('datasetQualityDetailsEnableFailureStoreButton');
    fireEvent.click(enableButton);

    expect(openModal).toHaveBeenCalledTimes(1);
  });

  it('renders failure store modal when renderModal is called', () => {
    const renderModal = jest.fn(() => <div data-testid="failure-store-modal">Modal</div>);

    mockUseFailureStoreModal.mockReturnValue({
      ...defaultFailureStoreModal,
      hasFailureStore: false,
      canUserReadFailureStore: true,
      canUserManageFailureStore: true,
      renderModal,
    });

    renderWithI18n(<QualitySummaryCards {...defaultProps} />);

    expect(renderModal).toHaveBeenCalled();
  });
});
