/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { RenderResult } from '@testing-library/react';
import { render } from '@testing-library/react';
import { RuleChangesDiff } from './changes_diff';
import type { RuleHistoryItem } from '../../../../../common/api/detection_engine/rule_management';
import type { RuleResponse } from '../../../../../common/api/detection_engine/model/rule_schema';
import { TestProviders } from '../../../../common/mock';

describe('RuleChangesDiff', () => {
  it('renders loading skeleton when isLoading is true', () => {
    const { getByTestId } = renderComponent({ isLoading: true });

    expect(getByTestId('ruleChangesHistoryDiffLoading')).toBeInTheDocument();
  });

  it('renders nothing-selected prompt when item is undefined', () => {
    const { getByTestId, getByText } = renderComponent({ item: undefined });

    expect(getByTestId('ruleChangesHistoryNothingSelected')).toBeInTheDocument();
    expect(getByText('Nothing to compare')).toBeInTheDocument();
  });

  it('renders no-visible-changes prompt when old_values contains only ignored fields (revision, updated_at)', () => {
    const item = createRuleChangeHistoryItem({
      action: 'rule_update',
      rule: { name: 'My Rule' } as RuleResponse,
      old_values: { revision: 1, updated_at: '2024-01-01T00:00:00.000Z' },
    });

    const { getByTestId, getByText } = renderComponent({ item });

    expect(getByTestId('ruleChangesHistoryNoChanges')).toBeInTheDocument();
    expect(getByText('No visible field changes')).toBeInTheDocument();
  });

  it('renders diff view in a panel for create action with no old_values', () => {
    const item = createRuleChangeHistoryItem({
      action: 'rule_create',
      rule: { name: 'New Rule' } as RuleResponse,
      old_values: null,
    });

    const { getByTestId, queryByTestId } = renderComponent({ item });

    expect(getByTestId('ruleChangesHistoryDiff')).toBeInTheDocument();
    expect(queryByTestId('ruleChangesHistoryNoDiffCallout')).not.toBeInTheDocument();
    expect(getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('New Rule');
  });

  it('renders no-diff callout with full rule state for update action with no old_values', () => {
    const item = createRuleChangeHistoryItem({
      action: 'rule_update',
      rule: { name: 'Updated Rule' } as RuleResponse,
      old_values: null,
    });

    const { getByTestId } = renderComponent({ item });

    expect(getByTestId('ruleChangesHistoryNoDiffCallout')).toBeInTheDocument();
    expect(getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('Updated Rule');
  });

  it('renders no-diff callout for rule_import action with no old_values', () => {
    const item = createRuleChangeHistoryItem({
      action: 'rule_import',
      rule: { name: 'Imported Rule' } as RuleResponse,
      old_values: null,
    });

    const { getByTestId } = renderComponent({ item });

    expect(getByTestId('ruleChangesHistoryNoDiffCallout')).toBeInTheDocument();
  });

  it('renders no-diff callout for rule_revert action with no old_values', () => {
    const item = createRuleChangeHistoryItem({
      action: 'rule_revert',
      rule: { name: 'Reverted Rule' } as RuleResponse,
      old_values: null,
    });

    const { getByTestId } = renderComponent({ item });

    expect(getByTestId('ruleChangesHistoryNoDiffCallout')).toBeInTheDocument();
  });

  it('renders diff view in panel for update action with user-visible changed fields', () => {
    const item = createRuleChangeHistoryItem({
      action: 'rule_update',
      rule: { name: 'New Name', severity: 'high' } as RuleResponse,
      old_values: { name: 'Old Name' },
    });

    const { getByTestId, queryByTestId } = renderComponent({ item });

    expect(getByTestId('ruleChangesHistoryDiff')).toBeInTheDocument();
    expect(queryByTestId('ruleChangesHistoryNoDiffCallout')).not.toBeInTheDocument();
    expect(getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('Old Name');
    expect(getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('New Name');
  });

  it('shows added field in diff when old_values marks it as absent before the change', () => {
    const item = createRuleChangeHistoryItem({
      action: 'rule_update',
      rule: { name: 'Rule', note: 'added note' } as RuleResponse,
      old_values: { note: null },
    });

    const { getByTestId } = renderComponent({ item });

    expect(getByTestId('ruleChangesHistoryDiff')).toHaveTextContent('added note');
  });

  it('renders loading state and ignores item when isLoading is true', () => {
    const item = createRuleChangeHistoryItem({ action: 'rule_create' });

    const { getByTestId, queryByTestId } = renderComponent({ item, isLoading: true });

    expect(getByTestId('ruleChangesHistoryDiffLoading')).toBeInTheDocument();
    expect(queryByTestId('ruleChangesHistoryDiff')).not.toBeInTheDocument();
  });
});

function createRuleChangeHistoryItem(overrides: Partial<RuleHistoryItem> = {}): RuleHistoryItem {
  return {
    id: 'item-1',
    timestamp: '2025-01-01T00:00:00.000Z',
    action: 'rule_create',
    rule: {} as RuleResponse,
    old_values: null,
    ...overrides,
  };
}

function renderComponent({
  item,
  isLoading,
}: {
  item?: RuleHistoryItem;
  isLoading?: boolean;
}): RenderResult {
  return render(
    <TestProviders>
      <RuleChangesDiff item={item} isLoading={isLoading} />
    </TestProviders>
  );
}
