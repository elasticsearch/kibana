/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { render, fireEvent } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import { Footer } from './footer';
import { FOOTER_TEST_ID, FOOTER_TAKE_ACTION_BUTTON_TEST_ID } from './constants/test_ids';

jest.mock('@kbn/es-query', () => ({
  isNonLocalIndexName: jest.fn((indexName: string) => indexName.includes('::')),
}));

const mockTakeActionItemsProps = jest.fn();

jest.mock('../../../detections/components/attacks/table/attacks_group_take_action_items', () => ({
  AttacksGroupTakeActionItems: (props: {
    attack: AttackDiscoveryAlert;
    onActionSuccess?: () => void;
    isRemoteDocument: boolean;
    telemetrySource: string;
  }) => {
    const { attack, onActionSuccess, isRemoteDocument, telemetrySource } = props;
    mockTakeActionItemsProps(props);

    return (
      <div
        data-test-subj="mockAttacksGroupTakeActionItems"
        data-attack-id={attack.id}
        data-is-remote={String(isRemoteDocument)}
        data-telemetry-source={telemetrySource}
      >
        <button type="button" data-test-subj="mockActionButton" onClick={onActionSuccess}>
          {'Action'}
        </button>
      </div>
    );
  },
}));

jest.mock(
  '../../../detections/components/attacks/table/attack_details/attack_ai_assistant_button',
  () => ({
    AttackAiAssistantButton: ({ attack }: { attack: AttackDiscoveryAlert }) => (
      <button type="button" data-test-subj="mockAiAssistantButton" data-attack-id={attack.id}>
        {'AI Assistant'}
      </button>
    ),
  })
);

const createMockHit = (overrides: Partial<DataTableRecord> = {}): DataTableRecord =>
  ({
    id: 'test-attack-id',
    raw: { _id: 'test-attack-id', _index: 'test-index' },
    flattened: {
      _id: 'test-attack-id',
      _index: 'test-index',
    },
    isAnchor: false,
    ...overrides,
  } as DataTableRecord);

const createMockAttack = (overrides: Partial<AttackDiscoveryAlert> = {}): AttackDiscoveryAlert =>
  ({
    id: 'attack-123',
    '@timestamp': '2023-01-01T00:00:00.000Z',
    ...overrides,
  } as AttackDiscoveryAlert);

describe('<Footer />', () => {
  const mockHit = createMockHit();
  const mockAttack = createMockAttack();
  const onAttackUpdated = jest.fn();

  const renderFooter = (props?: Partial<Parameters<typeof Footer>[0]>) =>
    render(
      <IntlProvider locale="en">
        <Footer attack={mockAttack} hit={mockHit} onAttackUpdated={onAttackUpdated} {...props} />
      </IntlProvider>
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the footer panel', () => {
    const { getByTestId } = renderFooter();
    expect(getByTestId(FOOTER_TEST_ID)).toBeInTheDocument();
  });

  it('renders the Take action button', () => {
    const { getByTestId } = renderFooter();
    expect(getByTestId(FOOTER_TAKE_ACTION_BUTTON_TEST_ID)).toBeInTheDocument();
  });

  it('renders the AI assistant button', () => {
    const { getByTestId } = renderFooter();
    expect(getByTestId('mockAiAssistantButton')).toBeInTheDocument();
  });

  it('passes the attack id to the AI assistant button', () => {
    const { getByTestId } = renderFooter();
    expect(getByTestId('mockAiAssistantButton')).toHaveAttribute('data-attack-id', 'attack-123');
  });

  it('opens the take action popover when the button is clicked', () => {
    const { getByTestId, queryByTestId } = renderFooter();

    expect(queryByTestId('mockAttacksGroupTakeActionItems')).not.toBeInTheDocument();

    fireEvent.click(getByTestId(FOOTER_TAKE_ACTION_BUTTON_TEST_ID));

    expect(getByTestId('mockAttacksGroupTakeActionItems')).toBeInTheDocument();
  });

  it('calls onAttackUpdated when an action is successfully taken', () => {
    const { getByTestId } = renderFooter();

    fireEvent.click(getByTestId(FOOTER_TAKE_ACTION_BUTTON_TEST_ID));
    fireEvent.click(getByTestId('mockActionButton'));

    expect(onAttackUpdated).toHaveBeenCalledTimes(1);
  });

  it('derives isRemoteDocument=false for local index names', () => {
    const localHit = createMockHit({
      raw: { _id: 'test-id', _index: 'local-index' },
      flattened: { _id: 'test-id', _index: 'local-index' },
    });
    const { getByTestId } = renderFooter({ hit: localHit });

    fireEvent.click(getByTestId(FOOTER_TAKE_ACTION_BUTTON_TEST_ID));

    expect(getByTestId('mockAttacksGroupTakeActionItems')).toHaveAttribute(
      'data-is-remote',
      'false'
    );
  });

  it('derives isRemoteDocument=true for remote (cross-cluster) index names', () => {
    const remoteHit = createMockHit({
      raw: { _id: 'test-id', _index: 'remote-cluster::remote-index' },
      flattened: { _id: 'test-id', _index: 'remote-cluster::remote-index' },
    });
    const { getByTestId } = renderFooter({ hit: remoteHit });

    fireEvent.click(getByTestId(FOOTER_TAKE_ACTION_BUTTON_TEST_ID));

    expect(getByTestId('mockAttacksGroupTakeActionItems')).toHaveAttribute(
      'data-is-remote',
      'true'
    );
  });

  it('forwards the attack unchanged so the flyout attaches the same snapshot as the table', () => {
    const attack = createMockAttack({
      index: '.alerts-security.attack.discovery.alerts-default',
      summaryMarkdown: 'Malware detected on {{ host.name SRVMAC08 }}.',
      detailsMarkdown: 'The attack began with {{ process.name unix1 }}.',
      entitySummaryMarkdown: 'Malware on {{ host.name SRVMAC08 }}.',
      mitreAttackTactics: ['Execution', 'Persistence'],
      timestamp: '2025-05-05T17:36:50.533Z',
    });
    const { getByTestId } = renderFooter({ attack });

    fireEvent.click(getByTestId(FOOTER_TAKE_ACTION_BUTTON_TEST_ID));

    expect(mockTakeActionItemsProps).toHaveBeenCalledWith(expect.objectContaining({ attack }));
  });

  it('identifies the flyout as the telemetry source for take action events', () => {
    const { getByTestId } = renderFooter();

    fireEvent.click(getByTestId(FOOTER_TAKE_ACTION_BUTTON_TEST_ID));

    expect(getByTestId('mockAttacksGroupTakeActionItems')).toHaveAttribute(
      'data-telemetry-source',
      'attacks_page_flyout_take_action'
    );
  });
});
