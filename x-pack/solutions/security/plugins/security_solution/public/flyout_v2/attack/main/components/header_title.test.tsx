/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { EuiProvider } from '@elastic/eui';
import type { DataTableRecord } from '@kbn/discover-utils';
import { HeaderTitle } from './header_title';
import { HEADER_BADGE_TEST_ID, HEADER_TITLE_TEST_ID } from '../constants/test_ids';

jest.mock('../../../shared/components/flyout_title', () => ({
  FlyoutTitle: ({
    title,
    'data-test-subj': dataTestSubj,
  }: {
    title: string;
    'data-test-subj'?: string;
  }) => <div data-test-subj={dataTestSubj ?? 'flyoutTitle'}>{title}</div>,
}));

jest.mock('../../../shared/components/timestamp', () => ({
  Timestamp: ({ hit, children }: { hit: DataTableRecord; children?: React.ReactNode }) => {
    const timestamp = hit.flattened?.['@timestamp'];
    if (!timestamp) return null;
    return (
      <>
        <div data-test-subj="timestamp">{String(timestamp)}</div>
        {children}
      </>
    );
  },
}));

const buildHit = (overrides: Record<string, unknown> = {}): DataTableRecord =>
  ({
    id: 'test-id',
    raw: { _id: 'test-id', _index: '.alerts-test' },
    flattened: {
      '@timestamp': '2024-10-10T10:00:00.000Z',
      'kibana.alert.attack_discovery.title': 'Suspicious PowerShell Activity',
      ...overrides,
    },
  } as unknown as DataTableRecord);

const renderWithEui = (ui: React.ReactElement) => render(<EuiProvider>{ui}</EuiProvider>);

describe('HeaderTitle (v2)', () => {
  it('renders the attack title', () => {
    renderWithEui(<HeaderTitle hit={buildHit()} />);
    expect(screen.getByTestId(HEADER_TITLE_TEST_ID)).toHaveTextContent(
      'Suspicious PowerShell Activity'
    );
  });

  it('renders the timestamp when present', () => {
    renderWithEui(<HeaderTitle hit={buildHit()} />);
    expect(screen.getByTestId('timestamp')).toBeInTheDocument();
  });

  it('does not render the timestamp when absent', () => {
    renderWithEui(<HeaderTitle hit={buildHit({ '@timestamp': undefined })} />);
    expect(screen.queryByTestId('timestamp')).not.toBeInTheDocument();
  });

  it('renders the attack badge', () => {
    renderWithEui(<HeaderTitle hit={buildHit()} />);
    expect(screen.getByTestId(HEADER_BADGE_TEST_ID)).toHaveTextContent('Attack');
  });

  it('renders empty title when title field is absent', () => {
    renderWithEui(
      <HeaderTitle hit={buildHit({ 'kibana.alert.attack_discovery.title': undefined })} />
    );
    expect(screen.getByTestId(HEADER_TITLE_TEST_ID)).toHaveTextContent('');
  });
});
