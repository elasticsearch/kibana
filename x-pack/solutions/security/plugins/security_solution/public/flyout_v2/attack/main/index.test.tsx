/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { AttackFlyout } from '.';

const createAttackHit = (extra: DataTableRecord['flattened'] = {}): DataTableRecord =>
  ({
    id: 'attack-1',
    raw: {},
    flattened: {
      _id: 'attack-1',
      _index: '.alerts-security.attack-discovery.alerts-default',
      '@timestamp': '2024-01-01T00:00:00.000Z',
      'kibana.alert.attack_discovery.title': 'Test attack',
      ...extra,
    },
    isAnchor: false,
  } as DataTableRecord);

describe('<AttackFlyout />', () => {
  it('renders header, body, and footer placeholders without errors', () => {
    const { getByTestId } = render(
      <AttackFlyout hit={createAttackHit()} onAttackUpdated={jest.fn()} />
    );

    expect(getByTestId('attack-flyout-header')).toBeInTheDocument();
    expect(getByTestId('attack-flyout-body')).toBeInTheDocument();
    expect(getByTestId('attack-flyout-footer')).toBeInTheDocument();
  });

  it('renders without errors given a minimal DataTableRecord hit', () => {
    const minimalHit: DataTableRecord = {
      id: 'minimal',
      raw: {},
      flattened: {},
      isAnchor: false,
    } as DataTableRecord;

    const { getByTestId } = render(<AttackFlyout hit={minimalHit} onAttackUpdated={jest.fn()} />);

    expect(getByTestId('attack-flyout-header')).toBeInTheDocument();
    expect(getByTestId('attack-flyout-body')).toBeInTheDocument();
    expect(getByTestId('attack-flyout-footer')).toBeInTheDocument();
  });
});
