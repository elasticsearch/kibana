/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { render } from '@testing-library/react';
import React from 'react';
import { TestProviders } from '../../../../common/mock';
import { AlertsByRule } from './alerts_by_rule';
import { parsedAlerts } from './mock_rule_data';

jest.mock('../../../../common/lib/kibana');

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useLocation: jest.fn().mockReturnValue({ pathname: '' }) };
});

describe('Alert by rule chart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should render the table correctly without data', () => {
    const { getByTestId } = render(
      <TestProviders>
        <AlertsByRule data={[]} isLoading={false} showCellActions={true} />
      </TestProviders>
    );
    expect(getByTestId('alerts-by-rule-table')).toBeInTheDocument();
    expect(getByTestId('alerts-by-rule-table')).toHaveTextContent('No items found');
  });

  test('should render the table correctly with data', () => {
    const { container } = render(
      <TestProviders>
        <AlertsByRule data={parsedAlerts} isLoading={false} showCellActions={true} />
      </TestProviders>
    );

    parsedAlerts.forEach((_, i) => {
      expect(container.querySelectorAll('.euiTableRow')[i].textContent).toContain(
        parsedAlerts[i].rule
      );
      expect(container.querySelectorAll('.euiTableRow')[i].textContent).toContain(
        parsedAlerts[i].value.toString()
      );
      expect(container.querySelectorAll('.euiTableRow')[i].children).toHaveLength(3);
    });
  });

  test('should render the table without the third columns (for cell actions)', () => {
    const { container } = render(
      <TestProviders>
        <AlertsByRule data={parsedAlerts} isLoading={false} showCellActions={false} />
      </TestProviders>
    );

    parsedAlerts.forEach((_, i) => {
      expect(container.querySelectorAll('.euiTableRow')[i].children).toHaveLength(2);
    });
  });
});
