/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiProvider } from '@elastic/eui';
import { I18nProvider } from '@kbn/i18n-react';
import { render, screen } from '@testing-library/react';
import { ConversationRoundStepType } from '@kbn/agent-builder-common/chat/conversation';
import type { CompactionStep as CompactionStepData } from '@kbn/agent-builder-common/chat/conversation';
import { CompactionStep } from './compaction_step';

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <I18nProvider>
      <EuiProvider>{ui}</EuiProvider>
    </I18nProvider>
  );

const makeStep = (overrides: Partial<CompactionStepData> = {}): CompactionStepData => ({
  type: ConversationRoundStepType.compaction,
  summarized_round_count: 3,
  token_count_before: 900,
  token_count_after: 300,
  ...overrides,
});

describe('CompactionStep', () => {
  it('shows "Compacting context" while compaction is in progress', () => {
    renderWithProviders(<CompactionStep step={makeStep({ token_count_after: 0 })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Compacting context');
  });

  it('shows the token counts and round count once compaction is complete', () => {
    renderWithProviders(<CompactionStep step={makeStep()} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Context condensed: 900 → 300 tokens, 3 rounds'
    );
  });

  it('renders the label at the small text size', () => {
    renderWithProviders(<CompactionStep step={makeStep()} />);
    expect(screen.getByRole('status').closest('.euiText')?.className).toMatch(/euiText-s/);
  });
});
