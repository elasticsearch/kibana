/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent } from '@testing-library/react';
import { render } from '../../../utils/testing/rtl_helpers';
import { ShowLastRunToggle } from './show_last_run_toggle';
import { useOverviewStatusState } from '../hooks/use_overview_status';
import { SHOW_LAST_RUN_STORAGE_KEY } from '../../../state/utils/get_initial_show_last_run';

jest.mock('../hooks/use_overview_status', () => ({
  useOverviewStatusState: jest.fn(),
}));

const mockUseOverviewStatusState = useOverviewStatusState as jest.Mock;

describe('ShowLastRunToggle', () => {
  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('does not render when there are no stale monitors and the toggle is off', () => {
    mockUseOverviewStatusState.mockReturnValue({ status: { stale: 0 } });
    const { queryByTestId } = render(<ShowLastRunToggle />);
    expect(queryByTestId('syntheticsShowLastRunToggle')).toBeNull();
  });

  it('renders when there are stale monitors', () => {
    mockUseOverviewStatusState.mockReturnValue({ status: { stale: 2 } });
    const { getByTestId } = render(<ShowLastRunToggle />);
    expect(getByTestId('syntheticsShowLastRunToggle')).toBeInTheDocument();
  });

  it('persists the preference to localStorage when toggled on', () => {
    mockUseOverviewStatusState.mockReturnValue({ status: { stale: 2 } });
    const { getByTestId } = render(<ShowLastRunToggle />, { useRealStore: true });

    fireEvent.click(getByTestId('syntheticsShowLastRunToggle'));

    expect(JSON.parse(localStorage.getItem(SHOW_LAST_RUN_STORAGE_KEY + 'default') ?? 'false')).toBe(
      true
    );
  });
});
