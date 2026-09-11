/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';

import { Status } from './status';
import { TestProviders } from '../../../../../../common/mock';
import { mockAttackDiscoverySchedule } from '../../../../mock/mock_attack_discovery_schedule';

jest.setTimeout(60_000);

const renderComponent = async (schedule = mockAttackDiscoverySchedule) => {
  await act(() => {
    render(<TestProviders>{<Status schedule={schedule} />}</TestProviders>);
  });
};

describe('Status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render component if schedule does not has last execution set', async () => {
    const scheduleWithFilters = { ...mockAttackDiscoverySchedule };
    scheduleWithFilters.lastExecution = undefined;
    await renderComponent(scheduleWithFilters);

    expect(screen.queryByTestId('executionStatus')).not.toBeInTheDocument();
  });

  it('should render component if schedule has last execution set', async () => {
    const scheduleWithFilters = { ...mockAttackDiscoverySchedule };
    scheduleWithFilters.lastExecution = { status: 'ok', date: '2025-04-17T11:54:13.531Z' };
    await renderComponent(scheduleWithFilters);

    expect(screen.getByTestId('executionStatus')).toBeInTheDocument();
  });

  it('should render `ok` execution status message', async () => {
    const scheduleWithFilters = { ...mockAttackDiscoverySchedule };
    scheduleWithFilters.lastExecution = { status: 'ok', date: '2025-04-17T11:54:13.531Z' };
    await renderComponent(scheduleWithFilters);

    expect(screen.getByTestId('executionStatus')).toHaveTextContent(
      'SuccessatApr 17, 2025 @ 11:54:13.531'
    );
  });

  it('should render `active` execution status message', async () => {
    const scheduleWithFilters = { ...mockAttackDiscoverySchedule };
    scheduleWithFilters.lastExecution = { status: 'active', date: '2025-04-17T11:54:13.531Z' };
    await renderComponent(scheduleWithFilters);

    expect(screen.getByTestId('executionStatus')).toHaveTextContent(
      'SuccessatApr 17, 2025 @ 11:54:13.531'
    );
  });

  it('should render `error` execution status message', async () => {
    const scheduleWithFilters = { ...mockAttackDiscoverySchedule };
    scheduleWithFilters.lastExecution = {
      status: 'error',
      date: '2025-04-17T11:54:13.531Z',
      message: 'Test error!',
    };
    await renderComponent(scheduleWithFilters);

    expect(screen.getByTestId('executionStatus')).toHaveTextContent(
      'FailedatApr 17, 2025 @ 11:54:13.531'
    );
  });

  it('should render `warning` execution status message', async () => {
    const scheduleWithFilters = { ...mockAttackDiscoverySchedule };
    scheduleWithFilters.lastExecution = {
      status: 'warning',
      date: '2025-04-17T11:54:13.531Z',
      message: 'Test warning!',
    };
    await renderComponent(scheduleWithFilters);

    expect(screen.getByTestId('executionStatus')).toHaveTextContent(
      'WarningatApr 17, 2025 @ 11:54:13.531'
    );
  });

  it('should render `unknown` execution status message', async () => {
    const scheduleWithFilters = { ...mockAttackDiscoverySchedule };
    scheduleWithFilters.lastExecution = { status: 'unknown', date: '2025-04-17T11:54:13.531Z' };
    await renderComponent(scheduleWithFilters);

    expect(screen.getByTestId('executionStatus')).toHaveTextContent(
      'UnknownatApr 17, 2025 @ 11:54:13.531'
    );
  });
});
