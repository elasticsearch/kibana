/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import { TokenUsageBadge } from './token_usage_badge';

const renderWithI18n = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe('TokenUsageBadge', () => {
  it('renders the total token count', () => {
    renderWithI18n(
      <TokenUsageBadge usage={{ inputTokens: 100, outputTokens: 50, totalTokens: 150 }} />
    );

    expect(screen.getByTestId('workflowTokenUsageBadge')).toHaveTextContent('150 tokens');
  });

  it('renders nothing when no usage is provided', () => {
    const { container } = renderWithI18n(<TokenUsageBadge usage={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders compact notation for large totals', () => {
    renderWithI18n(
      <TokenUsageBadge usage={{ inputTokens: 9000, outputTokens: 3500, totalTokens: 12500 }} />
    );

    // 12500 -> "12.5K" in compact notation
    expect(screen.getByTestId('workflowTokenUsageBadge')).toHaveTextContent('12.5K tokens');
  });

  it('drops the " tokens" suffix in compact mode', () => {
    renderWithI18n(
      <TokenUsageBadge
        usage={{ inputTokens: 9000, outputTokens: 3500, totalTokens: 12500 }}
        compact
      />
    );

    const badge = screen.getByTestId('workflowTokenUsageBadge');
    expect(badge).toHaveTextContent('12.5K');
    expect(badge).not.toHaveTextContent('tokens');
  });
});
