/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import type { RuleApiResponse } from '../../../services/rules_api';
import { RuleProvider } from '../rule_context';
import { RuleSidebar } from './rule_sidebar';

jest.mock('./rule_sidebar_conditions_tab', () => ({
  RuleSidebarConditionsTab: () => <div data-test-subj="mockConditionsTab" />,
}));

jest.mock('./rule_sidebar_preview_tab', () => ({
  RuleSidebarPreviewTab: () => <div data-test-subj="mockPreviewTab" />,
}));

jest.mock('./rule_sidebar_runbook_tab', () => ({
  RuleSidebarRunbookTab: () => <div data-test-subj="mockRunbookTab" />,
}));

const baseRule: RuleApiResponse = {
  id: 'rule-1',
  kind: 'signal',
  enabled: true,
  metadata: { name: 'Test Rule' },
  time_field: '@timestamp',
  schedule: { every: '5m', lookback: '10m' },
  query: { format: 'composed' as const, base: 'FROM logs-*', breach: { segment: '' } },
  createdBy: 'alice@example.com',
  createdAt: '2026-03-01T12:00:00.000Z',
  updatedBy: 'bob@example.com',
  updatedAt: '2026-03-04T12:00:00.000Z',
};

import type { RuleSidebarProps } from './rule_sidebar';

const renderSidebar = (props: RuleSidebarProps = {}) =>
  render(
    <I18nProvider>
      <RuleProvider rule={baseRule}>
        <RuleSidebar {...props} />
      </RuleProvider>
    </I18nProvider>
  );

describe('RuleSidebar', () => {
  it('renders two tabs by default (no query preview)', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebarTabGroup')).toBeInTheDocument();
    expect(screen.getByText('Conditions')).toBeInTheDocument();
    expect(screen.queryByText('Query preview')).not.toBeInTheDocument();
    expect(screen.getByText('Runbook')).toBeInTheDocument();
  });

  it('renders three tabs when showQueryPreview is true', () => {
    renderSidebar({ showQueryPreview: true });
    expect(screen.getByText('Conditions')).toBeInTheDocument();
    expect(screen.getByText('Query preview')).toBeInTheDocument();
    expect(screen.getByText('Runbook')).toBeInTheDocument();
  });

  it('shows conditions tab by default', () => {
    renderSidebar();
    expect(screen.getByTestId('mockConditionsTab')).toBeInTheDocument();
    expect(screen.queryByTestId('mockPreviewTab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mockRunbookTab')).not.toBeInTheDocument();
  });

  it('switches to query preview tab when clicked (showQueryPreview)', () => {
    renderSidebar({ showQueryPreview: true });
    fireEvent.click(screen.getByText('Query preview'));
    expect(screen.getByTestId('mockPreviewTab')).toBeInTheDocument();
    expect(screen.queryByTestId('mockConditionsTab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mockRunbookTab')).not.toBeInTheDocument();
  });

  it('switches to runbook tab when clicked', () => {
    renderSidebar();
    fireEvent.click(screen.getByText('Runbook'));
    expect(screen.getByTestId('mockRunbookTab')).toBeInTheDocument();
    expect(screen.queryByTestId('mockConditionsTab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mockPreviewTab')).not.toBeInTheDocument();
  });

  it('switches back to conditions from query preview', () => {
    renderSidebar({ showQueryPreview: true });
    fireEvent.click(screen.getByText('Query preview'));
    expect(screen.getByTestId('mockPreviewTab')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Conditions'));
    expect(screen.getByTestId('mockConditionsTab')).toBeInTheDocument();
    expect(screen.queryByTestId('mockPreviewTab')).not.toBeInTheDocument();
  });
});
