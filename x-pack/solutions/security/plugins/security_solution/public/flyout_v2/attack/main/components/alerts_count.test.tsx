/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { AlertsCount } from './alerts_count';
import { HEADER_ALERTS_BLOCK_TEST_ID } from '../constants/test_ids';

jest.mock('../../../shared/components/flyout_header_block', () => ({
  FlyoutHeaderBlock: ({
    children,
    'data-test-subj': dataTestSubj,
  }: {
    children: React.ReactNode;
    'data-test-subj'?: string;
  }) => <div data-test-subj={dataTestSubj}>{children}</div>,
}));

const buildHit = (alertIds: unknown): DataTableRecord =>
  ({
    id: 'test-id',
    raw: { _id: 'test-id' },
    flattened: {
      'kibana.alert.attack_discovery.alert_ids': alertIds,
    },
  } as unknown as DataTableRecord);

const renderWithIntl = (ui: React.ReactElement) =>
  render(<IntlProvider locale="en">{ui}</IntlProvider>);

describe('<AlertsCount /> (v2)', () => {
  it('renders the alerts count when alert_ids is an array', () => {
    renderWithIntl(<AlertsCount hit={buildHit(['alert-1', 'alert-2', 'alert-3'])} />);
    expect(screen.getByTestId(HEADER_ALERTS_BLOCK_TEST_ID)).toHaveTextContent('3');
  });

  it('renders 1 when alert_ids is a single string', () => {
    renderWithIntl(<AlertsCount hit={buildHit('alert-1')} />);
    expect(screen.getByTestId(HEADER_ALERTS_BLOCK_TEST_ID)).toHaveTextContent('1');
  });

  it('renders 0 when alert_ids is absent', () => {
    renderWithIntl(<AlertsCount hit={buildHit(undefined)} />);
    expect(screen.getByTestId(HEADER_ALERTS_BLOCK_TEST_ID)).toHaveTextContent('0');
  });
});
