/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { RuleCreateOptionsFlyout } from './rule_create_options_flyout';
import type { RuleBuilderCreateOptionItem } from '@kbn/alerting-v2-rule-form';

const onClose = jest.fn();
const onCreateEsqlRule = jest.fn();
const onCreateWithAgent = jest.fn();
const onCreateBuilderRule = jest.fn();

const thresholdBuilderOption: RuleBuilderCreateOptionItem = {
  type: 'threshold',
  title: 'Threshold rule',
  description: 'Detect when a count crosses a threshold.',
  iconType: 'visLine',
};

const renderFlyout = () =>
  render(
    <I18nProvider>
      <RuleCreateOptionsFlyout
        onClose={onClose}
        onCreateEsqlRule={onCreateEsqlRule}
        onCreateWithAgent={onCreateWithAgent}
      />
    </I18nProvider>
  );

describe('RuleCreateOptionsFlyout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the flyout with create rule options', () => {
    renderFlyout();

    expect(screen.getByTestId('ruleCreateOptionsFlyout')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Create rule' })).toBeInTheDocument();
    expect(screen.getByText('ES|QL rule')).toBeInTheDocument();
    expect(screen.getByText('With AI Agent')).toBeInTheDocument();
    expect(screen.queryByText(/welcome to the new alerting experience/i)).not.toBeInTheDocument();
  });

  it('does not render the builder divider or any builder cards when no builderOptions are provided', () => {
    renderFlyout();

    expect(screen.queryByText('or start from a builder')).not.toBeInTheDocument();
    expect(screen.queryByTestId('createThresholdRuleCard')).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    renderFlyout();

    fireEvent.click(screen.getByTestId('ruleCreateOptionsFlyoutCloseButton'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onCreateEsqlRule when the ES|QL option is selected', () => {
    renderFlyout();

    fireEvent.click(screen.getByTestId('createEsqlRuleCard'));

    expect(onCreateEsqlRule).toHaveBeenCalledTimes(1);
  });

  it('calls onCreateWithAgent when the AI Agent option is selected', () => {
    renderFlyout();

    fireEvent.click(screen.getByTestId('createWithAgentCard'));

    expect(onCreateWithAgent).toHaveBeenCalledTimes(1);
  });

  it('renders the builder divider and cards when builderOptions are provided', () => {
    render(
      <I18nProvider>
        <RuleCreateOptionsFlyout
          onClose={onClose}
          onCreateEsqlRule={onCreateEsqlRule}
          onCreateWithAgent={onCreateWithAgent}
          builderOptions={[thresholdBuilderOption]}
          onCreateBuilderRule={onCreateBuilderRule}
        />
      </I18nProvider>
    );

    expect(screen.getByText('or start from a builder')).toBeInTheDocument();
    expect(screen.queryByText('Start from a rule builder')).not.toBeInTheDocument();
    expect(screen.getByText('Threshold rule')).toBeInTheDocument();
  });

  it('calls onCreateBuilderRule with the builder type when a builder card is selected', () => {
    render(
      <I18nProvider>
        <RuleCreateOptionsFlyout
          onClose={onClose}
          onCreateEsqlRule={onCreateEsqlRule}
          onCreateWithAgent={onCreateWithAgent}
          builderOptions={[thresholdBuilderOption]}
          onCreateBuilderRule={onCreateBuilderRule}
        />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /threshold rule/i }));

    expect(onCreateBuilderRule).toHaveBeenCalledTimes(1);
    expect(onCreateBuilderRule).toHaveBeenCalledWith('threshold');
  });

  it('renders the AI Agent option disabled and does not fire onCreateWithAgent when createWithAgentDisabled is set', () => {
    render(
      <I18nProvider>
        <RuleCreateOptionsFlyout
          onClose={onClose}
          onCreateEsqlRule={onCreateEsqlRule}
          onCreateWithAgent={onCreateWithAgent}
          createWithAgentDisabled
          createWithAgentTooltipText="Missing privileges"
        />
      </I18nProvider>
    );

    const agentCard = screen.getByTestId('createWithAgentCard');
    expect(agentCard).toBeInTheDocument();
    // Kept focusable (aria-disabled) rather than natively disabled so the tooltip stays reachable.
    expect(agentCard).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByTestId('createWithAgentCard'));
    expect(onCreateWithAgent).not.toHaveBeenCalled();
  });
});
