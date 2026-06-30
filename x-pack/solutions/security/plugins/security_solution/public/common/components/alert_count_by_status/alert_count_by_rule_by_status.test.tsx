/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { render } from '@testing-library/react';

import { TestProviders } from '../../mock';
import { AlertCountByRuleByStatus } from './alert_count_by_rule_by_status';
import { COLUMN_HEADER_COUNT, COLUMN_HEADER_RULE_NAME } from './translations';
import type {
  UseAlertCountByRuleByStatus,
  UseAlertCountByRuleByStatusProps,
} from './use_alert_count_by_rule_by_status';
import type { EntityStoreRecord } from '../../../flyout/entity_details/shared/hooks/use_entity_from_store';

type UseAlertCountByRuleByStatusReturn = ReturnType<UseAlertCountByRuleByStatus>;
const defaultUseAlertCountByRuleByStatusReturn: UseAlertCountByRuleByStatusReturn = {
  items: [],
  isLoading: false,
  updatedAt: Date.now(),
};

const mockUseAlertCountByRuleByStatus = jest.fn(
  (_props: UseAlertCountByRuleByStatusProps) => defaultUseAlertCountByRuleByStatusReturn
);
const mockUseAlertCountByRuleByStatusReturn = (
  overrides: Partial<UseAlertCountByRuleByStatusReturn>
) => {
  mockUseAlertCountByRuleByStatus.mockReturnValue({
    ...defaultUseAlertCountByRuleByStatusReturn,
    ...overrides,
  });
};

jest.mock('./use_alert_count_by_rule_by_status', () => ({
  useAlertCountByRuleByStatus: (props: UseAlertCountByRuleByStatusProps) =>
    mockUseAlertCountByRuleByStatus(props),
}));

jest.mock('@kbn/entity-store/public', () => ({
  FF_ENABLE_ENTITY_STORE_V2: 'securitySolution:entityStoreEnableV2',
  useEntityStoreEuidApi: jest.fn(() => undefined),
}));

jest.mock('../../lib/kibana/kibana_react', () => {
  const actual = jest.requireActual('../../lib/kibana/kibana_react');
  return { ...actual, useUiSetting: jest.fn(() => false) };
});

jest.mock('../../hooks/timeline/use_investigate_in_timeline', () => ({
  useInvestigateInTimeline: jest.fn(() => ({ investigateInTimeline: jest.fn() })),
}));

const entityFilter = { field: 'host.hostname', value: 'some_host_name' };

const renderComponent = (
  overrides: Partial<React.ComponentProps<typeof AlertCountByRuleByStatus>> = {}
) =>
  render(
    <TestProviders>
      <AlertCountByRuleByStatus entityFilter={entityFilter} signalIndexName={''} {...overrides} />
    </TestProviders>
  );

describe('AlertCountByRuleByStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render empty table', () => {
    const { getByText, queryByTestId } = renderComponent();

    expect(queryByTestId('alertCountByRulePanel')).toBeInTheDocument();
    expect(getByText('No alerts to display')).toBeInTheDocument();
  });

  it('should render a loading table', () => {
    mockUseAlertCountByRuleByStatusReturn({ isLoading: true });
    const { getByText, queryByTestId } = renderComponent();

    expect(getByText('Updating...')).toBeInTheDocument();
    expect(queryByTestId('alertCountByRuleTable')).toHaveClass('euiBasicTable-loading');
  });

  it('should render the table columns', () => {
    const { getAllByTestId } = renderComponent();
    const columnHeaders = getAllByTestId(/tableHeaderCell/);

    expect(columnHeaders.at(0)).toHaveTextContent(COLUMN_HEADER_RULE_NAME);
    expect(columnHeaders.at(1)).toHaveTextContent(COLUMN_HEADER_COUNT);
  });

  it('should render the table items', () => {
    mockUseAlertCountByRuleByStatusReturn({ items: mockItem });
    const { queryByTestId } = renderComponent();

    expect(queryByTestId(COLUMN_HEADER_RULE_NAME)).toHaveTextContent('Test Name');
    expect(queryByTestId(COLUMN_HEADER_COUNT)).toHaveTextContent('100');
  });

  it('should pass resolved identityFields from entityFilter to the hook', () => {
    renderComponent();

    expect(mockUseAlertCountByRuleByStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        identityFields: { 'host.hostname': 'some_host_name' },
      })
    );
  });

  it('should prefer identityFields prop over entityFilter when both are provided', () => {
    const identityFields = { 'host.id': 'host-uuid-123', 'entity.id': 'entity-abc' };
    renderComponent({ identityFields });

    expect(mockUseAlertCountByRuleByStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        identityFields,
      })
    );
  });

  it('should pass entityRecord and entityType to the hook if defined', () => {
    const entityRecord = { 'host.name': ['some_host_name'] } as unknown as EntityStoreRecord;
    renderComponent({ entityRecord, entityType: 'host' });

    expect(mockUseAlertCountByRuleByStatus).toHaveBeenCalledWith(
      expect.objectContaining({ entityRecord, entityType: 'host' })
    );
  });
});

const mockItem = [
  {
    count: 100,
    ruleName: 'Test Name',
    uuid: 'uuid',
  },
];
