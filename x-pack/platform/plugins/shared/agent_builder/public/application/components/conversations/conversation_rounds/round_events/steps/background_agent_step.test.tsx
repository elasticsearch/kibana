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
import { ExecutionStatus } from '@kbn/agent-builder-common';
import { ConversationRoundStepType } from '@kbn/agent-builder-common/chat/conversation';
import type { BackgroundAgentCompleteStep } from '@kbn/agent-builder-common/chat/conversation';
import { BackgroundAgentStep } from './background_agent_step';

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <I18nProvider>
      <EuiProvider>{ui}</EuiProvider>
    </I18nProvider>
  );

const makeStep = (status: ExecutionStatus): BackgroundAgentCompleteStep => ({
  type: ConversationRoundStepType.backgroundAgentComplete,
  execution_id: 'exec-1',
  status,
});

describe('BackgroundAgentStep', () => {
  it('shows "Background agent completed" for a completed execution', () => {
    renderWithProviders(<BackgroundAgentStep step={makeStep(ExecutionStatus.completed)} />);
    expect(screen.getByRole('status')).toHaveTextContent('Background agent completed');
    expect(screen.getByRole('status').querySelector('.euiBadge')).toBeNull();
  });

  it('shows the status badge for a failed execution', () => {
    renderWithProviders(<BackgroundAgentStep step={makeStep(ExecutionStatus.failed)} />);
    const badge = screen.getByRole('status').querySelector('.euiBadge');
    expect(badge).not.toBeNull();
    expect(badge?.className).toContain('danger');
  });

  it('renders the label at the small text size', () => {
    renderWithProviders(<BackgroundAgentStep step={makeStep(ExecutionStatus.completed)} />);
    expect(screen.getByRole('status').closest('.euiText')?.className).toMatch(/euiText-s/);
  });
});
