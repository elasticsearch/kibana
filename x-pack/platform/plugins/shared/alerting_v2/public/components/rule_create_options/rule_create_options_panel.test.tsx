/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { RuleCreateOptionsPanel } from './rule_create_options_panel';

const onCreateEsqlRule = jest.fn();
const onCreateWithAgent = jest.fn();
const onCreateThresholdAlert = jest.fn();

const renderPanel = () =>
  render(
    <I18nProvider>
      <RuleCreateOptionsPanel
        onCreateEsqlRule={onCreateEsqlRule}
        onCreateWithAgent={onCreateWithAgent}
        onCreateThresholdAlert={onCreateThresholdAlert}
      />
    </I18nProvider>
  );

describe('RuleCreateOptionsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the empty state title', () => {
    renderPanel();

    expect(
      screen.getByRole('heading', { level: 2, name: /no rules yet\. let's get started!/i })
    ).toBeInTheDocument();
  });

  it('calls onCreateEsqlRule when the "Create ES|QL rule" card is clicked', () => {
    renderPanel();

    fireEvent.click(screen.getByTestId('createEsqlRuleCard'));

    expect(onCreateEsqlRule).toHaveBeenCalledTimes(1);
  });

  it('calls onCreateWithAgent when the "Create with AI Agent" card is clicked', () => {
    renderPanel();

    fireEvent.click(screen.getByTestId('createWithAgentCard'));

    expect(onCreateWithAgent).toHaveBeenCalledTimes(1);
  });

  it('renders the rule builder divider between the second and third options', () => {
    renderPanel();

    expect(screen.getByText('or start from a builder')).toBeInTheDocument();
    expect(screen.queryByText('Start from a rule builder')).not.toBeInTheDocument();
  });

  it('renders the "Threshold Alert" card', () => {
    renderPanel();

    expect(screen.getByText('Threshold Alert')).toBeInTheDocument();
  });

  it('calls onCreateThresholdAlert when the "Threshold Alert" card is clicked', () => {
    renderPanel();

    fireEvent.click(screen.getByTestId('createThresholdAlertCard'));

    expect(onCreateThresholdAlert).toHaveBeenCalledTimes(1);
  });

  it('hides the agent card when onCreateWithAgent is not provided', () => {
    render(
      <I18nProvider>
        <RuleCreateOptionsPanel
          onCreateEsqlRule={onCreateEsqlRule}
          onCreateThresholdAlert={onCreateThresholdAlert}
        />
      </I18nProvider>
    );

    expect(screen.getByTestId('createEsqlRuleCard')).toBeInTheDocument();
    expect(screen.queryByTestId('createWithAgentCard')).not.toBeInTheDocument();
    expect(screen.getByTestId('createThresholdAlertCard')).toBeInTheDocument();
  });
});
