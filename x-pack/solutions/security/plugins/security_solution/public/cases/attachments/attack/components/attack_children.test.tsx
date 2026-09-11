/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { AttackAttachmentMetadata } from '../../../../../common/cases/attachments/attack';
import { AttackChildren } from './attack_children';
import {
  ATTACK_ALERT_COUNT_TEST_ID,
  ATTACK_CARD_TEST_ID,
  ATTACK_SUMMARY_TEST_ID,
  ATTACK_TITLE_TEST_ID,
} from '../../../../../common/cases/attachments/attack/test_ids';
import { ATTACK_DETECTED_ON_TEST_ID } from '../../../../attack_discovery/components/attack_detected_on';
import { ATTACK_ENTITY_SUMMARY_TEST_ID } from '../../../../attack_discovery/components/attack_entity_summary';
import {
  ATTACK_CHAIN_TITLE_TEST_ID,
  DETAILS_CONTENT_TEST_ID,
  DETAILS_TITLE_TEST_ID,
  SUMMARY_CONTENT_TEST_ID,
} from '../../../../attack_discovery/components/attack_summary_sections';
import { TestProviders, kibanaMock } from '../../../../common/mock/test_providers';

const metadata: AttackAttachmentMetadata = {
  title: 'Credential harvesting on host-1',
  summaryMarkdown: 'An attacker dumped credentials from {{ host.name host-1 }}.',
  detailsMarkdown: 'The attacker used **mimikatz** on {{ host.name host-1 }}.',
  entitySummaryMarkdown: '{{ host.name host-1 }} and {{ user.name user-1 }}',
  mitreAttackTactics: ['Credential Access'],
  timestamp: '2024-05-06T12:34:56.789Z',
  riskScore: 73,
  alertCount: 4,
  entityCount: 2,
  index: '.alerts-security.attack.discovery.alerts-default',
};

/** The shape an attachment written before the narrative fields existed still has. */
const legacyMetadata: AttackAttachmentMetadata = {
  title: 'Attack without narrative metadata',
  alertCount: 1,
  index: '.adhoc.alerts-security.attack.discovery.alerts-default',
};

const renderCard = (attackMetadata: AttackAttachmentMetadata) =>
  render(
    <TestProviders>
      <AttackChildren id="attack-id-1" metadata={attackMetadata} />
    </TestProviders>
  );

