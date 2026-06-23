/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Status } from './status';
import { TestProviders } from '../../../../common/mock';
import { HEADER_STATUS_BLOCK_TEST_ID } from '../constants/test_ids';
import type { DataTableRecord } from '@kbn/discover-utils';

jest.mock('../../../../common/hooks/use_space_id', () => ({
  useSpaceId: () => 'default',
}));

jest.mock('./status_popover_button', () => ({
  StatusPopoverButton: ({
    hit,
    disabled,
    onAttackUpdated: _onAttackUpdated,
  }: {
    hit: DataTableRecord;
    disabled: boolean;
    onAttackUpdated: () => void;
  }) => (
    <div data-test-subj="status-popover" data-disabled={String(disabled)}>
      {String(hit.flattened['kibana.alert.workflow_status'])}
    </div>
  ),
}));

jest.mock('../../../../common/components/empty_value', () => ({
  getEmptyTagValue: jest.fn(() => <div data-test-subj="empty-tag">{'-'}</div>),
}));

const buildHit = (
  overrides: Record<string, unknown> = {},
  rawOverrides: Record<string, unknown> = {}
): DataTableRecord =>
  ({
    id: 'test-id',
    raw: { _id: 'test-id', _index: '.alerts-security.alerts-default', ...rawOverrides },
    flattened: {
      _id: 'test-id',
      _index: '.alerts-security.alerts-default',
      'kibana.alert.workflow_status': 'open',
      ...overrides,
    },
  } as unknown as DataTableRecord);

describe('<Status /> (v2)', () => {
  const onAttackUpdated = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the status block container', () => {
    render(
      <TestProviders>
        <Status hit={buildHit()} onAttackUpdated={onAttackUpdated} />
      </TestProviders>
    );
    expect(screen.getByTestId(HEADER_STATUS_BLOCK_TEST_ID)).toBeInTheDocument();
  });

  test('renders empty tag when workflow_status is absent', () => {
    render(
      <TestProviders>
        <Status
          hit={buildHit({ 'kibana.alert.workflow_status': undefined })}
          onAttackUpdated={onAttackUpdated}
        />
      </TestProviders>
    );
    expect(screen.getByTestId('empty-tag')).toBeInTheDocument();
    expect(screen.queryByTestId('status-popover')).not.toBeInTheDocument();
  });

  test('renders StatusPopoverButton when workflow_status is present', () => {
    render(
      <TestProviders>
        <Status hit={buildHit()} onAttackUpdated={onAttackUpdated} />
      </TestProviders>
    );
    expect(screen.getByTestId('status-popover')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-tag')).not.toBeInTheDocument();
    expect(screen.getByTestId('status-popover')).toHaveTextContent('open');
  });

  test('passes disabled=false for a local index', () => {
    render(
      <TestProviders>
        <Status hit={buildHit()} onAttackUpdated={onAttackUpdated} />
      </TestProviders>
    );
    expect(screen.getByTestId('status-popover')).toHaveAttribute('data-disabled', 'false');
  });

  test('passes disabled=true for a remote/CCS index', () => {
    render(
      <TestProviders>
        <Status
          hit={buildHit({}, { _index: 'remote-cluster:.alerts-security.alerts-default' })}
          onAttackUpdated={onAttackUpdated}
        />
      </TestProviders>
    );
    expect(screen.getByTestId('status-popover')).toHaveAttribute('data-disabled', 'true');
  });

  test('does not crash when flattened._index is missing (reads from raw._index)', () => {
    render(
      <TestProviders>
        <Status
          hit={
            {
              id: 'test-id',
              raw: { _id: 'test-id', _index: '.alerts-security.alerts-default' },
              flattened: { 'kibana.alert.workflow_status': 'open' },
            } as unknown as DataTableRecord
          }
          onAttackUpdated={onAttackUpdated}
        />
      </TestProviders>
    );
    expect(screen.getByTestId('status-popover')).toHaveAttribute('data-disabled', 'false');
  });
});
