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

const onClose = jest.fn();
const onCreateEsqlRule = jest.fn();
const onCreateWithAgent = jest.fn();
const onCreateThresholdAlert = jest.fn();

const renderFlyout = () =>
  render(
    <I18nProvider>
      <RuleCreateOptionsFlyout
        onClose={onClose}
        onCreateEsqlRule={onCreateEsqlRule}
        onCreateWithAgent={onCreateWithAgent}
        onCreateThresholdAlert={onCreateThresholdAlert}
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
    expect(screen.getByText('Create ES|QL rule')).toBeInTheDocument();
    expect(screen.getByText('Create with AI Agent')).toBeInTheDocument();
    expect(screen.getByText('Threshold Alert')).toBeInTheDocument();
    expect(screen.queryByText(/welcome to the new alerting experience/i)).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    renderFlyout();

    fireEvent.click(screen.getByTestId('ruleCreateOptionsFlyoutCloseButton'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onCreateEsqlRule when the ES|QL option is selected', () => {
    renderFlyout();

    fireEvent.click(screen.getByRole('button', { name: /create es\|ql rule/i }));

    expect(onCreateEsqlRule).toHaveBeenCalledTimes(1);
  });

  it('calls onCreateWithAgent when the AI Agent option is selected', () => {
    renderFlyout();

    fireEvent.click(screen.getByRole('button', { name: /create with ai agent/i }));

    expect(onCreateWithAgent).toHaveBeenCalledTimes(1);
  });

  it('renders the builder divider before the Threshold Alert option', () => {
    renderFlyout();

    expect(screen.getByText('or start from a builder')).toBeInTheDocument();
    expect(screen.queryByText('Start from a rule builder')).not.toBeInTheDocument();
  });

  it('calls onCreateThresholdAlert when the Threshold Alert option is selected', () => {
    renderFlyout();

    fireEvent.click(screen.getByRole('button', { name: /threshold alert/i }));

    expect(onCreateThresholdAlert).toHaveBeenCalledTimes(1);
  });

  it('hides the AI Agent option when onCreateWithAgent is not provided', () => {
    render(
      <I18nProvider>
        <RuleCreateOptionsFlyout
          onClose={onClose}
          onCreateEsqlRule={onCreateEsqlRule}
          onCreateThresholdAlert={onCreateThresholdAlert}
        />
      </I18nProvider>
    );

    expect(screen.getByText('Create ES|QL rule')).toBeInTheDocument();
    expect(screen.queryByText('Create with AI Agent')).not.toBeInTheDocument();
    expect(screen.getByText('Threshold Alert')).toBeInTheDocument();
  });
});
