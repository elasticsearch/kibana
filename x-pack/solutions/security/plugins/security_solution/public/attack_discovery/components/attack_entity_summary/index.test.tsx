/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { AttackEntitySummary, ATTACK_ENTITY_SUMMARY_TEST_ID, getSummaryPlainText } from '.';
import { AttackDiscoveryMarkdownFormatter } from '../../pages/results/attack_discovery_markdown_formatter';

jest.mock('../../pages/results/attack_discovery_markdown_formatter', () => ({
  AttackDiscoveryMarkdownFormatter: jest.fn(({ markdown }: { markdown: string }) => (
    <div data-test-subj="mock-markdown-formatter">{markdown}</div>
  )),
}));

const entitySummaryMarkdown =
  'Malware and credential theft detected on {{ host.name SRVMAC08 }} by {{ user.name james }}.';

describe('getSummaryPlainText', () => {
  it('strips field markdown syntax and keeps field values', () => {
    expect(getSummaryPlainText(entitySummaryMarkdown)).toBe(
      'Malware and credential theft detected on SRVMAC08 by james.'
    );
  });

  it('returns the original string when there is no field markdown', () => {
    expect(getSummaryPlainText('Plain summary without fields.')).toBe(
      'Plain summary without fields.'
    );
  });
});

describe('AttackEntitySummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the entity summary markdown', () => {
    render(
      <AttackEntitySummary entitySummaryMarkdown={entitySummaryMarkdown} scopeId="test-scope" />
    );

    expect(screen.getByTestId(ATTACK_ENTITY_SUMMARY_TEST_ID)).toHaveTextContent(
      entitySummaryMarkdown
    );
  });

  it('shows the plain text summary in a tooltip on hover', async () => {
    const user = userEvent.setup();

    render(
      <AttackEntitySummary entitySummaryMarkdown={entitySummaryMarkdown} scopeId="test-scope" />
    );

    await user.hover(screen.getByTestId(ATTACK_ENTITY_SUMMARY_TEST_ID));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Malware and credential theft detected on SRVMAC08 by james.'
    );
  });

  it('renders nothing when the entity summary markdown is absent', () => {
    render(<AttackEntitySummary scopeId="test-scope" />);

    expect(screen.queryByTestId(ATTACK_ENTITY_SUMMARY_TEST_ID)).not.toBeInTheDocument();
    expect(AttackDiscoveryMarkdownFormatter).not.toHaveBeenCalled();
  });

  it('renders nothing when the entity summary markdown is empty', () => {
    render(<AttackEntitySummary entitySummaryMarkdown="" scopeId="test-scope" />);

    expect(screen.queryByTestId(ATTACK_ENTITY_SUMMARY_TEST_ID)).not.toBeInTheDocument();
    expect(AttackDiscoveryMarkdownFormatter).not.toHaveBeenCalled();
  });

  it('forwards alertIds and scopeId to the markdown formatter', () => {
    const alertIds = ['alert-1', 'alert-2'];

    render(
      <AttackEntitySummary
        alertIds={alertIds}
        entitySummaryMarkdown={entitySummaryMarkdown}
        scopeId="test-scope"
      />
    );

    expect(AttackDiscoveryMarkdownFormatter).toHaveBeenCalledWith(
      expect.objectContaining({ alertIds, scopeId: 'test-scope' }),
      {}
    );
  });

  it('forwards disableActions to the markdown formatter', () => {
    render(
      <AttackEntitySummary
        disableActions={true}
        entitySummaryMarkdown={entitySummaryMarkdown}
        scopeId="test-scope"
      />
    );

    expect(AttackDiscoveryMarkdownFormatter).toHaveBeenCalledWith(
      expect.objectContaining({ disableActions: true }),
      {}
    );
  });

  it('defaults disableActions to false', () => {
    render(
      <AttackEntitySummary entitySummaryMarkdown={entitySummaryMarkdown} scopeId="test-scope" />
    );

    expect(AttackDiscoveryMarkdownFormatter).toHaveBeenCalledWith(
      expect.objectContaining({ disableActions: false }),
      {}
    );
  });
});
