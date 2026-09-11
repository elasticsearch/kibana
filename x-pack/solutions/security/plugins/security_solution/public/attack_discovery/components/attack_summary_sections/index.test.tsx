/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';

import {
  AttackSummarySections,
  ATTACK_CHAIN_TITLE_TEST_ID,
  DETAILS_CONTENT_TEST_ID,
  DETAILS_TITLE_TEST_ID,
  SUMMARY_CONTENT_TEST_ID,
} from '.';
import { TestProviders } from '../../../common/mock/test_providers';
import { getTacticMetadata } from '../../helpers';
import { AttackChain } from '../../pages/results/attack_discovery_panel/tabs/attack_discovery_tab/attack/attack_chain';
import { AttackDiscoveryMarkdownFormatter } from '../../pages/results/attack_discovery_markdown_formatter';

jest.mock('../../helpers', () => ({
  ...jest.requireActual('../../helpers'),
  getTacticMetadata: jest.fn(() => []),
}));

jest.mock(
  '../../pages/results/attack_discovery_panel/tabs/attack_discovery_tab/attack/attack_chain',
  () => ({
    AttackChain: jest.fn(() => <div data-test-subj="mock-attack-chain">{'AttackChain'}</div>),
  })
);

jest.mock('../../pages/results/attack_discovery_markdown_formatter', () => ({
  AttackDiscoveryMarkdownFormatter: jest.fn(({ markdown }) => (
    <div data-test-subj="mock-markdown-formatter">{markdown}</div>
  )),
}));

describe('AttackSummarySections', () => {
  const defaultProps = {
    scopeId: 'test-scope',
    summaryMarkdown: 'Summary markdown',
  };

  const renderSections = (props = {}) =>
    render(
      <TestProviders>
        <AttackSummarySections {...defaultProps} {...props} />
      </TestProviders>
    );

  beforeEach(() => {
    jest.clearAllMocks();
    (getTacticMetadata as jest.Mock).mockReturnValue([]);
  });

  it('renders the summary markdown', () => {
    renderSections();

    expect(screen.getByTestId(SUMMARY_CONTENT_TEST_ID)).toHaveTextContent('Summary markdown');
  });

  it('renders the wrapping data-test-subj when dataTestSubj is provided', () => {
    renderSections({ dataTestSubj: 'attackSummarySections' });

    expect(screen.getByTestId('attackSummarySections')).toBeInTheDocument();
  });

  it('renders the details section when detailsMarkdown is provided', () => {
    renderSections({ detailsMarkdown: 'Details markdown' });

    expect(screen.getByTestId(DETAILS_TITLE_TEST_ID)).toHaveTextContent('Details');
    expect(screen.getByTestId(DETAILS_CONTENT_TEST_ID)).toHaveTextContent('Details markdown');
  });

  it('does not render the details section when detailsMarkdown is absent', () => {
    renderSections();

    expect(screen.queryByTestId(DETAILS_TITLE_TEST_ID)).not.toBeInTheDocument();
    expect(screen.queryByTestId(DETAILS_CONTENT_TEST_ID)).not.toBeInTheDocument();
  });

  it('does not render the details section when detailsMarkdown is empty', () => {
    renderSections({ detailsMarkdown: '' });

    expect(screen.queryByTestId(DETAILS_TITLE_TEST_ID)).not.toBeInTheDocument();
    expect(screen.queryByTestId(DETAILS_CONTENT_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders the attack chain when getTacticMetadata returns tactics', () => {
    (getTacticMetadata as jest.Mock).mockReturnValue([{ name: 'Initial Access', detected: true }]);
    const mitreAttackTactics = ['Initial Access'];

    renderSections({ mitreAttackTactics });

    expect(screen.getByTestId(ATTACK_CHAIN_TITLE_TEST_ID)).toHaveTextContent('Attack Chain');
    expect(AttackChain).toHaveBeenCalledWith(
      expect.objectContaining({ attackTactics: mitreAttackTactics }),
      {}
    );
  });

  it('does not render the attack chain when getTacticMetadata returns an empty array', () => {
    (getTacticMetadata as jest.Mock).mockReturnValue([]);

    renderSections({ mitreAttackTactics: ['Initial Access'] });

    expect(screen.queryByTestId(ATTACK_CHAIN_TITLE_TEST_ID)).not.toBeInTheDocument();
    expect(AttackChain).not.toHaveBeenCalled();
  });

  it('forwards disableActions to every markdown formatter', () => {
    renderSections({ detailsMarkdown: 'Details markdown', disableActions: true });

    expect(AttackDiscoveryMarkdownFormatter).toHaveBeenCalledTimes(2);
    expect(AttackDiscoveryMarkdownFormatter).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ disableActions: true, markdown: 'Summary markdown' }),
      {}
    );
    expect(AttackDiscoveryMarkdownFormatter).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ disableActions: true, markdown: 'Details markdown' }),
      {}
    );
  });

  it('defaults disableActions to false', () => {
    renderSections();

    expect(AttackDiscoveryMarkdownFormatter).toHaveBeenCalledWith(
      expect.objectContaining({ disableActions: false }),
      {}
    );
  });

  it('forwards alertIds and scopeId to every markdown formatter', () => {
    const alertIds = ['alert-1', 'alert-2'];

    renderSections({ alertIds, detailsMarkdown: 'Details markdown' });

    expect(AttackDiscoveryMarkdownFormatter).toHaveBeenCalledTimes(2);
    expect(AttackDiscoveryMarkdownFormatter).toHaveBeenCalledWith(
      expect.objectContaining({ alertIds, scopeId: 'test-scope' }),
      {}
    );
  });
});
