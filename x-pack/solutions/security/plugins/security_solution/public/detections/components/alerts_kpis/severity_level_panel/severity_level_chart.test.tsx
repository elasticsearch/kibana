/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { render } from '@testing-library/react';
import React from 'react';
import { TestProviders } from '../../../../common/mock';
import type { SeverityLevelProps } from './severity_level_chart';
import { SeverityLevelChart } from './severity_level_chart';
import { parsedAlerts } from './mock_data';

jest.mock('../../../../common/lib/kibana');

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useLocation: jest.fn().mockReturnValue({ pathname: '' }) };
});

describe('Severity level chart', () => {
  const defaultProps: SeverityLevelProps = {
    data: [],
    isLoading: false,
    showCellActions: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the severity table correctly', () => {
    const { getByTestId } = render(
      <TestProviders>
        <SeverityLevelChart {...defaultProps} />
      </TestProviders>
    );
    expect(getByTestId('severity-level-table')).toBeInTheDocument();
    expect(getByTestId('severity-level-table')).toHaveTextContent('No items found');
  });

  it('should render the severity donut correctly', () => {
    const { getByTestId } = render(
      <TestProviders>
        <SeverityLevelChart {...defaultProps} />
      </TestProviders>
    );
    expect(getByTestId('severity-level-donut')).toBeInTheDocument();
  });

  it('should render the table correctly with data', () => {
    const { container, getByTestId } = render(
      <TestProviders>
        <SeverityLevelChart data={parsedAlerts} isLoading={false} showCellActions={true} />
      </TestProviders>
    );
    expect(getByTestId('severity-level-table')).toBeInTheDocument();
    parsedAlerts.forEach((_, i) => {
      expect(container.querySelectorAll('.euiTableRow')[i].textContent).toContain(
        parsedAlerts[i].label
      );
      expect(container.querySelectorAll('.euiTableRow')[i].textContent).toContain(
        parsedAlerts[i].value.toString()
      );
      expect(container.querySelectorAll('.euiTableRow')[i].children).toHaveLength(3);
    });
  });

  it('should render the table without the third columns (cell actions)', () => {
    const { container, getByTestId } = render(
      <TestProviders>
        <SeverityLevelChart data={parsedAlerts} isLoading={false} showCellActions={false} />
      </TestProviders>
    );
    expect(getByTestId('severity-level-table')).toBeInTheDocument();
    parsedAlerts.forEach((_, i) => {
      expect(container.querySelectorAll('.euiTableRow')[i].children).toHaveLength(2);
    });
  });
});
