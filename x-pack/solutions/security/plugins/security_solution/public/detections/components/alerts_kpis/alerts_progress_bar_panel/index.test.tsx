/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { act, render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { TestProviders } from '../../../../common/mock';
import { AlertsProgressBarPanel } from '.';
import { useSummaryChartData } from '../alerts_summary_charts_panel/use_summary_chart_data';
import type { GroupBySelection } from './types';
import { useStackByFields } from '../common/hooks';

jest.mock('../common/hooks');

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useLocation: jest.fn().mockReturnValue({ pathname: '' }) };
});

jest.mock('../../../../common/components/cell_actions', () => ({
  ...jest.requireActual('../../../../common/components/cell_actions'),
  SecurityCellActions: jest.fn(() => <div data-test-subj="cell-actions-component" />),
}));

jest.mock('../alerts_summary_charts_panel/use_summary_chart_data');
const mockUseSummaryChartData = useSummaryChartData as jest.Mock;

describe('Alert by grouping', () => {
  const defaultProps = {
    signalIndexName: 'signalIndexName',
    skip: false,
    groupBySelection: 'host.name' as GroupBySelection,
    setGroupBySelection: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSummaryChartData.mockReturnValue({ items: [], isLoading: false });
    (useStackByFields as jest.Mock).mockReturnValue(jest.fn());
  });

  test('renders correctly', () => {
    const { getByTestId } = render(
      <TestProviders>
        <AlertsProgressBarPanel {...defaultProps} />
      </TestProviders>
    );
    expect(getByTestId('alerts-progress-bar-panel')).toBeInTheDocument();
  });

  test('render HeaderSection', () => {
    const { getByTestId } = render(
      <TestProviders>
        <AlertsProgressBarPanel {...defaultProps} />
      </TestProviders>
    );
    expect(getByTestId('header-section')).toBeInTheDocument();
  });

  test('renders inspect button', () => {
    const { getByTestId } = render(
      <TestProviders>
        <AlertsProgressBarPanel {...defaultProps} />
      </TestProviders>
    );
    expect(getByTestId('inspect-icon-button')).toBeInTheDocument();
  });

  describe('combo box', () => {
    const setGroupBySelection = jest.fn();

    test('renders combo box', () => {
      const { getByTestId } = render(
        <TestProviders>
          <AlertsProgressBarPanel {...defaultProps} />
        </TestProviders>
      );
      expect(getByTestId('stackByComboBox')).toBeInTheDocument();
    });

    test('combo box renders corrected options', async () => {
      const { getByTestId } = render(
        <TestProviders>
          <AlertsProgressBarPanel {...defaultProps} setGroupBySelection={setGroupBySelection} />
        </TestProviders>
      );

      const comboBox = getByTestId('comboBoxSearchInput');
      act(() => {
        if (comboBox) {
          comboBox.focus(); // display the combo box options
        }
      });

      const optionsFound = screen.getAllByTitle(
        /host\.name|user\.name|source\.ip|destination\.ip/i
      );

      screen.debug(optionsFound);

      optionsFound.forEach((optionFound) => {
        expect(optionFound).toBeInTheDocument();
      });
    });

    test('it invokes setGroupBySelection when an option is selected', async () => {
      const toBeSelected = 'user.name';
      const { getByTestId } = render(
        <TestProviders>
          <AlertsProgressBarPanel {...defaultProps} setGroupBySelection={setGroupBySelection} />
        </TestProviders>
      );
      const comboBox = getByTestId('comboBoxSearchInput');

      act(() => {
        if (comboBox) {
          comboBox.focus(); // display the combo box options
        }
      });

      const button = await screen.findByText(toBeSelected);
      act(() => {
        fireEvent.click(button);
      });

      expect(setGroupBySelection).toBeCalledWith(toBeSelected);
    });
  });
});
