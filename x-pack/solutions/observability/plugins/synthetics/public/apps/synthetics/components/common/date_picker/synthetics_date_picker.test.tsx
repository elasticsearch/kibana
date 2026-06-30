/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { SyntheticsDatePicker } from './synthetics_date_picker';
import { startPlugins } from '../../../utils/testing/__mocks__/synthetics_plugin_start_mock';
import { createMemoryHistory } from 'history';
import { render } from '../../../utils/testing';
import { fireEvent } from '@testing-library/react';

describe('SyntheticsDatePicker component', () => {
  jest.setTimeout(10_000);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders properly with mock data', async () => {
    const { findByText } = render(<SyntheticsDatePicker />);
    expect(await findByText('Last 24 hours')).toBeInTheDocument();
    expect(await findByText('Refresh')).toBeInTheDocument();
  });

  it('applies defaultDateRange when the URL carries no range', async () => {
    const { findByText } = render(
      <SyntheticsDatePicker defaultDateRange={{ from: 'now-12h', to: 'now' }} />
    );
    expect(await findByText('Last 12 hours')).toBeInTheDocument();
  });

  it('prefers the URL range over defaultDateRange', async () => {
    const customHistory = createMemoryHistory({
      initialEntries: ['/?dateRangeStart=now-10m&dateRangeEnd=now'],
    });

    const { findByText } = render(
      <SyntheticsDatePicker defaultDateRange={{ from: 'now-12h', to: 'now' }} />,
      { history: customHistory, core: startPlugins }
    );

    expect(await findByText('Last 10 minutes')).toBeInTheDocument();
  });

  it('should use url date range even if shared date range is present', async () => {
    const customHistory = createMemoryHistory({
      initialEntries: ['/?g=%22%22&dateRangeStart=now-10m&dateRangeEnd=now'],
    });

    jest.spyOn(customHistory, 'push');

    const { findByText } = render(<SyntheticsDatePicker />, {
      history: customHistory,
      core: startPlugins,
    });

    expect(await findByText('Last 10 minutes')).toBeInTheDocument();

    // it should update shared state

    expect(startPlugins.data.query.timefilter.timefilter.setTime).toHaveBeenCalledWith({
      from: 'now-10m',
      to: 'now',
    });
  });

  it('should handle on change', async () => {
    const customHistory = createMemoryHistory({
      initialEntries: ['/?g=%22%22&dateRangeStart=now-10m&dateRangeEnd=now'],
    });

    jest.spyOn(customHistory, 'push');

    const { findByText, getByTestId, findByTestId } = render(<SyntheticsDatePicker />, {
      history: customHistory,
      core: startPlugins,
    });

    expect(await findByText('Last 10 minutes')).toBeInTheDocument();

    fireEvent.click(getByTestId('superDatePickerToggleQuickMenuButton'));

    fireEvent.click(await findByTestId('superDatePickerCommonlyUsed_Today'));

    expect(await findByText('Today')).toBeInTheDocument();

    // it should update shared state

    expect(startPlugins.data.query.timefilter.timefilter.setTime).toHaveBeenCalledTimes(2);

    expect(startPlugins.data.query.timefilter.timefilter.setTime).toHaveBeenCalledWith({
      from: 'now-10m',
      to: 'now',
    });

    expect(startPlugins.data.query.timefilter.timefilter.setTime).toHaveBeenLastCalledWith({
      from: 'now/d',
      to: 'now',
    });
  });
});