describe('AttackChildren', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('with the full narrative metadata', () => {
    it('renders the title', () => {
      renderCard(metadata);

      expect(screen.getByTestId(ATTACK_TITLE_TEST_ID)).toHaveTextContent(
        'Credential harvesting on host-1'
      );
    });

    it('renders the detected on line', () => {
      renderCard(metadata);

      expect(screen.getByTestId(ATTACK_DETECTED_ON_TEST_ID)).toHaveTextContent('Detected on');
    });

    it('renders the alert count', () => {
      renderCard(metadata);

      expect(screen.getByTestId(ATTACK_ALERT_COUNT_TEST_ID)).toHaveTextContent('4 alerts');
    });

    it('renders the entity summary', () => {
      renderCard(metadata);

      expect(screen.getByTestId(ATTACK_ENTITY_SUMMARY_TEST_ID)).toHaveTextContent('host-1');
    });

    it('renders the summary markdown', () => {
      renderCard(metadata);

      expect(screen.getByTestId(SUMMARY_CONTENT_TEST_ID)).toHaveTextContent(
        'An attacker dumped credentials from host-1'
      );
    });

    it('renders the details section', () => {
      renderCard(metadata);

      expect(screen.getByTestId(DETAILS_TITLE_TEST_ID)).toHaveTextContent('Details');
      expect(screen.getByTestId(DETAILS_CONTENT_TEST_ID)).toHaveTextContent(
        'The attacker used mimikatz on host-1'
      );
    });

    it('renders the attack chain', () => {
      renderCard(metadata);

      expect(screen.getByTestId(ATTACK_CHAIN_TITLE_TEST_ID)).toBeInTheDocument();
    });

    it('scrolls the attack chain horizontally rather than widening the card', () => {
      renderCard(metadata);

      expect(screen.getByTestId(ATTACK_CARD_TEST_ID)).toHaveStyleRule('contain', 'inline-size');
      expect(screen.getByTestId('attackChain')).toHaveStyleRule('overflow-x', 'auto');
    });

    it('renders the markdown field tokens rather than their literal syntax', () => {
      renderCard(metadata);

      expect(screen.getByTestId(ATTACK_SUMMARY_TEST_ID).textContent).not.toContain('{{');
      expect(screen.getByTestId(ATTACK_CARD_TEST_ID).textContent).not.toContain('{{');
    });

    it('renders every markdown field with the actions disabled', () => {
      renderCard(metadata);

      // The interactive entity chips only render when the actions are enabled, and each one
      // fires an uncached alert search.
      expect(screen.queryAllByTestId('entityButton')).toHaveLength(0);
      expect(screen.getAllByTestId('disabledActionsBadge').length).toBeGreaterThan(0);
    });

    it('renders no risk score or entity count rows', () => {
      renderCard(metadata);

      expect(screen.queryByText('Risk score:')).not.toBeInTheDocument();
      expect(screen.queryByText('Entities:')).not.toBeInTheDocument();
    });

    it('renders no calls to action', () => {
      renderCard(metadata);

      expect(screen.queryByTestId('viewInAiAssistant')).not.toBeInTheDocument();
      expect(screen.queryByTestId('newAgentBuilderAttachment')).not.toBeInTheDocument();
      expect(screen.queryByTestId('investigateInTimelineButton')).not.toBeInTheDocument();
    });
  });

  describe('with the metadata an attachment written before this change has', () => {
    it('renders the title', () => {
      renderCard(legacyMetadata);

      expect(screen.getByTestId(ATTACK_TITLE_TEST_ID)).toHaveTextContent(
        'Attack without narrative metadata'
      );
    });

    it('renders the alert count', () => {
      renderCard(legacyMetadata);

      expect(screen.getByTestId(ATTACK_ALERT_COUNT_TEST_ID)).toHaveTextContent('1 alert');
    });

    it('skips the sections whose metadata is absent', () => {
      renderCard(legacyMetadata);

      expect(screen.queryByTestId(ATTACK_DETECTED_ON_TEST_ID)).not.toBeInTheDocument();
      expect(screen.queryByTestId(ATTACK_ENTITY_SUMMARY_TEST_ID)).not.toBeInTheDocument();
      expect(screen.queryByTestId(ATTACK_SUMMARY_TEST_ID)).not.toBeInTheDocument();
      expect(screen.queryByTestId(DETAILS_TITLE_TEST_ID)).not.toBeInTheDocument();
      expect(screen.queryByTestId(ATTACK_CHAIN_TITLE_TEST_ID)).not.toBeInTheDocument();
    });
  });

  it('issues no data-fetching request when rendering', () => {
    const xhrOpenSpy = jest.spyOn(XMLHttpRequest.prototype, 'open');

    render(
      <TestProviders startServices={kibanaMock}>
        <AttackChildren id="attack-id-1" metadata={metadata} />
      </TestProviders>
    );

    expect(screen.getByTestId(ATTACK_TITLE_TEST_ID)).toBeInTheDocument();
    expect(xhrOpenSpy).not.toHaveBeenCalled();
    expect(kibanaMock.http.fetch).not.toHaveBeenCalled();
    expect(kibanaMock.http.get).not.toHaveBeenCalled();
    expect(kibanaMock.http.post).not.toHaveBeenCalled();
    expect(kibanaMock.data.search.search).not.toHaveBeenCalled();

    xhrOpenSpy.mockRestore();
  });
});
