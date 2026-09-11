/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { AnomalyRowActionsMenu } from './anomaly_row_actions_menu';
import type { AnomalyTableRowAction } from '../../../api/hooks/use_anomaly_table_row_actions';
import { useAnomalyTableRowActions } from '../../../api/hooks/use_anomaly_table_row_actions';
import type { TableRow } from './types';

jest.mock('../../../api/hooks/use_anomaly_table_row_actions');

const useAnomalyTableRowActionsMock = useAnomalyTableRowActions as jest.MockedFunction<
  typeof useAnomalyTableRowActions
>;

const ACTIONS_BUTTON = 'entity-anomalies-table-row-actions-button';
const ADD_TO_TIMELINE = 'entity-anomalies-table-row-action-add-to-timeline';
const VIEW_IN_DISCOVER = 'entity-anomalies-table-row-action-view-in-discover';
const VIEW_IN_SMV = 'entity-anomalies-table-row-action-view-in-single-metric-viewer';

const row: TableRow = {
  id: 'row-1',
  jobId: 'job-1',
  jobDisplayName: 'Spike in Logon Events',
  recordId: 'record-1',
  mitreTactics: ['Credential Access'],
  timestamp: 1735689600000,
  detectorIndex: 0,
  baseline: '10 events',
  anomaly: '100 events',
  anomalyScore: 76,
  description: 'Unusual logon activity',
  anomalyCount: 1,
  keyFields: ['host.name'],
};

const timeRange = { from: 'now-30d', to: 'now' };

const addToTimeline = jest.fn();
const viewInDiscover = jest.fn();
const viewInSingleMetricViewer = jest.fn();

const allActions: AnomalyTableRowAction[] = [
  { key: 'add-to-timeline', label: 'Add to timeline', icon: 'timeline', onClick: addToTimeline },
  {
    key: 'view-in-discover',
    label: 'View in Discover',
    icon: 'productDiscover',
    onClick: viewInDiscover,
  },
  {
    key: 'view-in-single-metric-viewer',
    label: 'View in Single metric viewer',
    icon: 'singleMetricViewer',
    onClick: viewInSingleMetricViewer,
  },
];

const renderMenu = () =>
  render(
    <IntlProvider locale="en">
      <AnomalyRowActionsMenu row={row} timeRange={timeRange} />
    </IntlProvider>
  );

// EuiPopover positions its panel from a MutationObserver callback, so settle on the rendered
// panel rather than returning straight after the click.
const openMenu = async () => {
  fireEvent.click(screen.getByTestId(ACTIONS_BUTTON));
  await screen.findByTestId(VIEW_IN_DISCOVER);
};

describe('AnomalyRowActionsMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAnomalyTableRowActionsMock.mockReturnValue({ actions: allActions });
  });

  it('keeps the menu closed until the actions button is clicked', () => {
    renderMenu();

    expect(screen.getByTestId(ACTIONS_BUTTON)).toBeInTheDocument();
    expect(screen.queryByTestId(ADD_TO_TIMELINE)).toBeNull();
    expect(screen.queryByTestId(VIEW_IN_DISCOVER)).toBeNull();
    expect(screen.queryByTestId(VIEW_IN_SMV)).toBeNull();
  });

  it('exposes the investigation actions when the actions button is clicked', async () => {
    renderMenu();

    await openMenu();

    expect(screen.getByTestId(ADD_TO_TIMELINE)).toBeInTheDocument();
    expect(screen.getByTestId(VIEW_IN_DISCOVER)).toBeInTheDocument();
    expect(screen.getByTestId(VIEW_IN_SMV)).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map(({ textContent }) => textContent)).toEqual([
      'Add to timeline',
      'View in Discover',
      'View in Single metric viewer',
    ]);
  });

  it('labels each investigation action', async () => {
    renderMenu();

    await openMenu();

    expect(screen.getByTestId(ADD_TO_TIMELINE)).toHaveTextContent('Add to timeline');
    expect(screen.getByTestId(VIEW_IN_DISCOVER)).toHaveTextContent('View in Discover');
    expect(screen.getByTestId(VIEW_IN_SMV)).toHaveTextContent('View in Single metric viewer');
  });

  it('renders only the actions the hook returns', async () => {
    useAnomalyTableRowActionsMock.mockReturnValue({
      actions: allActions.filter((action) => action.key === 'view-in-discover'),
    });
    renderMenu();

    await openMenu();

    expect(screen.getByTestId(VIEW_IN_DISCOVER)).toBeInTheDocument();
    expect(screen.queryByTestId(ADD_TO_TIMELINE)).toBeNull();
    expect(screen.queryByTestId(VIEW_IN_SMV)).toBeNull();
  });

  it('invokes the action handler when a menu item is clicked', async () => {
    renderMenu();

    await openMenu();
    fireEvent.click(screen.getByTestId(ADD_TO_TIMELINE));

    expect(addToTimeline).toHaveBeenCalledTimes(1);
  });

  it('gives the actions hook the row, the time range and a way to close the menu', () => {
    renderMenu();

    expect(useAnomalyTableRowActionsMock).toHaveBeenCalledWith({
      row,
      timeRange,
      closePopover: expect.any(Function),
    });
  });
});
