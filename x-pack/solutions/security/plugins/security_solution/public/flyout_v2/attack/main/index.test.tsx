/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { AttackFlyout } from '.';
import { TestProviders } from '../../../common/mock';
import { createStartServicesMock } from '../../../common/lib/kibana/kibana_react.mock';

jest.mock('./header', () => ({
  Header: ({
    onAttackUpdated,
    onShowNotes,
  }: {
    onAttackUpdated: () => void;
    onShowNotes: () => void;
  }) => (
    <button
      type="button"
      data-test-subj="mock-header"
      data-has-on-attack-updated={String(onAttackUpdated != null)}
      onClick={onShowNotes}
    />
  ),
}));

jest.mock('../../shared/tools/notes', () => ({
  NotesDetails: () => <div data-test-subj="mock-notes-details" />,
}));

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
  const startServices = createStartServicesMock();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the header, body, and footer', () => {
    const { getByTestId } = render(
      <TestProviders>
        <AttackFlyout hit={createAttackHit()} onAttackUpdated={jest.fn()} />
      </TestProviders>
    );

    expect(getByTestId('mock-header')).toBeInTheDocument();
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

    const { getByTestId } = render(
      <TestProviders>
        <AttackFlyout hit={minimalHit} onAttackUpdated={jest.fn()} />
      </TestProviders>
    );

    expect(getByTestId('mock-header')).toBeInTheDocument();
    expect(getByTestId('attack-flyout-body')).toBeInTheDocument();
    expect(getByTestId('attack-flyout-footer')).toBeInTheDocument();
  });

  it('opens notes in a system flyout when the notes action is clicked', () => {
    const openSystemFlyout = jest.fn();
    startServices.overlays = {
      ...startServices.overlays,
      openSystemFlyout,
    };

    const { getByTestId } = render(
      <TestProviders startServices={startServices}>
        <AttackFlyout hit={createAttackHit()} onAttackUpdated={jest.fn()} />
      </TestProviders>
    );

    fireEvent.click(getByTestId('mock-header'));

    expect(openSystemFlyout).toHaveBeenCalledTimes(1);
    expect(openSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownFocus: false,
        resizable: true,
        size: 'm',
      })
    );
  });

  it('passes onAttackUpdated callback to the header', () => {
    const { getByTestId } = render(
      <TestProviders>
        <AttackFlyout hit={createAttackHit()} onAttackUpdated={jest.fn()} />
      </TestProviders>
    );

    expect(getByTestId('mock-header')).toHaveAttribute('data-has-on-attack-updated', 'true');
  });
});
