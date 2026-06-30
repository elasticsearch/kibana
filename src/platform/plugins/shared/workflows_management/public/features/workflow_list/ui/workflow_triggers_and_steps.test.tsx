/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ExecutionStatus } from '@kbn/workflows';
import { WorkflowTriggersAndSteps } from './workflow_triggers_and_steps';
import { getWorkflowNextExecutionTime } from '../../../lib/next_execution_time';
import { TestProvider } from '../../../shared/mocks/test_providers';
import { useGetFormattedDateTime } from '../../../shared/ui/use_formatted_date';

jest.mock('../../../lib/next_execution_time');
jest.mock('../../../shared/ui/use_formatted_date');

describe('WorkflowTriggersAndSteps', () => {
  const mockGetWorkflowNextExecutionTime = jest.fn();
  const mockGetFormattedDateTime = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getWorkflowNextExecutionTime as jest.Mock).mockImplementation(
      mockGetWorkflowNextExecutionTime
    );
    (useGetFormattedDateTime as jest.Mock).mockReturnValue(mockGetFormattedDateTime);

    global.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      disconnect: jest.fn(),
      unobserve: jest.fn(),
    }));
  });

  it('should render scheduled label tooltip when next execution cannot be computed', () => {
    mockGetWorkflowNextExecutionTime.mockReturnValue(null);

    render(
      <WorkflowTriggersAndSteps
        triggers={[{ type: 'scheduled', with: { every: '5m' } }]}
        steps={[]}
        history={[]}
      />,
      { wrapper: TestProvider }
    );

    expect(document.querySelector('[title="Scheduled"]')).toBeInTheDocument();
    expect(mockGetWorkflowNextExecutionTime).toHaveBeenCalledWith(
      [{ type: 'scheduled', with: { every: '5m' } }],
      []
    );
  });

  it('should render scheduled label and next execution in tooltip when data is available', async () => {
    const user = userEvent.setup();
    const nextExecutionTime = new Date('2025-01-15T11:00:00Z');
    mockGetWorkflowNextExecutionTime.mockReturnValue(nextExecutionTime);
    mockGetFormattedDateTime.mockReturnValue('Jan 15, 2025 11:00 AM');

    const { container } = render(
      <WorkflowTriggersAndSteps
        triggers={[{ type: 'scheduled', with: { every: '5m' } }]}
        steps={[]}
        history={[
          {
            id: 'run-1',
            status: ExecutionStatus.COMPLETED,
            startedAt: '2025-01-15T10:00:00Z',
            finishedAt: '2025-01-15T10:05:00Z',
            duration: 30000,
          },
        ]}
      />,
      { wrapper: TestProvider }
    );

    expect(mockGetFormattedDateTime).toHaveBeenCalledWith(nextExecutionTime);

    const anchor = container.querySelector('.euiToolTipAnchor');
    expect(anchor).toBeInTheDocument();
    await user.hover(anchor!);

    expect(await screen.findByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Next execution: Jan 15, 2025 11:00 AM')).toBeInTheDocument();
  });
});
