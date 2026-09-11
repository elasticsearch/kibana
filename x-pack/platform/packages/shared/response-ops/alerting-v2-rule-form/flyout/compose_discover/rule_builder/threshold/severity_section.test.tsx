/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { SeveritySection } from './severity_section';
import { Comparator, type AlertCondition, type SeverityConfig } from './form_types';

const condition = (overrides: Partial<AlertCondition> = {}): AlertCondition => ({
  id: 'c1',
  metric: 'cpu_avg',
  comparator: Comparator.GT,
  threshold: [0.8],
  ...overrides,
});

const renderSection = (props: { severity?: SeverityConfig; alertConditions: AlertCondition[] }) => {
  const onChange = jest.fn<void, [SeverityConfig | undefined]>();
  render(
    <IntlProvider locale="en">
      <SeveritySection
        severity={props.severity}
        alertConditions={props.alertConditions}
        onChange={onChange}
      />
    </IntlProvider>
  );
  return { onChange };
};

describe('SeveritySection', () => {
  it('disables severity with a callout when multiple conditions are configured', () => {
    renderSection({ alertConditions: [condition(), condition({ id: 'c2' })] });
    expect(screen.getByTestId('ruleBuilderSeverityDisabledCallout')).toBeInTheDocument();
    expect(screen.queryByTestId('ruleBuilderSeverityEnable')).not.toBeInTheDocument();
  });

  it('enables a default single severity when the switch is turned on', () => {
    const { onChange } = renderSection({ alertConditions: [condition()] });
    fireEvent.click(screen.getByTestId('ruleBuilderSeverityEnable'));
    expect(onChange).toHaveBeenCalledWith({
      mode: 'single',
      singleLevelSeverity: 'high',
      levels: [],
    });
  });

  it('clears severity when the switch is turned off', () => {
    const { onChange } = renderSection({
      alertConditions: [condition()],
      severity: { mode: 'single', singleLevelSeverity: 'high', levels: [] },
    });
    fireEvent.click(screen.getByTestId('ruleBuilderSeverityEnable'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('updates the level in single mode', () => {
    const { onChange } = renderSection({
      alertConditions: [condition()],
      severity: { mode: 'single', singleLevelSeverity: 'high', levels: [] },
    });
    fireEvent.change(screen.getByTestId('ruleBuilderSeveritySingleLevel'), {
      target: { value: 'critical' },
    });
    expect(onChange).toHaveBeenCalledWith({
      mode: 'single',
      singleLevelSeverity: 'critical',
      levels: [],
    });
  });

  it('seeds levels when switching to multi mode', () => {
    const { onChange } = renderSection({
      alertConditions: [condition()],
      severity: { mode: 'single', singleLevelSeverity: 'high', levels: [] },
    });
    fireEvent.click(screen.getByTestId('ruleBuilderSeverityMode-multi'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as SeverityConfig;
    expect(next.mode).toBe('multi');
    expect(next.levels).toHaveLength(2);
    expect(next.levels.map((l) => l.severity)).toEqual(['low', 'medium']);
    expect(next.levels.every((l) => l.threshold === 0.8)).toBe(true);
  });

  it('disables multi mode and explains why for range comparators', () => {
    renderSection({
      alertConditions: [condition({ comparator: Comparator.BETWEEN, threshold: [0.8, 0.9] })],
      severity: { mode: 'single', singleLevelSeverity: 'high', levels: [] },
    });
    expect(screen.getByTestId('ruleBuilderSeverityMode-multi')).toBeDisabled();
    expect(screen.getByText(/Multiple severity levels are not available/i)).toBeInTheDocument();
  });

  it('shows the inherited operator and threshold per level in multi mode', () => {
    renderSection({
      alertConditions: [condition()],
      severity: {
        mode: 'multi',
        singleLevelSeverity: 'high',
        levels: [
          { id: 'l1', severity: 'low', threshold: 0.8 },
          { id: 'l2', severity: 'high', threshold: 0.95 },
        ],
      },
    });
    expect(screen.getByTestId('ruleBuilderSeverityOperator-0')).toHaveValue('>');
    expect(screen.getByTestId('ruleBuilderSeverityThreshold-1')).toHaveValue(0.95);
  });

  it('adds a severity level in multi mode', () => {
    const { onChange } = renderSection({
      alertConditions: [condition()],
      severity: {
        mode: 'multi',
        singleLevelSeverity: 'high',
        levels: [{ id: 'l1', severity: 'low', threshold: 0.8 }],
      },
    });
    fireEvent.click(screen.getByTestId('ruleBuilderAddSeverityLevel'));
    const next = onChange.mock.calls[0][0] as SeverityConfig;
    expect(next.levels).toHaveLength(2);
    // Defaults to the next level in the hierarchy
    expect(next.levels[1].severity).toBe('medium');
  });

  it('disables adding levels once every severity is in use', () => {
    renderSection({
      alertConditions: [condition()],
      severity: {
        mode: 'multi',
        singleLevelSeverity: 'high',
        levels: [
          { id: 'l1', severity: 'info', threshold: 0.5 },
          { id: 'l2', severity: 'low', threshold: 0.6 },
          { id: 'l3', severity: 'medium', threshold: 0.7 },
          { id: 'l4', severity: 'high', threshold: 0.8 },
          { id: 'l5', severity: 'critical', threshold: 0.9 },
        ],
      },
    });
    expect(screen.getByTestId('ruleBuilderAddSeverityLevel')).toBeDisabled();
  });

  it('removes a severity level in multi mode', () => {
    const { onChange } = renderSection({
      alertConditions: [condition()],
      severity: {
        mode: 'multi',
        singleLevelSeverity: 'high',
        levels: [
          { id: 'l1', severity: 'low', threshold: 0.8 },
          { id: 'l2', severity: 'high', threshold: 0.95 },
        ],
      },
    });
    fireEvent.click(screen.getByTestId('ruleBuilderRemoveSeverityLevel-1'));
    const next = onChange.mock.calls[0][0] as SeverityConfig;
    expect(next.levels).toHaveLength(1);
    expect(next.levels[0].severity).toBe('low');
  });

  it('shows a validation error when multi thresholds are out of order', () => {
    renderSection({
      alertConditions: [condition()],
      severity: {
        mode: 'multi',
        singleLevelSeverity: 'high',
        levels: [
          { id: 'l1', severity: 'low', threshold: 0.9 },
          { id: 'l2', severity: 'high', threshold: 0.8 },
        ],
      },
    });
    expect(screen.getByTestId('ruleBuilderSeverityValidationError')).toBeInTheDocument();
  });

  it('shows no validation error for a well-formed multi config', () => {
    renderSection({
      alertConditions: [condition()],
      severity: {
        mode: 'multi',
        singleLevelSeverity: 'high',
        levels: [
          { id: 'l1', severity: 'low', threshold: 0.8 },
          { id: 'l2', severity: 'high', threshold: 0.95 },
        ],
      },
    });
    expect(screen.queryByTestId('ruleBuilderSeverityValidationError')).not.toBeInTheDocument();
  });
});
